import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, getSettings, type Product, type Purchase, type PurchaseItem, type PaymentMethod } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Sheet, Field } from "./suppliers";
import { receivePurchase, paySupplier } from "@/lib/erp";
import { Plus, PackageCheck, Trash2, ShoppingBag, Minus, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "Compras y cuentas por pagar — ERP" },
      { name: "description", content: "Registra órdenes de compra, recibe mercancía y controla lo que debes a proveedores." },
      { property: "og:title", content: "Compras y cuentas por pagar — ERP" },
      { property: "og:description", content: "Registra órdenes de compra, recibe mercancía y controla lo que debes a proveedores." },
    ],
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const purchases = useLiveQuery(async () => (await db.purchases.toArray()).sort((a, b) => b.createdAt - a.createdAt), []);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Purchase | null>(null);

  const pending = (purchases ?? []).filter((p) => p.status === "received" && p.paid < p.total);
  const debt = pending.reduce((a, p) => a + (p.total - p.paid), 0);

  return (
    <div>
      <PageHeader
        title="Compras"
        subtitle={`Por pagar: ${formatMoney(debt, settings)}`}
        right={
          <button onClick={() => setCreating(true)} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> Nueva
          </button>
        }
      />
      <div className="px-4 md:px-6 space-y-2">
        {purchases?.map((p) => (
          <button key={p.id} onClick={() => setSelected(p)} className="w-full text-left rounded-xl bg-card border border-border p-3 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg grid place-items-center ${p.status === "received" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">#{p.number} · {p.supplierName}</div>
              <div className="text-xs text-muted-foreground">
                {formatDate(p.createdAt)} · {p.status === "draft" ? "Borrador" : p.paid >= p.total ? "Pagada" : `Debe ${formatMoney(p.total - p.paid, settings)}`}
              </div>
            </div>
            <div className="font-semibold text-sm">{formatMoney(p.total, settings)}</div>
          </button>
        ))}
        {purchases?.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Sin compras registradas</div>}
      </div>

      {creating && <NewPurchase onClose={() => setCreating(false)} />}
      {selected && <PurchaseDetail purchase={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function NewPurchase({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const warehouses = useLiveQuery(() => db.warehouses.toArray(), []);
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => p.active), []);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [taxPct, setTaxPct] = useState("0");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [search, setSearch] = useState("");

  const subtotal = items.reduce((a, i) => a + i.total, 0);
  const tax = Math.round(subtotal * (Number(taxPct) || 0) / 100);
  const total = subtotal + tax;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return (products ?? []).slice(0, 8);
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 8);
  }, [products, search]);

  function addItem(p: Product) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        const cur = next[i]!;
        next[i] = { ...cur, qty: cur.qty + 1, total: (cur.qty + 1) * cur.unitCost };
        return next;
      }
      const unitCost = p.cost ?? 0;
      return [...prev, { productId: p.id!, name: p.name, qty: 1, unitCost, total: unitCost }];
    });
    setSearch("");
  }

  function setQty(idx: number, qty: number) {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((_, i) => i !== idx);
      const next = [...prev];
      const cur = next[idx]!;
      next[idx] = { ...cur, qty, total: qty * cur.unitCost };
      return next;
    });
  }

  function setCost(idx: number, unitCost: number) {
    setItems((prev) => {
      const next = [...prev];
      const cur = next[idx]!;
      next[idx] = { ...cur, unitCost, total: cur.qty * unitCost };
      return next;
    });
  }

  async function save(receive: boolean) {
    if (!supplierId) { toast.error("Selecciona el proveedor"); return; }
    if (!warehouseId) { toast.error("Selecciona la bodega"); return; }
    if (items.length === 0) { toast.error("Agrega al menos un producto"); return; }
    const supplier = suppliers?.find((s) => s.id === supplierId);
    const number = (await db.purchases.count()) + 1;
    const id = await db.purchases.add({
      number,
      supplierId: Number(supplierId),
      supplierName: supplier?.name ?? "Proveedor",
      warehouseId: Number(warehouseId),
      items,
      subtotal,
      tax,
      total,
      paid: 0,
      status: "draft",
      createdAt: Date.now(),
    });
    if (receive) {
      const created = await db.purchases.get(id);
      if (created) await receivePurchase(created, user?.id);
      toast.success(`Compra #${number} recibida — inventario actualizado`);
    } else {
      toast.success(`Compra #${number} guardada como borrador`);
    }
    onClose();
  }

  return (
    <Sheet title="Nueva compra" onClose={onClose}>
      <label className="block">
        <span className="text-xs text-muted-foreground">Proveedor</span>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
          <option value="">Selecciona…</option>
          {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Bodega destino</span>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
          <option value="">Selecciona…</option>
          {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>

      <Field label="Buscar producto" value={search} onChange={setSearch} />
      {search && (
        <div className="rounded-xl border border-border divide-y divide-border">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => addItem(p)} className="w-full text-left px-3 py-2 text-sm flex justify-between">
              <span className="truncate">{p.name}</span>
              <span className="text-muted-foreground">{formatMoney(p.cost ?? 0, settings)}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>}
        </div>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-xl bg-background border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{it.name}</span>
              <button onClick={() => setQty(idx, 0)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setQty(idx, it.qty - 1)} className="h-8 w-8 rounded-md bg-muted grid place-items-center"><Minus className="h-3.5 w-3.5" /></button>
              <input type="number" inputMode="numeric" value={it.qty} onChange={(e) => setQty(idx, Number(e.target.value) || 0)} className="w-14 h-8 px-2 rounded-md bg-card border border-border text-center text-sm" />
              <button onClick={() => setQty(idx, it.qty + 1)} className="h-8 w-8 rounded-md bg-muted grid place-items-center"><Plus className="h-3.5 w-3.5" /></button>
              <span className="text-xs text-muted-foreground">×</span>
              <input type="number" inputMode="decimal" value={it.unitCost} onChange={(e) => setCost(idx, Number(e.target.value) || 0)} className="flex-1 h-8 px-2 rounded-md bg-card border border-border text-right text-sm" />
              <span className="text-sm font-semibold w-20 text-right">{formatMoney(it.total, settings)}</span>
            </div>
          </div>
        ))}
      </div>

      <Field label="IVA %" value={taxPct} onChange={setTaxPct} type="number" />

      <div className="rounded-xl bg-background border border-border p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(subtotal, settings)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatMoney(tax, settings)}</span></div>
        <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatMoney(total, settings)}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => save(false)} className="h-12 rounded-xl border border-border font-semibold text-sm">Guardar borrador</button>
        <button onClick={() => save(true)} className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2">
          <PackageCheck className="h-4 w-4" /> Recibir ya
        </button>
      </div>
    </Sheet>
  );
}

