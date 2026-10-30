import {
  collection,
  doc,
  runTransaction,
  type DocumentData,
  type Transaction,
} from "firebase/firestore";
import { fbAuth, fbDb } from "./firebase";
import { CLOUD_COMPANY_ID, type CloudRecord } from "./cloud-data";
import type { DairyProductType } from "./cloud-catalog";

export type ProductionArea = "liquid_milk" | "powder_milk";
export type FormulaMaterialType = "ingredient" | "packaging";
export type FormulaVersionStatus = "draft" | "approved";

export interface FormulaMaterial {
  productId: string;
  quantity: number;
  unit: string;
  materialType: FormulaMaterialType;
}

export interface FormulaVersionMaterial extends FormulaMaterial {
  productName: string;
  productType: DairyProductType;
  standardCost: number;
}

export interface ProductionFormula extends CloudRecord {
  code: string;
  name: string;
  area: ProductionArea;
  outputProductId: string;
  description: string;
  currentVersion: number;
  active: boolean;
}

export interface ProductionFormulaVersion extends CloudRecord {
  formulaId: string;
  version: number;
  outputQuantity: number;
  outputUnit: string;
  materials: FormulaVersionMaterial[];
  status: FormulaVersionStatus;
  approvedBy?: string;
  approvedAt?: number;
  changeReason: string;
}

export interface ProductionOrderSnapshotMaterial extends FormulaVersionMaterial {
  requiredQuantity: number;
}

export interface CloudProductionOrder extends CloudRecord {
  formulaId: string;
  formulaVersionId: string;
  formulaCode: string;
  formulaName: string;
  formulaVersion: number;
  area: ProductionArea;
  outputProductId: string;
  outputProductName: string;
  targetQuantity: number;
  outputUnit: string;
  materials: ProductionOrderSnapshotMaterial[];
  warehouseId: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  notes: string;
  idempotencyKey: string;
}

function requireProductionUser() {
  const user = fbAuth().currentUser;
  if (!user) throw new Error("Debes iniciar sesión para gestionar producción.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No hay conexión. Las operaciones de producción requieren confirmación del servidor.");
  }
  return user;
}

function ref(collectionName: string, id: string) {
  return doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, collectionName), id);
}

async function stableId(value: string, scope: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}:${value.trim()}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requiredText(value: string, label: string, max = 120) {
  const result = value.trim();
  if (!result) throw new Error(`El campo ${label} es obligatorio.`);
  if (result.length > max) throw new Error(`El campo ${label} supera ${max} caracteres.`);
  return result;
}

function validateFormulaInput(input: {
  name: string;
  area: ProductionArea;
  outputProductId: string;
  outputQuantity: number;
  outputUnit: string;
  materials: FormulaMaterial[];
  changeReason?: string;
}) {
  if (!["liquid_milk", "powder_milk"].includes(input.area)) {
    throw new Error("El área de producción no es válida.");
  }
  if (!Number.isFinite(input.outputQuantity) || input.outputQuantity <= 0) {
    throw new Error("El rendimiento de la fórmula debe ser mayor que cero.");
  }
  if (!Array.isArray(input.materials) || input.materials.length === 0) {
    throw new Error("Agrega al menos un ingrediente o material de empaque.");
  }
  const outputProductId = requiredText(input.outputProductId, "producto terminado", 128);
  const seen = new Set<string>();
  const materials = input.materials.map((material) => {
    const productId = requiredText(material.productId, "producto", 128);
    if (productId === outputProductId) throw new Error("El producto terminado no puede ser material de su propia fórmula.");
    if (seen.has(productId)) throw new Error("Un producto no puede repetirse en la misma fórmula.");
    seen.add(productId);
    if (!Number.isFinite(material.quantity) || material.quantity <= 0) {
      throw new Error("Todas las cantidades de la fórmula deben ser mayores que cero.");
    }
    if (!["ingredient", "packaging"].includes(material.materialType)) {
      throw new Error("El tipo de material no es válido.");
    }
    return {
      productId,
      quantity: material.quantity,
      unit: requiredText(material.unit, "unidad", 16),
      materialType: material.materialType,
    };
  });
  return {
    name: requiredText(input.name, "nombre"),
    area: input.area,
    outputProductId,
    outputQuantity: input.outputQuantity,
    outputUnit: requiredText(input.outputUnit, "unidad de rendimiento", 16),
    materials,
    changeReason: input.changeReason?.trim() || "Versión inicial",
  };
}

