import {
  db, getDefaultWarehouseId, getSettings, type Account, type JournalEntry, type JournalLine,
  type Purchase, type Sale, type StockMove, type StockMoveType, type PaymentMethod,
} from "./db";

/* ------------------------------- Contabilidad ------------------------------- */

export const ACC = {
  cash: "1105",
  bank: "1110",
  ar: "1305",
  vatDeductible: "1355",
  inventory: "1435",
  inTransit: "1465",
  ap: "2205",
  apForeign: "2210",
  accrued: "2335",
  taxPayable: "2408",
  equity: "3105",
  profit: "3605",
  retained: "3705",
  revenue: "4135",
  salesReturns: "4175",
  cogs: "6135",
  freight: "6140",
  payroll: "5105",
  misc: "5195",
} as const;

export async function accountByCode(code: string): Promise<Account | undefined> {
  return (await db.accounts.toArray()).find((a) => a.code === code);
}

async function line(code: string, debit: number, credit: number, extra?: { note?: string; thirdParty?: string }): Promise<JournalLine> {
  const acc = await accountByCode(code);
  const l: JournalLine = { accountCode: code, accountName: acc?.name ?? code, debit, credit };
  if (extra?.note) l.note = extra.note;
  if (extra?.thirdParty) l.thirdParty = extra.thirdParty;
  return l;
}

async function nextEntryNumber(): Promise<number> {
  const all = await db.journalEntries.toArray();
  return all.reduce((max, e) => Math.max(max, e.number ?? 0), 0) + 1;
}

export async function postEntry(opts: {
  description: string;
  refType?: string;
  refId?: number;
  date?: number;
  userId?: number;
  thirdParty?: string;
  closing?: boolean;
  lines: { code: string; debit?: number; credit?: number; note?: string; thirdParty?: string }[];
}): Promise<number | null> {
  const lines: JournalLine[] = [];
  for (const l of opts.lines) {
    const debit = Math.round(l.debit ?? 0);
    const credit = Math.round(l.credit ?? 0);
    if (debit === 0 && credit === 0) continue;
    const extra: { note?: string; thirdParty?: string } = {};
    if (l.note) extra.note = l.note;
    if (l.thirdParty ?? opts.thirdParty) extra.thirdParty = (l.thirdParty ?? opts.thirdParty)!;
    lines.push(await line(l.code, debit, credit, extra));
  }
  if (lines.length === 0) return null;
  const totalDebit = lines.reduce((a, l) => a + l.debit, 0);
  const totalCredit = lines.reduce((a, l) => a + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 1) {
    throw new Error(`Partida doble descuadrada: débitos ${totalDebit} vs créditos ${totalCredit}`);
  }
  const entry: JournalEntry = {
    number: await nextEntryNumber(),
    date: opts.date ?? Date.now(),
    description: opts.description,
    lines,
  };
  if (opts.refType !== undefined) entry.refType = opts.refType;
  if (opts.refId !== undefined) entry.refId = opts.refId;
  if (opts.userId !== undefined) entry.userId = opts.userId;
  if (opts.thirdParty !== undefined) entry.thirdParty = opts.thirdParty;
  if (opts.closing) entry.closing = true;
  return db.journalEntries.add(entry);
}


/** Separa un total en base gravable + IVA según la configuración de la empresa. */
export async function splitTax(total: number): Promise<{ base: number; tax: number }> {
  const s = await getSettings();
  const rate = (s.taxRate ?? 0) / 100;
  if (rate <= 0) return { base: Math.round(total), tax: 0 };
  const base = Math.round(total / (1 + rate));
  return { base, tax: Math.round(total) - base };
}

function paymentAccount(method: PaymentMethod): string {
  if (method === "card" || method === "transfer") return ACC.bank;
  return ACC.cash;
}


/* --------------------------------- Kardex ---------------------------------- */

