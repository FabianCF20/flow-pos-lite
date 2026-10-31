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
import { assertAccess, getAccessSession } from "./access-session";

export type SalesOrderStatus = "open" | "partially_dispatched" | "dispatched" | "cancelled";

export interface SalesOrderLine {
  productId: string;
  productCode: string;
  productName: string;
  baseUnit: string;
  orderedQty: number;
  dispatchedQty: number;
  unitPrice: number;
  lineTotal: number;
  trackInventory: boolean;
}

export interface SalesOrder extends CloudRecord {
  orderCode: string;
  customerName: string;
  customerDocument: string;
  deliveryAddress: string;
  notes: string;
  lines: SalesOrderLine[];
  subtotal: number;
  status: SalesOrderStatus;
  dispatchedQtyTotal: number;
  orderedQtyTotal: number;
  lastDispatchId?: string;
}

export interface DispatchNotification extends CloudRecord {
  orderId: string;
  orderCode: string;
  customerName: string;
  status: "pending" | "in_progress" | "completed";
}

export interface SalesDispatch extends CloudRecord {
  orderId: string;
  orderCode: string;
  warehouseId: string;
  warehouseName: string;
  lines: Array<{
    productId: string;
    productName: string;
    quantity: number;
    lotCode: string;
    expiryDate: number | null;
    movementId: string | null;
  }>;
  notes: string;
  status: "confirmed";
  idempotencyKey: string;
}

function userOnline() {
  const user = fbAuth().currentUser;
  if (!user) throw new Error("Debes iniciar sesión para gestionar pedidos y despachos.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No hay conexión. La operación requiere confirmación de Firestore.");
  }
  return user;
}

function ref(name: string, id: string) {
  return doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, name), id);
}