function audit(userId: string, now: number) {
  return {
    companyId: CLOUD_COMPANY_ID,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
    revision: 1,
    deleted: false,
  };
}

async function validateFormulaProducts(
  transaction: Transaction,
  input: ReturnType<typeof validateFormulaInput>,
) {
  const productIds = [input.outputProductId, ...input.materials.map((item) => item.productId)];
  const snapshots = await Promise.all(productIds.map((id) => transaction.get(ref("products", id))));
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const output = byId.get(input.outputProductId);
  if (!output?.exists() || output.data().deleted === true || output.data().active === false
    || output.data().productType !== "finished_product"
    || output.data().trackInventory === false) {
    throw new Error("El producto de salida debe ser un producto terminado activo.");
  }
  if (String(output.data().baseUnit) !== input.outputUnit) {
    throw new Error("La unidad de rendimiento debe coincidir con la unidad base del producto terminado.");
  }

  for (const material of input.materials) {
    const snapshot = byId.get(material.productId);
    if (!snapshot?.exists() || snapshot.data().deleted === true || snapshot.data().active === false) {
      throw new Error("Todos los ingredientes y materiales deben estar activos.");
    }
    if (snapshot.data().trackInventory === false) {
      throw new Error("Todos los ingredientes y materiales deben tener control de inventario.");
    }
    const productType = snapshot.data().productType;
    if (!Number.isFinite(Number(snapshot.data().standardCost ?? 0)) || Number(snapshot.data().standardCost ?? 0) < 0) {
      throw new Error(`El costo estándar de ${String(snapshot.data().name)} no es válido.`);
    }
    if (material.materialType === "ingredient" && !["raw_material", "finished_product"].includes(String(productType))) {
      throw new Error("Los ingredientes deben ser materias primas o productos intermedios.");
    }
    if (material.materialType === "packaging" && productType !== "packaging") {
      throw new Error("Los materiales de empaque deben estar clasificados como empaque.");
    }
    if (String(snapshot.data().baseUnit) !== material.unit) {
      throw new Error(`La unidad de ${String(snapshot.data().name)} debe coincidir con su unidad base.`);
    }
  }
  return {
    outputName: String(output.data().name),
    materials: input.materials.map((material) => ({
      ...material,
      productName: String(byId.get(material.productId)?.data().name ?? ""),
      productType: String(byId.get(material.productId)?.data().productType) as DairyProductType,
      standardCost: Number(byId.get(material.productId)?.data().standardCost ?? 0),
    })),
  };
}

export async function createProductionFormula(input: {
  code: string;
  name: string;
  area: ProductionArea;
  outputProductId: string;
  description?: string;
  outputQuantity: number;
  outputUnit: string;
  materials: FormulaMaterial[];
}): Promise<string> {
  const user = requireProductionUser();
  const data = validateFormulaInput(input);
  const code = requiredText(input.code, "código", 40).toUpperCase();
  const formulaId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = Date.now();
  const codeKey = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code.toLocaleLowerCase("es")),
  )), (byte) => byte.toString(16).padStart(2, "0")).join("");

  await runTransaction(fbDb(), async (transaction) => {
    const codeIndexRef = ref("productionFormulaCodeIndexes", codeKey);
    const [indexSnapshot, productData] = await Promise.all([
      transaction.get(codeIndexRef),
      validateFormulaProducts(transaction, data),
    ]);
    if (indexSnapshot.exists()) throw new Error("Ya existe una fórmula con ese código.");

    const formula: DocumentData = {
      ...audit(user.uid, now),
      id: formulaId,
      code,
      name: data.name,
      area: data.area,
      outputProductId: data.outputProductId,
      outputProductName: productData.outputName,
      description: input.description?.trim() ?? "",
      currentVersion: 1,
      active: true,
    };
    const version: DocumentData = {
      ...audit(user.uid, now),
      id: versionId,
      formulaId,
      version: 1,
      outputQuantity: data.outputQuantity,
      outputUnit: data.outputUnit,
      materials: productData.materials,
      status: "draft",
      changeReason: "Versión inicial",
    };
    transaction.set(ref("productionFormulas", formulaId), formula);
    transaction.set(ref("productionFormulaVersions", versionId), version);
    transaction.set(codeIndexRef, { formulaId, code, createdAt: now });
  });
  return formulaId;
}