export async function warehouseStock(productId: number, warehouseId: number): Promise<number> {
  const moves = await db.stockMoves.where("productId").equals(productId).toArray();
  return moves
    .filter((m) => m.warehouseId === warehouseId)
    .reduce((a, m) => a + signedQty(m), 0);
}

export function signedQty(m: StockMove): number {
  if (m.type === "in" || m.type === "transfer_in") return m.qty;
  if (m.type === "out" || m.type === "transfer_out") return -m.qty;
  return m.qty; // adjust guarda qty firmada
}

export async function addStockMove(input: {
  productId: number;
  productName: string;
  warehouseId: number;
  type: StockMoveType;
  qty: number;
  unitCost?: number;
  refType?: StockMove["refType"];
  refId?: number;
  note?: string;
  userId?: number;
}): Promise<number> {
  const prev = await warehouseStock(input.productId, input.warehouseId);
  const move: StockMove = {
    productId: input.productId,
    productName: input.productName,
    warehouseId: input.warehouseId,
    type: input.type,
    qty: input.qty,
    createdAt: Date.now(),
    balanceAfter: prev + signedQty({ ...(input as any), qty: input.qty } as StockMove),
  };
  if (input.unitCost !== undefined) move.unitCost = input.unitCost;
  if (input.refType !== undefined) move.refType = input.refType;
  if (input.refId !== undefined) move.refId = input.refId;
  if (input.note !== undefined) move.note = input.note;
  if (input.userId !== undefined) move.userId = input.userId;
  return db.stockMoves.add(move);
}

/* --------------------------------- Ventas ---------------------------------- */

/** Registra kardex, asiento contable y cartera para una venta ya guardada. */
export async function postSale(sale: Sale, userId?: number, creditDays = 30): Promise<void> {
  const warehouseId = await getDefaultWarehouseId();
  let cost = 0;
  for (const it of sale.items) {
    const p = await db.products.get(it.productId);
    cost += (p?.cost ?? 0) * it.qty;
    await addStockMove({
      productId: it.productId,
      productName: it.name,
      warehouseId,
      type: "out",
      qty: it.qty,
      ...(p?.cost !== undefined ? { unitCost: p.cost } : {}),
      refType: "sale",
      refId: sale.id!,
      note: `Venta #${sale.number}`,
      ...(userId !== undefined ? { userId } : {}),
    });
  }

  const isCredit = sale.paymentMethod === "credit";
  const { base, tax } = await splitTax(sale.total);
  let thirdParty = "Cliente ocasional";
  if (sale.customerId) {
    const c = await db.customers.get(sale.customerId);
    if (c) thirdParty = c.name;
  }
  await postEntry({
    description: `Venta #${sale.number}`,
    refType: "sale",
    refId: sale.id!,
    date: sale.createdAt,
    thirdParty,
    ...(userId !== undefined ? { userId } : {}),
    lines: [
      { code: isCredit ? ACC.ar : paymentAccount(sale.paymentMethod), debit: sale.total },
      { code: ACC.revenue, credit: base },
      { code: ACC.taxPayable, credit: tax },
      { code: ACC.cogs, debit: cost },
      { code: ACC.inventory, credit: cost },
    ],
  });


  if (isCredit) {
    let customerName = "Cliente ocasional";
    if (sale.customerId) {
      const c = await db.customers.get(sale.customerId);
      if (c) customerName = c.name;
    }
    await db.receivables.add({
      saleId: sale.id!,
      saleNumber: sale.number,
      ...(sale.customerId !== undefined ? { customerId: sale.customerId } : {}),
      customerName,
      total: sale.total,
      paid: 0,
      status: "open",
      dueDate: sale.createdAt + creditDays * 86400000,
      createdAt: sale.createdAt,
    });
  }
}

