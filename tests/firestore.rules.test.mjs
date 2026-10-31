import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { readFile } from "node:fs/promises";

const PROJECT_ID = "demo-flow-pos-lite";
let testEnv;

const identities = {
  cashier: { uid: "cashier-uid", email: "cashier@example.test" },
  dispatcher: { uid: "dispatcher-uid", email: "dispatcher@example.test" },
  noAssignment: { uid: "unassigned-uid", email: "unassigned@example.test" },
  warehouse: { uid: "warehouse-uid", email: "warehouse@example.test" },
};

const roles = {
  cashier: {
    name: "Cajero",
    permissions: {
      products: "read",
      categories: "read",
      customers: "read",
      sales: "read",
      orders: "write",
      pos: "write",
      cash: "write",
    },
  },
  warehouse: {
    name: "Inventario",
    permissions: { inventory: "write", products: "read" },
  },
  dispatcher: {
    name: "Despachador",
    permissions: {
      products: "read",
      inventory: "read",
      orders: "read",
      dispatch: "write",
    },
  },
};

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [roleId, role] of Object.entries(roles)) {
      await setDoc(doc(db, "accessRoles", roleId), role);
    }
    await setDoc(doc(db, "userAccess", identities.cashier.email), {
      uid: identities.cashier.uid,
      email: identities.cashier.email,
      roleId: "cashier",
      active: true,
      overrides: {},
      warehouseIds: [],
    });
    await setDoc(doc(db, "userAccess", identities.warehouse.email), {
      uid: identities.warehouse.uid,
      email: identities.warehouse.email,
      roleId: "warehouse",
      active: true,
      overrides: {},
      warehouseIds: ["warehouse-a"],
    });
    await setDoc(doc(db, "userAccess", identities.dispatcher.email), {
      uid: identities.dispatcher.uid,
      email: identities.dispatcher.email,
      roleId: "dispatcher",
      active: true,
      overrides: {},
      warehouseIds: ["warehouse-a"],
    });
    await setDoc(doc(db, "erp/default/products/product-a"), {
      id: "product-a",
      code: "P-001",
      name: "Producto de prueba",
      active: true,
    });
    await setDoc(doc(db, "erp/default/inventoryBalances/balance-a"), {
      id: "balance-a",
      productId: "product-a",
      warehouseId: "warehouse-a",
      quantity: 25,
      lotCode: "LOT-001",
    });
    await setDoc(doc(db, "erp/default/inventoryBalances/balance-b"), {
      id: "balance-b",
      productId: "product-a",
      warehouseId: "warehouse-b",
      quantity: 10,
      lotCode: "LOT-002",
    });
  });
}

function dbFor(identity) {
  return testEnv.authenticatedContext(identity.uid, {
    email: identity.email,
    email_verified: true,
  }).firestore();
}