export async function createProductionFormulaVersion(input: {
  formulaId: string;
  expectedFormulaRevision: number;
  outputQuantity: number;
  outputUnit: string;
  materials: FormulaMaterial[];
  changeReason: string;
}): Promise<string> {
  const user = requireProductionUser();
  const data = validateFormulaInput({
    name: "Versión",
    area: "liquid_milk",
    outputProductId: "pending",
    outputQuantity: input.outputQuantity,
    outputUnit: input.outputUnit,
    materials: input.materials,
    changeReason: input.changeReason,
  });
  const versionId = crypto.randomUUID();
  const now = Date.now();

  await runTransaction(fbDb(), async (transaction) => {
    const formulaRef = ref("productionFormulas", input.formulaId);
    const formulaSnapshot = await transaction.get(formulaRef);
    if (!formulaSnapshot.exists() || formulaSnapshot.data().deleted === true || formulaSnapshot.data().active === false) {
      throw new Error("La fórmula no existe o está inactiva.");
    }
    const formula = formulaSnapshot.data();
    if (Number(formula.revision ?? 1) !== input.expectedFormulaRevision) {
      throw new Error("La fórmula fue modificada por otro usuario. Actualiza antes de crear la versión.");
    }
    const validationInput = {
      ...data,
      name: String(formula.name),
      area: formula.area as ProductionArea,
      outputProductId: String(formula.outputProductId),
    };
    const productData = await validateFormulaProducts(transaction, validationInput);
    const nextVersion = Number(formula.currentVersion ?? 1) + 1;
    transaction.set(ref("productionFormulaVersions", versionId), {
      ...audit(user.uid, now),
      id: versionId,
      formulaId: input.formulaId,
      version: nextVersion,
      outputQuantity: data.outputQuantity,
      outputUnit: data.outputUnit,
      materials: productData.materials,
      status: "draft",
      changeReason: requiredText(input.changeReason, "motivo del cambio", 500),
    });
    transaction.update(formulaRef, {
      currentVersion: nextVersion,
      outputProductName: productData.outputName,
      updatedAt: now,
      updatedBy: user.uid,
      revision: input.expectedFormulaRevision + 1,
    });
  });
  return versionId;
}

export async function approveProductionFormulaVersion(input: {
  formulaId: string;
  versionId: string;
  expectedRevision: number;
}): Promise<void> {
  const user = requireProductionUser();
  const formulaRef = ref("productionFormulas", input.formulaId);
  const versionRef = ref("productionFormulaVersions", input.versionId);
  await runTransaction(fbDb(), async (transaction) => {
    const [formulaSnapshot, versionSnapshot] = await Promise.all([
      transaction.get(formulaRef),
      transaction.get(versionRef),
    ]);
    if (!formulaSnapshot.exists() || formulaSnapshot.data().active !== true) {
      throw new Error("La fórmula no existe o está inactiva.");
    }
    if (!versionSnapshot.exists() || versionSnapshot.data().formulaId !== input.formulaId) {
      throw new Error("La versión no pertenece a esta fórmula.");
    }
    const version = versionSnapshot.data();
    if (version.status !== "draft") throw new Error("Solo se pueden aprobar versiones en borrador.");
    if (Number(version.version) !== Number(formulaSnapshot.data().currentVersion)) {
      throw new Error("Solo se puede aprobar la versión más reciente de la fórmula.");
    }
    if (Number(version.revision ?? 1) !== input.expectedRevision) {
      throw new Error("La versión cambió en otro equipo. Actualiza antes de aprobar.");
    }
    transaction.update(versionRef, {
      status: "approved",
      approvedBy: user.uid,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: input.expectedRevision + 1,
    });
  });
}

