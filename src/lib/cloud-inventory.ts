import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  where,
  type DocumentData,
} from "firebase/firestore";
import { fbAuth, fbDb } from "./firebase";
import { CLOUD_COMPANY_ID, type CloudRecord } from "./cloud-data";

export type InventoryMovementType = "receipt" | "issue" | "adjustment" | "transfer_in" | "transfer_out";
type ManualInventoryMovementType = "receipt" | "issue" | "adjustment";

export interface InventoryBalance extends CloudRecord {
  productId: string;
  warehouseId: string;
  quantity: number;
  baseUnit: string;
  lotCode: string;
  expiryDate?: number;
}

export interface InventoryMovement extends CloudRecord {
  productId: string;
  warehouseId: string;
  lotCode: string;
  expiryDate?: number;
  type: InventoryMovementType;
  quantityDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  baseUnit: string;
  unitCost?: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey: string;
}

export interface InventoryWarehouse extends CloudRecord {
  code: string;
  name: string;
  type: "warehouse";
  parentId: string | null;
  active: boolean;
}

function requireOnlineUser() {
  const user = fbAuth().currentUser;
  if (!user) throw new Error("Debes iniciar sesión para operar inventario.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No hay conexión. Los movimientos de inventario requieren confirmación del servidor.");
  }
  return user;
}

function reference(collectionName: string, id: string) {
  return doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, collectionName), id);
}