function PurchaseDetail({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { user } = useAuth();
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const live = useLiveQuery(() => db.purchases.get(purchase.id!), [purchase.id]) ?? purchase;
  const payments = useLiveQuery(async () => (await db.supplierPayments.toArray()).filter((p) => p.purchaseId === purchase.id), [purchase.id]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const due = live.total - live.paid;

  async function receive() {
    try {
      await receivePurchase(live, user?.id);
      toast.success("Mercancía recibida e inventario actualizado");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  async function pay() {
    try {
      await paySupplier(live.id!, Number(amount) || 0, method, user?.id);
      toast.success("Pago registrado");
      setAmount("");
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  return (
    <Sheet title={`Compra #${live.number}`} onClose={onClose}>
      <div className="text-xs text-muted-foreground">{live.supplierName} · {formatDate(live.createdAt)}</div>
      <div className="rounded-xl bg-background border border-border divide-y divide-border">
        {live.items.map((it, i) => (
          <div key={i} className="p-3 flex justify-between text-sm">
            <div className="min-w-0">
              <div className="truncate">{it.name}</div>
              <div className="text-xs text-muted-foreground">{it.qty} × {formatMoney(it.unitCost, settings)}</div>
            </div>
            <div className="font-medium">{formatMoney(it.total, settings)}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-background border border-border p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(live.subtotal, settings)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatMoney(live.tax, settings)}</span></div>
        <div className="flex justify-between font-bold"><span>Total</span><span>{formatMoney(live.total, settings)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span>{formatMoney(live.paid, settings)}</span></div>
        <div className="flex justify-between text-warning font-semibold"><span>Saldo</span><span>{formatMoney(due, settings)}</span></div>
      </div>

      {live.status === "draft" && (
        <button onClick={receive} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2">
          <PackageCheck className="h-4 w-4" /> Recibir mercancía
        </button>
      )}

      {live.status === "received" && due > 0 && (
        <div className="rounded-xl bg-background border border-border p-3 space-y-2">
          <div className="text-sm font-semibold inline-flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /> Registrar pago</div>
          <Field label="Monto" value={amount} onChange={setAmount} type="number" />
          <label className="block">
            <span className="text-xs text-muted-foreground">Medio de pago</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="mt-1 w-full h-11 px-3 rounded-xl bg-card border border-border text-sm">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setAmount(String(due))} className="h-10 px-3 rounded-lg bg-muted text-xs font-medium">Saldo total</button>
            <button onClick={pay} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Pagar</button>
          </div>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="text-xs space-y-1">
          <div className="font-semibold text-sm">Pagos</div>
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between text-muted-foreground">
              <span>{formatDate(p.createdAt)} · {p.method}</span>
              <span className="text-foreground">{formatMoney(p.amount, settings)}</span>
            </div>
          ))}
        </div>
      )}

      <Attachments
        refType="purchase"
        refId={live.id!}
        title="Factura y soportes de la compra"
        hint="Adjunta la factura del proveedor, BL, DUA o comprobantes de pago."
      />
    </Sheet>

  );
}
