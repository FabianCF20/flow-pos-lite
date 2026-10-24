import "fake-indexeddb/auto";
import { beforeEach, afterAll, expect, test } from "vitest";
import { db, type Measure } from "./db";
import { saveMeasure, saveRecipe, createProductionOrder, completeProductionOrder, convertQuantity } from "./production";

beforeEach(async () => { for (const table of db.tables) await table.clear(); });
afterAll(() => db.close());

async function measures() {
  const bag = await saveMeasure({ name: "Bolsa de leche", symbol: "bolsa", group: "Leche", factor: 1 });
  const pack = await saveMeasure({ name: "Six pack", symbol: "six", group: "Leche", factor: 1, referenceMeasureId: bag, referenceQty: 6 });
  const basket = await saveMeasure({ name: "Canasta", symbol: "canasta", group: "Leche", factor: 1, referenceMeasureId: pack, referenceQty: 5 });
  const rows = await db.measures.toArray();
  const get = (id: number): Measure => { const row = rows.find(m => m.id === id); if (!row) throw new Error("Missing measure"); return row; };
  return { bag, pack, basket, get };
}

test("one six pack equals six milk bags", async () => {
  const m = await measures();
  expect(convertQuantity(1, m.get(m.pack), m.get(m.bag))).toBe(6);
});
test("one basket equals thirty milk bags", async () => {
  const m = await measures();
  expect(convertQuantity(1, m.get(m.basket), m.get(m.bag))).toBe(30);
});
test("one basket equals five six packs", async () => {
  const m = await measures();
  expect(convertQuantity(1, m.get(m.basket), m.get(m.pack))).toBe(5);
});
test("referenced conversions cannot change and cycles are rejected", async () => {
  const m = await measures();
  await expect(saveMeasure({ ...m.get(m.pack), referenceQty: 7 })).rejects.toThrow("Medida en uso");
  await expect(saveMeasure({ ...m.get(m.bag), referenceMeasureId: m.basket, referenceQty: 1 })).rejects.toThrow("sí misma");
});
test("producing two baskets consumes sixty bags and posts once", async () => {
  const m = await measures();
  const warehouseId = await db.warehouses.add({ name: "Principal", isDefault: true, createdAt: 1 });
  const productId = await db.products.add({ name: "Leche empacada", measureId: m.bag, stock: 0, price: 5000, cost: 0, active: true, trackStock: true, createdAt: 1 });
  const materialId = await db.products.add({ name: "Bolsa de leche", measureId: m.bag, stock: 100, price: 4000, cost: 2000, active: true, trackStock: true, createdAt: 1 });
  const recipeId = await saveRecipe({ name: "Empaque", productId, outputQty: 1, outputMeasureId: m.pack, materials: [{ productId: materialId, qty: 6, measureId: m.bag }], updatedAt: 1 });
  const id = await createProductionOrder({ recipeId, qty: 2, outputMeasureId: m.basket, warehouseId });
  expect((await db.productionOrders.get(id))?.materials[0]?.stockQty).toBe(60);
  await completeProductionOrder(id);
  expect((await db.products.get(materialId))?.stock).toBe(40);
  expect((await db.products.get(productId))?.stock).toBe(60);
  expect((await db.productionOrders.get(id))?.totalCost).toBe(120000);
  await expect(completeProductionOrder(id)).rejects.toThrow("procesada");
  expect(await db.stockMoves.where("refType").equals("production").count()).toBe(2);
});
test("insufficient materials leave all stock and order unchanged", async () => {
  const m = await measures();
  const warehouseId = await db.warehouses.add({ name: "Principal", isDefault: true, createdAt: 1 });
  const productId = await db.products.add({ name: "Terminado", measureId: m.bag, stock: 0, price: 1, active: true, trackStock: true, createdAt: 1 });
  const materialId = await db.products.add({ name: "Leche", measureId: m.bag, stock: 29, price: 1, active: true, trackStock: true, createdAt: 1 });
  const recipeId = await saveRecipe({ name: "Lote", productId, outputQty: 1, outputMeasureId: m.pack, materials: [{ productId: materialId, qty: 6, measureId: m.bag }], updatedAt: 1 });
  const id = await createProductionOrder({ recipeId, qty: 1, outputMeasureId: m.basket, warehouseId });
  await expect(completeProductionOrder(id)).rejects.toThrow("insuficiente");
  expect((await db.products.get(materialId))?.stock).toBe(29);
  expect((await db.products.get(productId))?.stock).toBe(0);
  expect((await db.productionOrders.get(id))?.status).toBe("draft");
  expect(await db.stockMoves.count()).toBe(0);
});