describe("Firestore security rules", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  it("denies reads from unauthenticated clients", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "erp/default/products/product-a")));
  });

  it("denies access to authenticated users without an active assignment", async () => {
    const db = dbFor(identities.noAssignment);
    await assertFails(getDoc(doc(db, "erp/default/products/product-a")));
  });

  it("allows a cashier to read products but denies product writes", async () => {
    const db = dbFor(identities.cashier);
    await assertSucceeds(getDoc(doc(db, "erp/default/products/product-a")));
    await assertFails(setDoc(doc(db, "erp/default/products/product-b"), {
      id: "product-b",
      code: "P-002",
      name: "No autorizado",
    }));
  });

  it("allows a cashier to create an order and its linked notification in one batch", async () => {
    const db = dbFor(identities.cashier);
    const batch = writeBatch(db);
    const orderId = "order-cashier-001";
    const orderCode = "PED-TEST-001";
    batch.set(doc(db, `erp/default/salesOrders/${orderId}`), {
      id: orderId,
      orderCode,
      createdBy: identities.cashier.uid,
      status: "open",
      lines: [],
      subtotal: 0,
      createdAt: 100,
      updatedAt: 100,
      revision: 1,
    });
    batch.set(doc(db, `erp/default/dispatchNotifications/${orderId}`), {
      id: orderId,
      orderId,
      orderCode,
      createdBy: identities.cashier.uid,
      status: "pending",
      createdAt: 100,
      updatedAt: 100,
      revision: 1,
    });
    await assertSucceeds(batch.commit());
  });

  it("denies a cashier from creating inventory movements", async () => {
    const db = dbFor(identities.cashier);
    await assertFails(setDoc(doc(db, "erp/default/inventoryMovements/fake-movement"), {
      id: "fake-movement",
      warehouseId: "warehouse-a",
      balanceId: "balance-a",
      productId: "product-a",
      lotCode: "LOT-001",
      balanceBefore: 25,
      balanceAfter: 24,
      quantityDelta: -1,
      type: "issue",
      createdBy: identities.cashier.uid,
    }));
  });

  it("allows a dispatcher to read assigned warehouse stock", async () => {
    const db = dbFor(identities.dispatcher);
    await assertSucceeds(getDoc(doc(db, "erp/default/inventoryBalances/balance-a")));
  });

  it("denies a dispatcher from reading stock in an unassigned warehouse", async () => {
    const db = dbFor(identities.dispatcher);
    await assertFails(getDoc(doc(db, "erp/default/inventoryBalances/balance-b")));
  });

  it("denies a dispatcher from writing product catalog records", async () => {
    const db = dbFor(identities.dispatcher);
    await assertFails(setDoc(doc(db, "erp/default/products/product-b"), {
      id: "product-b",
      code: "P-002",
      name: "No autorizado",
    }));
  });

  it("denies forged inventory balance writes without a matching movement", async () => {
    const db = dbFor(identities.dispatcher);
    await assertFails(setDoc(doc(db, "erp/default/inventoryBalances/forged-balance"), {
      id: "forged-balance",
      productId: "product-a",
      warehouseId: "warehouse-a",
      quantity: 999,
      lotCode: "LOT-001",
      lastMovementId: "missing-movement",
    }));
  });

  it("denies an order dispatch update without a matching dispatch document", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "erp/default/salesOrders/order-existing"), {
        id: "order-existing",
        orderCode: "PED-EXISTING",
        createdBy: identities.cashier.uid,
        createdAt: 100,
        status: "open",
        lines: [{ productId: "product-a", orderedQty: 5, dispatchedQty: 0 }],
        orderedQtyTotal: 5,
        dispatchedQtyTotal: 0,
        revision: 1,
      });
    });

    const db = dbFor(identities.dispatcher);
    await assertFails(setDoc(doc(db, "erp/default/salesOrders/order-existing"), {
      id: "order-existing",
      orderCode: "PED-EXISTING",
      createdBy: identities.cashier.uid,
      createdAt: 100,
      status: "dispatched",
      lines: [{ productId: "product-a", orderedQty: 5, dispatchedQty: 5 }],
      orderedQtyTotal: 5,
      dispatchedQtyTotal: 5,
      lastDispatchId: "dispatch-does-not-exist",
      updatedAt: 200,
      updatedBy: identities.dispatcher.uid,
      revision: 2,
    }));
  });


  it("denies dispatchers from directly creating dispatch records", async () => {
    const db = dbFor(identities.dispatcher);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "erp/default/salesOrders/order-secure"), {
        id: "order-secure",
        orderCode: "PED-SECURE",
        createdBy: identities.cashier.uid,
        createdAt: 100,
        status: "open",
        lines: [{ productId: "product-a", orderedQty: 5, dispatchedQty: 0 }],
        orderedQtyTotal: 5,
        dispatchedQtyTotal: 0,
        revision: 1,
      });
    });
    const batch = writeBatch(db);
    batch.set(doc(db, "erp/default/salesDispatches/forged-dispatch"), {
      id: "forged-dispatch",
      orderId: "order-secure",
      warehouseId: "warehouse-a",
      createdBy: identities.dispatcher.uid,
      lines: [{ productId: "product-a", quantity: 5, lotCode: "LOT-001" }],
      status: "confirmed",
    });
    batch.update(doc(db, "erp/default/salesOrders/order-secure"), {
      status: "dispatched",
      dispatchedQtyTotal: 5,
      lines: [{ productId: "product-a", orderedQty: 5, dispatchedQty: 5 }],
      lastDispatchId: "forged-dispatch",
      updatedAt: 200,
      updatedBy: identities.dispatcher.uid,
      revision: 2,
    });
    await assertFails(batch.commit());
  });

  it("denies dispatchers from marking a notification completed without an authorized dispatch", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "erp/default/dispatchNotifications/order-notify"), {
        id: "order-notify",
        orderId: "order-notify",
        orderCode: "PED-NOTIFY",
        createdBy: identities.cashier.uid,
        createdAt: 100,
        updatedAt: 100,
        status: "pending",
        revision: 1,
      });
    });
    const db = dbFor(identities.dispatcher);
    await assertFails(setDoc(doc(db, "erp/default/dispatchNotifications/order-notify"), {
      id: "order-notify",
      orderId: "order-notify",
      orderCode: "PED-NOTIFY",
      createdBy: identities.cashier.uid,
      createdAt: 100,
      updatedAt: 200,
      updatedBy: identities.dispatcher.uid,
      status: "completed",
      revision: 2,
    }));
  });

  it("allows inventory staff to create an opening balance only with its matching receipt movement", async () => {
    const db = dbFor(identities.warehouse);
    const batch = writeBatch(db);
    batch.set(doc(db, "erp/default/inventoryBalances/opening-balance"), {
      id: "opening-balance",
      productId: "product-a",
      warehouseId: "warehouse-a",
      lotCode: "LOT-OPEN",
      quantity: 5,
      revision: 1,
      lastMovementId: "opening-movement",
      createdAt: 100,
      updatedAt: 100,
      createdBy: identities.warehouse.uid,
      updatedBy: identities.warehouse.uid,
    });
    batch.set(doc(db, "erp/default/inventoryMovements/opening-movement"), {
      id: "opening-movement",
      balanceId: "opening-balance",
      productId: "product-a",
      warehouseId: "warehouse-a",
      lotCode: "LOT-OPEN",
      type: "receipt",
      quantityDelta: 5,
      balanceBefore: 0,
      balanceAfter: 5,
      referenceType: "opening",
      createdBy: identities.warehouse.uid,
      createdAt: 100,
    });
    await assertSucceeds(batch.commit());
  });

  it("denies inventory staff from fabricating a previous balance during an update", async () => {
    const db = dbFor(identities.warehouse);
    const batch = writeBatch(db);
    batch.update(doc(db, "erp/default/inventoryBalances/balance-a"), {
      quantity: 19,
      revision: 2,
      lastMovementId: "forged-history",
      updatedAt: 200,
      updatedBy: identities.warehouse.uid,
    });
    batch.set(doc(db, "erp/default/inventoryMovements/forged-history"), {
      id: "forged-history",
      balanceId: "balance-a",
      productId: "product-a",
      warehouseId: "warehouse-a",
      lotCode: "LOT-001",
      type: "issue",
      quantityDelta: -1,
      balanceBefore: 20,
      balanceAfter: 19,
      referenceType: "manual",
      createdBy: identities.warehouse.uid,
      createdAt: 200,
    });
    await assertFails(batch.commit());
  });

  it("denies inventory staff from linking a client-created movement to a sales dispatch", async () => {
    const db = dbFor(identities.warehouse);
    const batch = writeBatch(db);
    batch.update(doc(db, "erp/default/inventoryBalances/balance-a"), {
      quantity: 24,
      revision: 2,
      lastMovementId: "spoofed-dispatch-movement",
      updatedAt: 200,
      updatedBy: identities.warehouse.uid,
    });
    batch.set(doc(db, "erp/default/inventoryMovements/spoofed-dispatch-movement"), {
      id: "spoofed-dispatch-movement",
      balanceId: "balance-a",
      productId: "product-a",
      warehouseId: "warehouse-a",
      lotCode: "LOT-001",
      type: "issue",
      quantityDelta: -1,
      balanceBefore: 25,
      balanceAfter: 24,
      referenceType: "sales_dispatch",
      referenceId: "not-a-real-dispatch",
      createdBy: identities.warehouse.uid,
      createdAt: 200,
    });
    await assertFails(batch.commit());
  });

  it("denies writes to unknown ERP collections", async () => {
    const db = dbFor(identities.cashier);
    await assertFails(setDoc(doc(db, "erp/default/unmappedCollection/record-a"), {
      value: "should be denied",
    }));
  });
});