export async function createCloudProductionOrder(input: {
  formulaId: string;
  formulaVersionId: string;
  warehouseId: string;
  targetQuantity: number;
  notes?: string;
  idempotencyKey: string;
}): Promise<string> {
  const user = requireProductionUser();
  if (!Number.isFinite(input.targetQuantity) || input.targetQuantity <= 0) {
    throw new Error("La cantidad a producir debe ser mayor que cero.");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
    throw new Error("Debes enviar una clave única de operación de hasta 128 caracteres.");
  }
  const orderId = await stableId(input.idempotencyKey, "productionOrder");
  const now = Date.now();

  await runTransaction(fbDb(), async (transaction) => {
    const orderRef = ref("productionOrders", orderId);
    const formulaRef = ref("productionFormulas", input.formulaId);
    const versionRef = ref("productionFormulaVersions", input.formulaVersionId);
    const warehouseRef = ref("organizationUnits", input.warehouseId);
    const [existingOrder, formulaSnapshot, versionSnapshot, warehouseSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(formulaRef),
      transaction.get(versionRef),
      transaction.get(warehouseRef),
    ]);
    if (existingOrder.exists()) {
      const existing = existingOrder.data();
      const sameOrder = existing.formulaId === input.formulaId
        && existing.formulaVersionId === input.formulaVersionId
        && existing.warehouseId === input.warehouseId
        && existing.targetQuantity === input.targetQuantity
        && existing.notes === (input.notes?.trim() ?? "");
      if (!sameOrder) throw new Error("La clave de operación ya fue utilizada para otra orden.");
      return;
    }

    if (!formulaSnapshot.exists() || formulaSnapshot.data().active !== true) {
      throw new Error("La fórmula no existe o está inactiva.");
    }
    if (!versionSnapshot.exists()
      || versionSnapshot.data().formulaId !== input.formulaId
      || versionSnapshot.data().status !== "approved") {
      throw new Error("Selecciona una versión aprobada de la fórmula.");
    }
    if (!warehouseSnapshot.exists()
      || warehouseSnapshot.data().type !== "warehouse"
      || warehouseSnapshot.data().active !== true) {
      throw new Error("Selecciona una bodega activa.");
    }

    const formula = formulaSnapshot.data();
    const version = versionSnapshot.data();
    const outputProductRef = ref("products", String(formula.outputProductId));
    const outputProductSnapshot = await transaction.get(outputProductRef);
    if (!outputProductSnapshot.exists()
      || outputProductSnapshot.data().active !== true
      || outputProductSnapshot.data().productType !== "finished_product"
      || outputProductSnapshot.data().trackInventory === false
      || String(outputProductSnapshot.data().baseUnit) !== String(version.outputUnit)) {
      throw new Error("El producto terminado de la fórmula no está activo o su unidad cambió.");
    }
    const versionMaterials = version.materials as FormulaVersionMaterial[];
    const materialSnapshots = await Promise.all(
      versionMaterials.map((material) => transaction.get(ref("products", material.productId))),
    );
    for (let index = 0; index < materialSnapshots.length; index++) {
      const materialProduct = materialSnapshots[index];
      if (!materialProduct?.exists()
        || materialProduct.data().active !== true
        || materialProduct.data().deleted === true
        || materialProduct.data().trackInventory === false
        || materialProduct.data().productType !== versionMaterials[index]?.productType
        || String(materialProduct.data().baseUnit) !== versionMaterials[index]?.unit) {
        throw new Error(`El material ${versionMaterials[index]?.productName ?? ""} ya no está disponible o su configuración cambió.`);
      }
    }
    const factor = input.targetQuantity / Number(version.outputQuantity);
    const materials = versionMaterials.map((material) => ({
      ...material,
      requiredQuantity: material.quantity * factor,
    }));
    const order: DocumentData = {
      ...audit(user.uid, now),
      id: orderId,
      formulaId: input.formulaId,
      formulaVersionId: input.formulaVersionId,
      formulaCode: String(formula.code),
      formulaName: String(formula.name),
      formulaVersion: Number(version.version),
      area: formula.area,
      outputProductId: String(formula.outputProductId),
      outputProductName: String(outputProductSnapshot.data().name),
      targetQuantity: input.targetQuantity,
      outputUnit: String(version.outputUnit),
      materials,
      warehouseId: input.warehouseId,
      status: "draft",
      notes: input.notes?.trim() ?? "",
      idempotencyKey: input.idempotencyKey,
    };
    transaction.set(orderRef, order);
  });
  return orderId;
}
