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

export type InventoryMovementType = "receipt" | "issue" | "adjustment";

export interface InventoryBalance extends CloudRecord {
  productId: string;
  warehouseId: string;
  quantity: number;
  baseUnit: string;
}

export interface InventoryMovement extends CloudRecord {
  productId: string;
  warehouseId: string;
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

async function balanceDocumentId(productId: string, warehouseId: string) {
  const value = new TextEncoder().encode(`${productId}:${warehouseId}`);
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
  type: InventoryMovementType;
  quantity: number;
  unitCost?: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
}): Promise<string> {
  const user = requireOnlineUser();
  if (!Number.isFinite(input.quantity)
    || (input.type === "adjustment" ? input.quantity === 0 : input.quantity <= 0)) {
    throw new Error(input.type === "adjustment"
      ? "El ajuste debe ser distinto de cero."
      : "La cantidad debe ser mayor que cero.");
  }
  if (!input.reason.trim()) throw new Error("Debes indicar el motivo del movimiento.");
  if (input.unitCost !== undefined && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) {
    throw new Error("El costo unitario no puede ser negativo.");
  }

  const productRef = reference("products", input.productId);
  const warehouseRef = reference("organizationUnits", input.warehouseId);
  const balanceId = await balanceDocumentId(input.productId, input.warehouseId);
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
      type: input.type,
      quantityDelta,
      balanceBefore: balance,
      balanceAfter: nextBalance,
      baseUnit: String(product.baseUnit ?? "u"),
      unitCost: input.unitCost ?? null,
      reason: input.reason.trim(),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
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