/** Reversa contable + kardex al anular una venta. */
export async function reverseSale(sale: Sale, userId?: number): Promise<void> {
  const warehouseId = await getDefaultWarehouseId();
  let cost = 0;
  for (const it of sale.items) {
    const p = await db.products.get(it.productId);
    cost += (p?.cost ?? 0) * it.qty;
    await addStockMove({
      productId: it.productId,
      productName: it.name,
      warehouseId,
      type: "in",
      qty: it.qty,
      refType: "void",
      refId: sale.id!,
      note: `Anulación venta #${sale.number}`,
      ...(userId !== undefined ? { userId } : {}),
    });
  }
  const isCredit = sale.paymentMethod === "credit";
  const { base, tax } = await splitTax(sale.total);
  await postEntry({
    description: `Anulación venta #${sale.number}`,
    refType: "void",
    refId: sale.id!,
    ...(userId !== undefined ? { userId } : {}),
    lines: [
      { code: ACC.salesReturns, debit: base },
      { code: ACC.taxPayable, debit: tax },
      { code: isCredit ? ACC.ar : paymentAccount(sale.paymentMethod), credit: sale.total },
      { code: ACC.inventory, debit: cost },
      { code: ACC.cogs, credit: cost },
    ],
  });
  const rec = (await db.receivables.toArray()).find((r) => r.saleId === sale.id);
  if (rec?.id) await db.receivables.update(rec.id, { status: "cancelled" });
}

/* -------------------------------- Cartera ---------------------------------- */

export async function payReceivable(receivableId: number, amount: number, method: PaymentMethod, userId?: number, note?: string) {
  const rec = await db.receivables.get(receivableId);
  if (!rec) throw new Error("Cuenta por cobrar no encontrada");
  const applied = Math.min(amount, rec.total - rec.paid);
  if (applied <= 0) throw new Error("Monto inválido");
  await db.arPayments.add({
    receivableId,
    amount: applied,
    method,
    createdAt: Date.now(),
    ...(userId !== undefined ? { userId } : {}),
    ...(note ? { note } : {}),
  });
  const paid = rec.paid + applied;
  await db.receivables.update(receivableId, { paid, status: paid >= rec.total ? "paid" : "open" });
  await postEntry({
    description: `Abono cartera venta #${rec.saleNumber} — ${rec.customerName}`,
    refType: "ar_payment",
    refId: receivableId,
    ...(userId !== undefined ? { userId } : {}),
    lines: [
      { code: paymentAccount(method), debit: applied },
      { code: ACC.ar, credit: applied },
    ],
  });
}

/* -------------------------------- Compras ---------------------------------- */

export async function receivePurchase(purchase: Purchase, userId?: number): Promise<void> {
  if (purchase.status !== "draft") throw new Error("La compra ya fue procesada");
  await db.transaction("rw", db.products, db.purchases, async () => {
    for (const it of purchase.items) {
      const p = await db.products.get(it.productId);
      if (p) {
        await db.products.update(it.productId, {
          stock: p.stock + it.qty,
          cost: it.unitCost,
        });
      }
    }
    await db.purchases.update(purchase.id!, { status: "received", receivedAt: Date.now() });
  });

  for (const it of purchase.items) {
    await addStockMove({
      productId: it.productId,
      productName: it.name,
      warehouseId: purchase.warehouseId,
      type: "in",
      qty: it.qty,
      unitCost: it.unitCost,
      refType: "purchase",
      refId: purchase.id!,
      note: `Compra #${purchase.number} — ${purchase.supplierName}`,
      ...(userId !== undefined ? { userId } : {}),
    });
  }

  await postEntry({
    description: `Compra #${purchase.number} — ${purchase.supplierName}`,
    refType: "purchase",
    refId: purchase.id!,
    thirdParty: purchase.supplierName,
    ...(userId !== undefined ? { userId } : {}),
    lines: [
      { code: ACC.inventory, debit: purchase.subtotal },
      { code: ACC.vatDeductible, debit: purchase.tax },
      { code: ACC.ap, credit: purchase.total },
    ],
  });
}