async function hashId(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function listSalesOrders(): Promise<SalesOrder[]> {
  userOnline();
  assertAccess("orders", "read");
  const snapshot = await getDocsFromServer(query(collection(fbDb(), "erp", CLOUD_COMPANY_ID, "salesOrders")));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as SalesOrder)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listDispatchNotifications(): Promise<DispatchNotification[]> {
  userOnline();
  assertAccess("dispatch", "read");
  const base = collection(fbDb(), "erp", CLOUD_COMPANY_ID, "dispatchNotifications");
  const snapshot = await getDocsFromServer(query(base, where("status", "in", ["pending", "in_progress"])));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as DispatchNotification)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listDispatchQueue(): Promise<SalesOrder[]> {
  userOnline();
  assertAccess("dispatch", "read");
  const base = collection(fbDb(), "erp", CLOUD_COMPANY_ID, "salesOrders");
  const snapshot = await getDocsFromServer(query(base, where("status", "in", ["open", "partially_dispatched"])));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as SalesOrder)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function createSalesOrder(input: {
  customerName: string;
  customerDocument?: string;
  deliveryAddress: string;
  notes?: string;
  lines: Array<{ productId: string; quantity: number }>;
}): Promise<string> {
  const user = userOnline();
  assertAccess("orders", "write");
  const customerName = input.customerName.trim();
  const deliveryAddress = input.deliveryAddress.trim();
  if (!customerName) throw new Error("Indica el cliente o destinatario del pedido.");
  if (customerName.length > 160 || deliveryAddress.length > 300) throw new Error("El cliente o la dirección supera el límite permitido.");
  if (!input.lines.length || input.lines.length > 40) throw new Error("El pedido debe tener entre 1 y 40 productos.");
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (!line.productId || seen.has(line.productId)) throw new Error("No repitas productos dentro del mismo pedido.");
    seen.add(line.productId);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1000000) {
      throw new Error("Todas las cantidades deben ser mayores que cero.");
    }
  }

  const orderId = crypto.randomUUID();
  const now = Date.now();
  const productRefs = input.lines.map((line) => ref("products", line.productId));
  await runTransaction(fbDb(), async (transaction) => {
    const productSnapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)));
    const lines: SalesOrderLine[] = input.lines.map((line, index) => {
      const snapshot = productSnapshots[index];
      if (!snapshot?.exists() || snapshot.data().deleted === true || snapshot.data().active !== true) {
        throw new Error("Uno de los productos no existe o está inactivo. Actualiza el catálogo.");
      }
      const product = snapshot.data();
      if (product.productType !== "finished_product") {
        throw new Error(`El producto "${String(product.name)}" no está clasificado como producto terminado para venta.`);
      }
      const unitPrice = Number(product.salePrice ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("El precio de venta de un producto no es válido.");
      return {
        productId: line.productId,
        productCode: String(product.code ?? ""),
        productName: String(product.name ?? ""),
        baseUnit: String(product.baseUnit ?? "u"),
        orderedQty: line.quantity,
        dispatchedQty: 0,
        unitPrice,
        lineTotal: Math.round(unitPrice * line.quantity),
        trackInventory: product.trackInventory !== false,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const orderCode = `PED-${new Date(now).toISOString().slice(0, 10).replaceAll("-", "")}-${orderId.slice(0, 6).toUpperCase()}`;
    const order: DocumentData = {
      id: orderId,
      companyId: CLOUD_COMPANY_ID,
      orderCode,
      customerName,
      customerDocument: input.customerDocument?.trim() ?? "",
      deliveryAddress,
      notes: input.notes?.trim() ?? "",
      lines,
      subtotal,
      status: "open",
      dispatchedQtyTotal: 0,
      orderedQtyTotal: lines.reduce((sum, line) => sum + line.orderedQty, 0),
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      revision: 1,
      deleted: false,
    };
    transaction.set(ref("salesOrders", orderId), order);
    transaction.set(ref("dispatchNotifications", orderId), {
      id: orderId,
      companyId: CLOUD_COMPANY_ID,
      orderId,
      orderCode,
      customerName,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      revision: 1,
      deleted: false,
    });
  });
  return orderId;
}

/**
 * Confirma un despacho parcial o total y descuenta inventario en una única transacción.
 * El pedido no modifica existencias hasta que el despacho queda confirmado.
 */
export async function confirmSalesOrderDispatch(input: {
  orderId: string;
  warehouseId: string;
  lines: Array<{ productId: string; quantity: number; lotCode: string; expiryDate?: number }>;
  notes?: string;
  idempotencyKey: string;
}): Promise<string> {
  const user = userOnline();
  assertAccess("dispatch", "write");
  if (!input.warehouseId.trim()) throw new Error("Selecciona la bodega desde la que se despacha.");
  const assignment = getAccessSession()?.assignment;
  if (assignment?.roleId !== "admin"
    && assignment?.allWarehouses !== true
    && !(assignment?.warehouseIds ?? []).includes(input.warehouseId)) {
    throw new Error("No tienes asignada la bodega seleccionada para despachar.");
  }
  if (!input.lines.length || input.lines.length > 40) throw new Error("El despacho debe contener entre 1 y 40 líneas.");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128) throw new Error("La clave de operación no es válida.");
  const uniqueProducts = new Set<string>();
  for (const line of input.lines) {
    if (!line.productId || uniqueProducts.has(line.productId)) throw new Error("Cada producto solo puede aparecer una vez por despacho.");
    uniqueProducts.add(line.productId);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("Las cantidades despachadas deben ser mayores que cero.");
    if (!line.lotCode.trim()) throw new Error("Indica el lote de cada producto despachado.");
  }

  const dispatchId = await hashId(`dispatch:${input.idempotencyKey}`);
  const dispatchRef = ref("salesDispatches", dispatchId);
  const orderRef = ref("salesOrders", input.orderId);
  const notificationRef = ref("dispatchNotifications", input.orderId);
  const warehouseRef = ref("organizationUnits", input.warehouseId);
  const productRefs = input.lines.map((line) => ref("products", line.productId));
  const lotCodes = input.lines.map((line) => line.lotCode.trim().toUpperCase());
  const balanceIds = await Promise.all(input.lines.map((line, index) =>
    hashId(`${line.productId}:${input.warehouseId}:${lotCodes[index]}`)));
  const balanceRefs = balanceIds.map((id) => ref("inventoryBalances", id));
  const movementIds = await Promise.all(input.lines.map((line, index) =>
    hashId(`dispatch-movement:${dispatchId}:${line.productId}:${lotCodes[index]}`)));
  const movementRefs = movementIds.map((id) => ref("inventoryMovements", id));
  const now = Date.now();

  await runTransaction(fbDb(), async (transaction) => {
    const [orderSnapshot, warehouseSnapshot, dispatchSnapshot, notificationSnapshot, productSnapshots, balanceSnapshots, movementSnapshots] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(warehouseRef),
      transaction.get(dispatchRef),
      transaction.get(notificationRef),
      Promise.all(productRefs.map((productRef) => transaction.get(productRef))),
      Promise.all(balanceRefs.map((balanceRef) => transaction.get(balanceRef))),
      Promise.all(movementRefs.map((movementRef) => transaction.get(movementRef))),
    ]);

    if (dispatchSnapshot.exists()) {
      const existing = dispatchSnapshot.data();
      const same = existing.orderId === input.orderId
        && existing.warehouseId === input.warehouseId
        && existing.idempotencyKey === input.idempotencyKey
        && Array.isArray(existing.lines)
        && existing.lines.length === input.lines.length
        && input.lines.every((line, index) =>
          existing.lines[index]?.productId === line.productId
          && existing.lines[index]?.quantity === line.quantity
          && existing.lines[index]?.lotCode === (line.lotCode.trim().toUpperCase()));
      if (!same) throw new Error("La clave de operación ya fue utilizada por otro despacho.");
      return;
    }
    if (!orderSnapshot.exists() || orderSnapshot.data().deleted === true) throw new Error("El pedido no existe.");
    const order = orderSnapshot.data() as SalesOrder;
    if (!["open", "partially_dispatched"].includes(order.status)) throw new Error("El pedido ya no admite despachos.");
    if (!warehouseSnapshot.exists() || warehouseSnapshot.data().type !== "warehouse" || warehouseSnapshot.data().active !== true) {
      throw new Error("La bodega no existe o está inactiva.");
    }
    if (movementSnapshots.some((snapshot) => snapshot.exists())) throw new Error("Se detectó un movimiento previo con esta clave. Solicita revisión administrativa.");

    const orderLines = new Map(order.lines.map((line) => [line.productId, line]));
    const nextLines = order.lines.map((line) => ({ ...line }));
    const movementWrites: Array<{ reference: ReturnType<typeof ref>; data: DocumentData }> = [];
    const balanceWrites: Array<{ reference: ReturnType<typeof ref>; data: DocumentData }> = [];
    const dispatchLines: SalesDispatch["lines"] = [];

    for (let index = 0; index < input.lines.length; index++) {
      const requestLine = input.lines[index];
      const orderLine = orderLines.get(requestLine.productId);
      const productSnapshot = productSnapshots[index];
      const balanceSnapshot = balanceSnapshots[index];
      if (!orderLine || !productSnapshot?.exists() || productSnapshot.data().active !== true) {
        throw new Error("Un producto del despacho no pertenece al pedido o está inactivo.");
      }
      if (requestLine.quantity > orderLine.orderedQty - orderLine.dispatchedQty) {
        throw new Error(`La cantidad de ${orderLine.productName} supera lo pendiente del pedido.`);
      }
      const product = productSnapshot.data();
      if (product.productType !== "finished_product") {
        throw new Error("El producto ya no está clasificado como producto terminado.");
      }
      if ((product.trackInventory !== false) !== orderLine.trackInventory) {
        throw new Error("El control de inventario del producto cambió después de crear el pedido. Solicita revisión antes de despachar.");
      }
      if (orderLine.trackInventory) {
        if (product.trackInventory === false) throw new Error("El producto ya no tiene control de inventario habilitado.");
        const balance = Number(balanceSnapshot?.data()?.quantity ?? 0);
        const expiryDate = balanceSnapshot?.data()?.expiryDate ?? requestLine.expiryDate ?? null;
        if (!balanceSnapshot?.exists() || balance < requestLine.quantity) {
          throw new Error(`Existencia insuficiente del lote ${lotCodes[index]} para ${orderLine.productName}. Disponible: ${balance}.`);
        }
        if (expiryDate === null) throw new Error(`El lote ${lotCodes[index]} no tiene vencimiento registrado.`);
        if (Number(expiryDate) < now) throw new Error(`El lote ${lotCodes[index]} está vencido.`);
        if (requestLine.expiryDate !== undefined && balanceSnapshot.data().expiryDate !== undefined
          && requestLine.expiryDate !== balanceSnapshot.data().expiryDate) {
          throw new Error("La fecha de vencimiento no coincide con el lote registrado.");
        }
        const nextBalance = balance - requestLine.quantity;
        balanceWrites.push({ reference: balanceRefs[index], data: {
          id: balanceIds[index], companyId: CLOUD_COMPANY_ID,
          productId: requestLine.productId, warehouseId: input.warehouseId,
          quantity: nextBalance, baseUnit: orderLine.baseUnit, lotCode: lotCodes[index],
          expiryDate, createdAt: balanceSnapshot.data().createdAt,
          updatedAt: now, createdBy: balanceSnapshot.data().createdBy,
          updatedBy: user.uid, revision: Number(balanceSnapshot.data().revision ?? 1) + 1,
          lastMovementId: movementIds[index], deleted: false,
        } });
        movementWrites.push({ reference: movementRefs[index], data: {
          id: movementIds[index], companyId: CLOUD_COMPANY_ID,
          balanceId: balanceIds[index], productId: requestLine.productId,
          warehouseId: input.warehouseId, lotCode: lotCodes[index], expiryDate,
          type: "issue", quantityDelta: -requestLine.quantity,
          balanceBefore: balance, balanceAfter: nextBalance, baseUnit: orderLine.baseUnit,
          reason: `Despacho ${order.orderCode}`, referenceType: "sales_dispatch",
          referenceId: dispatchId, idempotencyKey: input.idempotencyKey,
          createdAt: now, updatedAt: now, createdBy: user.uid, updatedBy: user.uid,
          revision: 1, deleted: false,
        } });
      }
      const target = nextLines.find((line) => line.productId === requestLine.productId);
      if (target) target.dispatchedQty += requestLine.quantity;
      dispatchLines.push({
        productId: requestLine.productId,
        productName: orderLine.productName,
        quantity: requestLine.quantity,
        lotCode: orderLine.trackInventory ? lotCodes[index] : "NO_INVENTORY",
        expiryDate: orderLine.trackInventory ? (balanceSnapshot?.data()?.expiryDate ?? requestLine.expiryDate ?? null) : null,
        movementId: orderLine.trackInventory ? movementIds[index] : null,
      });
    }

    const dispatchedQtyTotal = nextLines.reduce((sum, line) => sum + line.dispatchedQty, 0);
    const fullyDispatched = nextLines.every((line) => line.dispatchedQty >= line.orderedQty);
    transaction.update(orderRef, {
      lines: nextLines,
      dispatchedQtyTotal,
      status: fullyDispatched ? "dispatched" : "partially_dispatched",
      lastDispatchId: dispatchId,
      updatedAt: now,
      updatedBy: user.uid,
      revision: Number(order.revision ?? 1) + 1,
    });
    balanceWrites.forEach((write) => transaction.set(write.reference, write.data));
    movementWrites.forEach((write) => transaction.set(write.reference, write.data));
    if (notificationSnapshot.exists()) {
      transaction.update(notificationRef, {
        status: fullyDispatched ? "completed" : "in_progress",
        updatedAt: now,
        updatedBy: user.uid,
        revision: Number(notificationSnapshot.data().revision ?? 1) + 1,
      });
    }
    transaction.set(dispatchRef, {
      id: dispatchId, companyId: CLOUD_COMPANY_ID,
      orderId: input.orderId, orderCode: order.orderCode,
      warehouseId: input.warehouseId,
      warehouseName: String(warehouseSnapshot.data().name ?? ""),
      lines: dispatchLines,
      notes: input.notes?.trim() ?? "", status: "confirmed",
      idempotencyKey: input.idempotencyKey,
      createdAt: now, updatedAt: now, createdBy: user.uid,
      updatedBy: user.uid, revision: 1, deleted: false,
    });
  });
  return dispatchId;
}

export async function listOrderDispatches(orderId: string): Promise<SalesDispatch[]> {
  userOnline();
  assertAccess("orders", "read");
  const base = collection(fbDb(), "erp", CLOUD_COMPANY_ID, "salesDispatches");
  const snapshot = await getDocsFromServer(query(base, where("orderId", "==", orderId)));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as SalesDispatch)
    .sort((a, b) => a.createdAt - b.createdAt);
}