async function balanceDocumentId(productId: string, warehouseId: string, lotCode = "NO_LOT") {
  const value = new TextEncoder().encode(`${productId}:${warehouseId}:${lotCode.trim().toUpperCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function listInventoryBalances(warehouseId?: string): Promise<InventoryBalance[]> {
  requireOnlineUser();
  const base = collection(fbDb(), "erp", CLOUD_COMPANY_ID, "inventoryBalances");
  const snapshot = await getDocsFromServer(
    warehouseId ? query(base, where("warehouseId", "==", warehouseId)) : query(base),
  );
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as InventoryBalance)
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export async function listInventoryMovements(warehouseId: string): Promise<InventoryMovement[]> {
  requireOnlineUser();
  const snapshot = await getDocsFromServer(query(
    collection(fbDb(), "erp", CLOUD_COMPANY_ID, "inventoryMovements"),
    where("warehouseId", "==", warehouseId),
  ));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as InventoryMovement)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Registra un movimiento y actualiza su saldo en una sola transacción.
 * El movimiento histórico es inmutable y nunca se descuenta stock desde la ficha del producto.
 */
export async function postInventoryMovement(input: {
  productId: string;
  warehouseId: string;
  lotCode: string;
  expiryDate?: number;
  type: ManualInventoryMovementType;
  quantity: number;
  unitCost?: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey: string;
}): Promise<string> {
  const user = requireOnlineUser();
  if (!Number.isFinite(input.quantity)
    || (input.type === "adjustment" ? input.quantity === 0 : input.quantity <= 0)) {
    throw new Error(input.type === "adjustment"
      ? "El ajuste debe ser distinto de cero."
      : "La cantidad debe ser mayor que cero.");
  }
  if (!input.reason.trim()) throw new Error("Debes indicar el motivo del movimiento.");
  if (!input.lotCode.trim()) throw new Error("Debes indicar el lote del producto.");
  if (input.expiryDate !== undefined && (!Number.isFinite(input.expiryDate) || input.expiryDate <= 0)) {
    throw new Error("La fecha de vencimiento no es válida.");
  }
  if (input.unitCost !== undefined && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) {
    throw new Error("El costo unitario no puede ser negativo.");
  }

  const productRef = reference("products", input.productId);
  const warehouseRef = reference("organizationUnits", input.warehouseId);
  const lotCode = input.lotCode.trim().toUpperCase();
  const balanceId = await balanceDocumentId(input.productId, input.warehouseId, lotCode);
  const balanceRef = reference("inventoryBalances", balanceId);
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
    throw new Error("Debes enviar una clave única de operación de hasta 128 caracteres.");
  }
  const movementId = await balanceDocumentId(input.idempotencyKey, "inventoryMovement");
  const movementRef = reference("inventoryMovements", movementId);
  const now = Date.now();

  return runTransaction(fbDb(), async (transaction) => {
    const [productSnapshot, warehouseSnapshot, balanceSnapshot, movementSnapshot] = await Promise.all([
      transaction.get(productRef),
      transaction.get(warehouseRef),
      transaction.get(balanceRef),
      transaction.get(movementRef),
    ]);

    if (movementSnapshot.exists()) {
      const existing = movementSnapshot.data();
      const requestedDelta = input.type === "receipt"
        ? input.quantity
        : input.type === "issue" ? -input.quantity : input.quantity;
      const sameOperation = existing.productId === input.productId
        && existing.warehouseId === input.warehouseId
        && existing.type === input.type
        && existing.quantityDelta === requestedDelta
        && existing.lotCode === lotCode
        && existing.expiryDate === (input.expiryDate ?? existing.expiryDate ?? null)
        && existing.unitCost === (input.unitCost ?? null)
        && existing.reason === input.reason.trim();
      if (!sameOperation) throw new Error("La clave de operación ya fue utilizada para otro movimiento.");
      return movementId;
    }

    if (!productSnapshot.exists() || productSnapshot.data().deleted === true || productSnapshot.data().active === false) {
      throw new Error("El producto no existe o está inactivo.");
    }
    if (productSnapshot.data().trackInventory === false) {
      throw new Error("Este producto no tiene habilitado el control de inventario.");
    }
    if (!warehouseSnapshot.exists()
      || warehouseSnapshot.data().deleted === true
      || warehouseSnapshot.data().active === false
      || warehouseSnapshot.data().type !== "warehouse") {
      throw new Error("La bodega no existe, está inactiva o no es una unidad de tipo bodega.");
    }

    const product = productSnapshot.data();
    const balance = balanceSnapshot.exists() ? Number(balanceSnapshot.data().quantity ?? 0) : 0;
    if (balanceSnapshot.exists() && input.expiryDate !== undefined
      && balanceSnapshot.data().expiryDate !== undefined
      && balanceSnapshot.data().expiryDate !== input.expiryDate) {
      throw new Error("El lote ya existe con una fecha de vencimiento diferente.");
    }
    const expiryDate = balanceSnapshot.data()?.expiryDate ?? input.expiryDate;
    if (input.type === "issue" && expiryDate !== undefined && expiryDate < Date.now()) {
      throw new Error("No se puede consumir un lote vencido.");
    }
    const quantityDelta = input.type === "receipt"
      ? input.quantity
      : input.type === "issue" ? -input.quantity : input.quantity;
    const nextBalance = balance + quantityDelta;

    if (nextBalance < 0) {
      throw new Error(`Existencia insuficiente. Disponible: ${balance} ${String(product.baseUnit ?? "u")}.`);
    }

    const balanceData: DocumentData = {
      id: balanceId,
      companyId: CLOUD_COMPANY_ID,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: nextBalance,
      baseUnit: String(product.baseUnit ?? "u"),
      lotCode,
      expiryDate: expiryDate ?? null,
      createdAt: balanceSnapshot.exists() ? balanceSnapshot.data().createdAt : now,
      updatedAt: now,
      createdBy: balanceSnapshot.exists() ? balanceSnapshot.data().createdBy : user.uid,
      updatedBy: user.uid,
      revision: Number(balanceSnapshot.data()?.revision ?? 0) + 1,
      deleted: false,
    };

    const movementData: DocumentData = {
      id: movementId,
      companyId: CLOUD_COMPANY_ID,
      productId: input.productId,
      warehouseId: input.warehouseId,
      lotCode,
      expiryDate: expiryDate ?? null,
      type: input.type,
      quantityDelta,
      balanceBefore: balance,
      balanceAfter: nextBalance,
      baseUnit: String(product.baseUnit ?? "u"),
      unitCost: input.unitCost ?? null,
      reason: input.reason.trim(),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      revision: 1,
      deleted: false,
    };

    transaction.set(balanceRef, balanceData);
    transaction.set(movementRef, movementData);
    return movementId;
  });
}


/** Traslada existencias entre dos bodegas en una única transacción. */
export async function transferInventory(input: {
  productId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  quantity: number;
  lotCode: string;
  expiryDate?: number;
  reason: string;
  idempotencyKey: string;
}): Promise<string> {
  const user = requireOnlineUser();
  if (input.sourceWarehouseId === input.targetWarehouseId) {
    throw new Error("La bodega de origen y destino deben ser diferentes.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("La cantidad a trasladar debe ser mayor que cero.");
  }
  if (!input.reason.trim()) throw new Error("Debes indicar el motivo del traslado.");
  if (!input.lotCode.trim()) throw new Error("Debes indicar el lote que se va a trasladar.");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
    throw new Error("Debes enviar una clave única de operación de hasta 128 caracteres.");
  }
  if (input.expiryDate !== undefined && (!Number.isFinite(input.expiryDate) || input.expiryDate <= 0)) {
    throw new Error("La fecha de vencimiento no es válida.");
  }

  const transferId = await balanceDocumentId(input.idempotencyKey, "inventoryTransfer");
  const outMovementId = await balanceDocumentId(transferId, "transferOut");
  const inMovementId = await balanceDocumentId(transferId, "transferIn");
  const productRef = reference("products", input.productId);
  const sourceWarehouseRef = reference("organizationUnits", input.sourceWarehouseId);
  const targetWarehouseRef = reference("organizationUnits", input.targetWarehouseId);
  const lotCode = input.lotCode.trim().toUpperCase();
  const sourceBalanceRef = reference("inventoryBalances", await balanceDocumentId(input.productId, input.sourceWarehouseId, lotCode));
  const targetBalanceRef = reference("inventoryBalances", await balanceDocumentId(input.productId, input.targetWarehouseId, lotCode));
  const transferRef = reference("inventoryTransfers", transferId);
  const outMovementRef = reference("inventoryMovements", outMovementId);
  const inMovementRef = reference("inventoryMovements", inMovementId);
  const now = Date.now();

  return runTransaction(fbDb(), async (transaction) => {
    const [
      productSnapshot,
      sourceWarehouseSnapshot,
      targetWarehouseSnapshot,
      sourceBalanceSnapshot,
      targetBalanceSnapshot,
      transferSnapshot,
      outMovementSnapshot,
      inMovementSnapshot,
    ] = await Promise.all([
      transaction.get(productRef),
      transaction.get(sourceWarehouseRef),
      transaction.get(targetWarehouseRef),
      transaction.get(sourceBalanceRef),
      transaction.get(targetBalanceRef),
      transaction.get(transferRef),
      transaction.get(outMovementRef),
      transaction.get(inMovementRef),
    ]);

    if (transferSnapshot.exists()) {
      const existing = transferSnapshot.data();
      const sameTransfer = existing.productId === input.productId
        && existing.sourceWarehouseId === input.sourceWarehouseId
        && existing.targetWarehouseId === input.targetWarehouseId
        && existing.quantity === input.quantity
        && existing.lotCode === lotCode
        && existing.reason === input.reason.trim();
      if (!sameTransfer) throw new Error("La clave de operación ya fue utilizada para otro traslado.");
      return transferId;
    }
    if (outMovementSnapshot.exists() || inMovementSnapshot.exists()) {
      throw new Error("Se detectó un historial de traslado incompleto. Solicita revisión administrativa.");
    }

    if (!productSnapshot.exists() || productSnapshot.data().deleted === true || productSnapshot.data().active === false) {
      throw new Error("El producto no existe o está inactivo.");
    }
    if (productSnapshot.data().trackInventory === false) {
      throw new Error("Este producto no tiene habilitado el control de inventario.");
    }
    for (const warehouse of [sourceWarehouseSnapshot, targetWarehouseSnapshot]) {
      if (!warehouse.exists()
        || warehouse.data().deleted === true
        || warehouse.data().active === false
        || warehouse.data().type !== "warehouse") {
        throw new Error("Las bodegas de origen y destino deben estar activas y ser de tipo bodega.");
      }
    }

    const product = productSnapshot.data();
    const sourceBefore = Number(sourceBalanceSnapshot.data()?.quantity ?? 0);
    const targetBefore = Number(targetBalanceSnapshot.data()?.quantity ?? 0);
    const expiryDate = sourceBalanceSnapshot.data()?.expiryDate ?? input.expiryDate;
    if (input.expiryDate !== undefined && sourceBalanceSnapshot.data()?.expiryDate !== undefined
      && sourceBalanceSnapshot.data()?.expiryDate !== input.expiryDate) {
      throw new Error("La fecha de vencimiento del lote no coincide con la bodega de origen.");
    }
    if (sourceBalanceSnapshot.data()?.expiryDate !== undefined
      && sourceBalanceSnapshot.data()?.expiryDate < Date.now()) {
      throw new Error("No se puede trasladar un lote vencido.");
    }
    if (targetBalanceSnapshot.exists() && targetBalanceSnapshot.data().expiryDate !== undefined
      && targetBalanceSnapshot.data().expiryDate !== expiryDate) {
      throw new Error("El lote ya existe en destino con una fecha de vencimiento diferente.");
    }
    if (sourceBefore < input.quantity) {
      throw new Error(`Existencia insuficiente en origen. Disponible: ${sourceBefore} ${String(product.baseUnit ?? "u")}.`);
    }
    const sourceAfter = sourceBefore - input.quantity;
    const targetAfter = targetBefore + input.quantity;
    const baseUnit = String(product.baseUnit ?? "u");

    const makeBalance = (
      balanceId: string,
      balanceSnapshot: typeof sourceBalanceSnapshot,
      warehouseId: string,
      quantity: number,
    ): DocumentData => ({
      id: balanceId,
      companyId: CLOUD_COMPANY_ID,
      productId: input.productId,
      warehouseId,
      quantity,
      baseUnit,
      lotCode,
      expiryDate: expiryDate ?? null,
      createdAt: balanceSnapshot.exists() ? balanceSnapshot.data().createdAt : now,
      updatedAt: now,
      createdBy: balanceSnapshot.exists() ? balanceSnapshot.data().createdBy : user.uid,
      updatedBy: user.uid,
      revision: Number(balanceSnapshot.data()?.revision ?? 0) + 1,
      deleted: false,
    });

    transaction.set(sourceBalanceRef, makeBalance(sourceBalanceRef.id, sourceBalanceSnapshot, input.sourceWarehouseId, sourceAfter));
    transaction.set(targetBalanceRef, makeBalance(targetBalanceRef.id, targetBalanceSnapshot, input.targetWarehouseId, targetAfter));
    transaction.set(transferRef, {
      id: transferId,
      companyId: CLOUD_COMPANY_ID,
      productId: input.productId,
      sourceWarehouseId: input.sourceWarehouseId,
      targetWarehouseId: input.targetWarehouseId,
      quantity: input.quantity,
      baseUnit,
      lotCode,
      expiryDate: expiryDate ?? null,
      reason: input.reason.trim(),
      outMovementId,
      inMovementId,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      revision: 1,
      deleted: false,
    });

    const movementBase = {
      companyId: CLOUD_COMPANY_ID,
      productId: input.productId,
      quantityDelta: 0,
      baseUnit,
      lotCode,
      expiryDate: expiryDate ?? null,
      reason: input.reason.trim(),
      referenceType: "transfer",
      referenceId: transferId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      revision: 1,
      deleted: false,
    };
    transaction.set(outMovementRef, {
      ...movementBase,
      id: outMovementId,
      warehouseId: input.sourceWarehouseId,
      type: "transfer_out",
      quantityDelta: -input.quantity,
      balanceBefore: sourceBefore,
      balanceAfter: sourceAfter,
    });
    transaction.set(inMovementRef, {
      ...movementBase,
      id: inMovementId,
      warehouseId: input.targetWarehouseId,
      type: "transfer_in",
      quantityDelta: input.quantity,
      balanceBefore: targetBefore,
      balanceAfter: targetAfter,
    });
    return transferId;
  });
}
