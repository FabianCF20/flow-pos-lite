import { db } from "./db";

export async function exportBackup(): Promise<Blob> {
  const data = {
    version: 1,
    exportedAt: Date.now(),
    categories: await db.categories.toArray(),
    products: await db.products.toArray(),
    customers: await db.customers.toArray(),
    sales: await db.sales.toArray(),
    cashSessions: await db.cashSessions.toArray(),
    cashMovements: await db.cashMovements.toArray(),
    users: await db.users.toArray(),
    settings: await db.settings.toArray(),
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
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}