export async function paySupplier(purchaseId: number, amount: number, method: PaymentMethod, userId?: number, note?: string) {
  const pur = await db.purchases.get(purchaseId);
  if (!pur) throw new Error("Compra no encontrada");
  const applied = Math.min(amount, pur.total - pur.paid);
  if (applied <= 0) throw new Error("Monto inválido");
  await db.supplierPayments.add({
    purchaseId, amount: applied, method, createdAt: Date.now(),
    ...(userId !== undefined ? { userId } : {}),
    ...(note ? { note } : {}),
  });
  await db.purchases.update(purchaseId, { paid: pur.paid + applied });
  await postEntry({
    description: `Pago a proveedor ${pur.supplierName} (compra #${pur.number})`,
    refType: "ap_payment",
    refId: purchaseId,
    ...(userId !== undefined ? { userId } : {}),
    lines: [
      { code: ACC.ap, debit: applied },
      { code: paymentAccount(method), credit: applied },
    ],
  });
}

/* ------------------------------ Ajustes stock ------------------------------ */

export async function adjustStock(input: {
  productId: number; productName: string; warehouseId: number; qty: number; note?: string; userId?: number;
}) {
  const p = await db.products.get(input.productId);
  if (p) await db.products.update(input.productId, { stock: Math.max(0, p.stock + input.qty) });
  await addStockMove({
    productId: input.productId,
    productName: input.productName,
    warehouseId: input.warehouseId,
    type: "adjust",
    qty: input.qty,
    refType: "adjust",
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  });
  const value = Math.abs(input.qty) * (p?.cost ?? 0);
  if (value > 0) {
    await postEntry({
      description: `Ajuste de inventario — ${input.productName}`,
      refType: "adjust",
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      lines: input.qty > 0
        ? [{ code: ACC.inventory, debit: value }, { code: ACC.misc, credit: value }]
        : [{ code: ACC.misc, debit: value }, { code: ACC.inventory, credit: value }],
    });
  }
}

export async function transferStock(input: {
  productId: number; productName: string; fromId: number; toId: number; qty: number; note?: string; userId?: number;
}) {
  if (input.fromId === input.toId) throw new Error("Selecciona bodegas distintas");
  if (input.qty <= 0) throw new Error("Cantidad inválida");
  await addStockMove({
    productId: input.productId, productName: input.productName, warehouseId: input.fromId,
    type: "transfer_out", qty: input.qty, refType: "transfer",
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  });
  await addStockMove({
    productId: input.productId, productName: input.productName, warehouseId: input.toId,
    type: "transfer_in", qty: input.qty, refType: "transfer",
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  });
}

/* ------------------------------- Reportes ---------------------------------- */

export interface AccountBalance {
  code: string; name: string; type: Account["type"]; debit: number; credit: number; balance: number;
}

export async function trialBalance(from?: number, to?: number): Promise<AccountBalance[]> {
  const [accounts, entries] = await Promise.all([db.accounts.toArray(), db.journalEntries.toArray()]);
  const map = new Map<string, AccountBalance>();
  for (const a of accounts) {
    map.set(a.code, { code: a.code, name: a.name, type: a.type, debit: 0, credit: 0, balance: 0 });
  }
  for (const e of entries) {
    if (from !== undefined && e.date < from) continue;
    if (to !== undefined && e.date > to) continue;
    for (const l of e.lines) {
      let row = map.get(l.accountCode);
      if (!row) {
        row = { code: l.accountCode, name: l.accountName, type: "gasto", debit: 0, credit: 0, balance: 0 };
        map.set(l.accountCode, row);
      }
      row.debit += l.debit;
      row.credit += l.credit;
    }
  }
  const rows = [...map.values()];
  for (const r of rows) {
    const debitNature = r.type === "activo" || r.type === "gasto" || r.type === "costo";
    r.balance = debitNature ? r.debit - r.credit : r.credit - r.debit;
  }
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}
