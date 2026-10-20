import { db, type Measure, type ProductionRecipe, type ProductionOrder, type Product } from "./db";
import { addStockMove, warehouseStock } from "./erp";

const round = (n: number) => Math.round(n * 1e8) / 1e8;
function positive(n: number, label: string) {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} debe ser mayor que cero`);
}

export function convertQuantity(qty: number, from: Measure, to: Measure): number {
  positive(qty, "Cantidad");
  positive(from.factor, "Equivalencia");
  positive(to.factor, "Equivalencia");
  if (from.group !== to.group) throw new Error(`Medidas incompatibles: ${from.symbol} y ${to.symbol}`);
  return round(qty * from.factor / to.factor);
}

export async function ensureDefaultMeasure() {
  return db.transaction("rw", db.measures, async () => {
    const unit = await db.measures.where("symbol").equals("u").first();
    if (unit?.id !== undefined) return unit.id;
    return db.measures.add({ name: "Unidad", symbol: "u", group: "Conteo", factor: 1 });
  });
}

async function measureFor(product: Product): Promise<Measure> {
  const measure = product.measureId !== undefined
    ? await db.measures.get(product.measureId)
    : await db.measures.where("symbol").equals("u").first();
  if (!measure) throw new Error(`Asigna una medida a ${product.name}`);
  return measure;
}

export async function saveMeasure(input: Measure) {
  const data = { ...input, name: input.name.trim(), symbol: input.symbol.trim(), group: input.group.trim() };
  if (!data.name || !data.symbol || !data.group) throw new Error("Completa nombre, símbolo y grupo");
  positive(data.factor, "Equivalencia");
  return db.transaction("rw", [db.measures, db.products, db.productionRecipes, db.productionOrders], async () => {
    const duplicate = (await db.measures.toArray()).find(m => m.id !== data.id && m.symbol.toLowerCase() === data.symbol.toLowerCase());
    if (duplicate) throw new Error("Este símbolo ya existe");
    if (data.id !== undefined) {
      const old = await db.measures.get(data.id);
      if (!old) throw new Error("Medida no encontrada");
      if (old.symbol === "u" && (data.symbol !== "u" || data.group !== old.group || data.factor !== 1)) throw new Error("La unidad original conserva su símbolo y equivalencia");
      if (old.group !== data.group || old.factor !== data.factor) {
        const used = (await db.products.toArray()).some(p => p.measureId === data.id)
          || (await db.productionRecipes.toArray()).some(r => r.outputMeasureId === data.id || r.materials.some(m => m.measureId === data.id));
        if (used) throw new Error("Medida en uso: crea otra equivalencia para conservar el inventario");
      }
      await db.measures.put(data);
      return data.id;
    }
    return db.measures.add(data);
  });
}

export async function assertProductMeasureChange(product: Product | null, measureId: number | undefined) {
  if (!product || product.measureId === measureId) return;
  const baseId = (await db.measures.where("symbol").equals("u").first())?.id;
  if ((product.measureId ?? baseId) === (measureId ?? baseId)) return;
  const referenced = (await db.productionRecipes.toArray()).some(r => r.productId === product.id || r.materials.some(m => m.productId === product.id));
  if (product.stock !== 0 || referenced) throw new Error("No cambies la medida de un producto con existencias o fórmulas; crea otro producto");
}

async function recipeSnapshot(recipe: ProductionRecipe, qty: number) {
  positive(recipe.outputQty, "Rendimiento");
  positive(qty, "Cantidad a producir");
  const output = await db.products.get(recipe.productId);
  const outputMeasure = await db.measures.get(recipe.outputMeasureId);
  if (!output?.active || !output.trackStock || !outputMeasure) throw new Error("Selecciona un producto terminado activo con inventario y medida");
  if (!recipe.materials.length) throw new Error("Agrega al menos un material");
  const stockMeasure = await measureFor(output);
  const stockQty = convertQuantity(qty, outputMeasure, stockMeasure);
  if (stockQty <= 0) throw new Error("Cantidad demasiado pequeña");
  const seen = new Set<number>();
  const materials = [];
  for (const item of recipe.materials) {
    if (item.productId === recipe.productId) throw new Error("El producto terminado no puede ser su propio material");
    if (seen.has(item.productId)) throw new Error("Un material no puede repetirse");
    seen.add(item.productId);
    const product = await db.products.get(item.productId);
    const measure = await db.measures.get(item.measureId);
    if (!product?.active || !product.trackStock || !measure) throw new Error("Selecciona materiales activos con inventario y medida");
    positive(item.qty, "Cantidad del material");
    const base = await measureFor(product);
    const amount = round(item.qty * qty / recipe.outputQty);
    const required = convertQuantity(amount, measure, base);
    if (required <= 0) throw new Error("Cantidad de material demasiado pequeña");
    if (!Number.isFinite(product.cost ?? 0) || (product.cost ?? 0) < 0) throw new Error(`Costo inválido: ${product.name}`);
    materials.push({ productId: item.productId, name: product.name, qty: amount, measure: measure.symbol, stockQty: required, stockMeasure: base.symbol, unitCost: product.cost ?? 0 });
  }
  return { productId: recipe.productId, productName: output.name, qty, measure: outputMeasure.symbol, stockQty, stockMeasure: stockMeasure.symbol, materials, totalCost: round(materials.reduce((sum, m) => sum + m.stockQty * m.unitCost, 0)) };
}

export async function saveRecipe(recipe: ProductionRecipe) {
  return db.transaction("rw", [db.productionRecipes, db.products, db.measures], async () => {
    if (!recipe.name.trim()) throw new Error("Nombre de fórmula obligatorio");
    await recipeSnapshot(recipe, recipe.outputQty);
    return db.productionRecipes.put({ ...recipe, name: recipe.name.trim(), updatedAt: Date.now() });
  });
}

export async function createProductionOrder(input: { recipeId: number; qty: number; warehouseId: number; notes?: string; userId?: number; userName?: string }) {
  return db.transaction("rw", [db.productionOrders, db.productionRecipes, db.products, db.measures, db.warehouses], async () => {
    const recipe = await db.productionRecipes.get(input.recipeId);
    if (!recipe) throw new Error("Fórmula no encontrada");
    if (!(await db.warehouses.get(input.warehouseId))) throw new Error("Selecciona una bodega");
    const snapshot = await recipeSnapshot(recipe, input.qty);
    return db.productionOrders.add({ ...input, ...snapshot, recipeName: recipe.name, status: "draft", createdAt: Date.now() });
  });
}

export async function completeProductionOrder(id: number) {
  return db.transaction("rw", [db.productionOrders, db.products, db.stockMoves, db.warehouses], async () => {
    const order = await db.productionOrders.get(id);
    if (!order || order.status !== "draft") throw new Error("La orden ya fue procesada o cancelada");
    if (!(await db.warehouses.get(order.warehouseId))) throw new Error("Bodega no encontrada");
    const output = await db.products.get(order.productId);
    if (!output?.active || !output.trackStock) throw new Error("Producto terminado no disponible");
    const costs = [];
    for (const m of order.materials) {
      const p = await db.products.get(m.productId);
      if (!p?.active || !p.trackStock) throw new Error(`Material no disponible: ${m.name}`);
      if (!Number.isFinite(p.cost ?? 0) || (p.cost ?? 0) < 0) throw new Error(`Costo inválido: ${m.name}`);
      const moves = await db.stockMoves.where("productId").equals(m.productId).toArray();
      const balance = await warehouseStock(m.productId, order.warehouseId);
      // Existencias históricas sin kardex pertenecen a la bodega principal.
      const warehouses = await db.warehouses.toArray();
      const main = warehouses.find(w => w.isDefault) ?? warehouses[0];
      const available = moves.length ? balance : main?.id === order.warehouseId ? p.stock : 0;
      if (!Number.isFinite(p.stock) || p.stock + 1e-8 < m.stockQty || available + 1e-8 < m.stockQty) throw new Error(`Inventario insuficiente: ${m.name} (disponible ${Math.max(0, Math.min(p.stock, available))} ${m.stockMeasure}; requiere ${m.stockQty})`);
      if (!moves.length && available > 0) {
        await addStockMove({ productId: m.productId, productName: p.name, warehouseId: order.warehouseId, type: "adjust", qty: available, refType: "adjust", note: "Saldo inicial previo a producción" });
      }
      costs.push({ ...m, unitCost: p.cost ?? 0 });
    }
    const totalCost = round(costs.reduce((s, m) => s + m.stockQty * m.unitCost, 0));
    for (const m of costs) {
      const p = await db.products.get(m.productId);
      if (!p) throw new Error("Material no encontrado");
      await db.products.update(m.productId, { stock: round(p.stock - m.stockQty) });
      await addStockMove({ productId: m.productId, productName: m.name, warehouseId: order.warehouseId, type: "out", qty: m.stockQty, unitCost: m.unitCost, refType: "production", refId: id, userId: order.userId, note: `Producción #${id} · Consumo` });
    }
    const outputMoves = await db.stockMoves.where("productId").equals(order.productId).count();
    if (!outputMoves && output.stock > 0) {
      const whs = await db.warehouses.toArray();
      const main = whs.find(w => w.isDefault) ?? whs[0];
      if (main?.id !== undefined) await addStockMove({ productId: order.productId, productName: output.name, warehouseId: main.id, type: "adjust", qty: output.stock, refType: "adjust", note: "Saldo inicial previo a producción" });
    }
    const newStock = round(output.stock + order.stockQty);
    const newCost = output.stock > 0 ? (output.stock * (output.cost ?? 0) + totalCost) / newStock : totalCost / order.stockQty;
    await db.products.update(order.productId, { stock: newStock, cost: round(newCost) });
    await addStockMove({ productId: order.productId, productName: order.productName, warehouseId: order.warehouseId, type: "in", qty: order.stockQty, unitCost: totalCost / order.stockQty, refType: "production", refId: id, userId: order.userId, note: `Producción #${id} · Terminado` });
    await db.productionOrders.update(id, { status: "completed", totalCost, materials: costs, completedAt: Date.now() });
  });
}

export async function cancelProductionOrder(id: number) {
  return db.transaction("rw", db.productionOrders, async () => {
    const order = await db.productionOrders.get(id);
    if (!order || order.status !== "draft") throw new Error("Solo se pueden cancelar órdenes pendientes");
    await db.productionOrders.update(id, { status: "cancelled" });
  });
}

export function orderLabel(order: ProductionOrder) {
  return order.status === "completed" ? "Completada" : order.status === "cancelled" ? "Cancelada" : "Pendiente";
}