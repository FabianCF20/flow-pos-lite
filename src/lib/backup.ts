import { db } from "./db";

export async function exportBackup(): Promise<Blob> {
  const data = {
    version: 4,
    exportedAt: Date.now(),
    attachments: await db.attachments.toArray(),
    categories: await db.categories.toArray(),
    products: await db.products.toArray(),
    customers: await db.customers.toArray(),
    sales: await db.sales.toArray(),
    cashSessions: await db.cashSessions.toArray(),
    cashMovements: await db.cashMovements.toArray(),
    users: await db.users.toArray(),
    settings: await db.settings.toArray(),
    suppliers: await db.suppliers.toArray(),
    warehouses: await db.warehouses.toArray(),
    stockMoves: await db.stockMoves.toArray(),
    purchases: await db.purchases.toArray(),
    supplierPayments: await db.supplierPayments.toArray(),
    receivables: await db.receivables.toArray(),
    arPayments: await db.arPayments.toArray(),
    accounts: await db.accounts.toArray(),
    journalEntries: await db.journalEntries.toArray(),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text);
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
    if (data.categories) await db.categories.bulkAdd(data.categories);
    if (data.products) await db.products.bulkAdd(data.products);
    if (data.customers) await db.customers.bulkAdd(data.customers);
    if (data.sales) await db.sales.bulkAdd(data.sales);
    if (data.cashSessions) await db.cashSessions.bulkAdd(data.cashSessions);
    if (data.cashMovements) await db.cashMovements.bulkAdd(data.cashMovements);
    if (data.users) await db.users.bulkAdd(data.users);
    if (data.settings) await db.settings.bulkAdd(data.settings);
    if (data.suppliers) await db.suppliers.bulkAdd(data.suppliers);
    if (data.warehouses) await db.warehouses.bulkAdd(data.warehouses);
    if (data.stockMoves) await db.stockMoves.bulkAdd(data.stockMoves);
    if (data.purchases) await db.purchases.bulkAdd(data.purchases);
    if (data.supplierPayments) await db.supplierPayments.bulkAdd(data.supplierPayments);
    if (data.receivables) await db.receivables.bulkAdd(data.receivables);
    if (data.arPayments) await db.arPayments.bulkAdd(data.arPayments);
    if (data.accounts) await db.accounts.bulkAdd(data.accounts);
    if (data.journalEntries) await db.journalEntries.bulkAdd(data.journalEntries);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}