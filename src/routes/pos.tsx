import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, getSettings, type Product, type SaleItem, type PaymentMethod, type Combo } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { buildReceiptText } from "@/lib/receipt";
import { isBluetoothSupported, printText } from "@/lib/printer";
import {
  Search, Plus, Minus, Trash2, X, CreditCard, Banknote, Smartphone, HandCoins, Printer, Package, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pos")({ component: POSPage });

type CartItem = SaleItem & {
  stock: number;
  trackStock: boolean;
  comboId?: number;
  components?: { productId: number; qty: number }[];
};

function POSPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => p.active), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const combos = useLiveQuery(async () => (await db.combos.toArray()).filter((c) => c.active), []);
  const openSession = useLiveQuery(async () => (await db.cashSessions.toArray()).find((s) => !s.closedAt) ?? null, []);

  const [search, setSearch] = useState("");
  const [catId, setCatId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showPay, setShowPay] = useState(false);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catId && p.categoryId !== catId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.sku?.toLowerCase().includes(q) ?? false) || (p.barcode?.includes(q) ?? false);
    });
  }, [products, search, catId]);

  const subtotal = cart.reduce((a, i) => a + i.total, 0);

  function addProduct(p: Product) {
    if (p.trackStock && p.stock <= 0) { toast.error("Sin stock"); return; }
    setCart((prev) => {
      const i = prev.findIndex((x) => !x.comboId && x.productId === p.id);
      if (i >= 0) {
        const cur = prev[i];
        if (cur.trackStock && cur.qty + 1 > cur.stock) { toast.error("Stock insuficiente"); return prev; }
        const next = [...prev];
        next[i] = { ...cur, qty: cur.qty + 1, total: (cur.qty + 1) * cur.unitPrice };
        return next;
      }
      return [...prev, {
        productId: p.id!, name: p.name, qty: 1, unitPrice: p.price, total: p.price,
        stock: p.stock, trackStock: p.trackStock,
      }];
    });
  }

  function addCombo(c: Combo) {
    if (!products) return;
    // verifica stock por componente
    for (const it of c.items) {
      const p = products.find((x) => x.id === it.productId);
      if (!p) { toast.error(`Producto del combo no disponible`); return; }
      if (p.trackStock && p.stock < it.qty) { toast.error(`Sin stock para ${p.name}`); return; }
    }
    setCart((prev) => {
      const i = prev.findIndex((x) => x.comboId === c.id);
      if (i >= 0) {
        const cur = prev[i];
        // verifica que haya stock para una unidad más del combo (acumulado)
        const newQty = cur.qty + 1;
        for (const comp of c.items) {
          const p = products.find((x) => x.id === comp.productId);
          if (p?.trackStock && p.stock < comp.qty * newQty) { toast.error(`Sin stock para ${p.name}`); return prev; }
        }
        const next = [...prev];
        next[i] = { ...cur, qty: newQty, total: newQty * cur.unitPrice };
        return next;
      }
      return [...prev, {
        productId: 0,
        comboId: c.id!,
        components: c.items.map((x) => ({ productId: x.productId, qty: x.qty })),
        name: `🎁 ${c.name}`,
        qty: 1,
        unitPrice: c.price,
        total: c.price,
        stock: 0,
        trackStock: false,
      }];
    });
  }

  function changeQty(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const nq = cur.qty + delta;
      if (nq <= 0) return next.filter((_, i) => i !== idx);
      if (cur.comboId && cur.components && products) {
        for (const comp of cur.components) {
          const p = products.find((x) => x.id === comp.productId);
          if (p?.trackStock && p.stock < comp.qty * nq) { toast.error(`Sin stock para ${p.name}`); return prev; }
        }
      } else if (cur.trackStock && nq > cur.stock) { toast.error("Stock insuficiente"); return prev; }
      next[idx] = { ...cur, qty: nq, total: nq * cur.unitPrice };
      return next;
    });
  }

  function removeItem(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  async function completeSale(method: PaymentMethod, paid: number, discount: number) {
    if (!user) return;
    if (!openSession) { toast.error("Abre una caja primero"); return; }
    const total = Math.max(0, subtotal - discount);
    if (paid < total && method !== "credit") { toast.error("Monto pagado insuficiente"); return; }

    const number = (await db.sales.where("cashSessionId").equals(openSession.id!).count()) + 1;
    const items: SaleItem[] = cart.map(({ productId, name, qty, unitPrice, total, comboId, components }) => ({
      productId, name, qty, unitPrice, total, comboId, components,
    }));

    const saleId = await db.transaction("rw", db.sales, db.products, async () => {
      // decrement stock
      for (const it of cart) {
        if (it.comboId && it.components) {
          for (const comp of it.components) {
            const p = await db.products.get(comp.productId);
            if (p && p.trackStock) {
              await db.products.update(comp.productId, { stock: Math.max(0, p.stock - comp.qty * it.qty) });
            }
          }
        } else if (it.trackStock) {
          const p = await db.products.get(it.productId);
          if (p) await db.products.update(it.productId, { stock: Math.max(0, p.stock - it.qty) });
        }
      }
      return db.sales.add({
        number,
        cashSessionId: openSession.id!,
        userId: user.id!,
        items,
        subtotal,
        discount,
        total,
        paid,
        change: Math.max(0, paid - total),
        paymentMethod: method,
        status: "completed",
        createdAt: Date.now(),
      });
    });

    toast.success(`Venta #${number} guardada`);
    setShowPay(false);
    const sale = await db.sales.get(saleId);
    setCart([]);
    if (sale && settings) {
      // offer print
      const text = buildReceiptText(sale, settings, user.name);
      try { sessionStorage.setItem("lastReceipt", text); } catch {}
      tryPrint(text);
    }
  }

  async function tryPrint(text: string) {
    if (!isBluetoothSupported()) return;
    // Fire-and-forget: only attempts after user has previously paired
    try { await printText(text); toast.success("Enviado a impresora"); }
    catch { /* ignore — user can reprint from sales screen */ }
  }

  return (
    <div className="md:grid md:grid-cols-[1fr_360px] md:gap-4 md:px-4 md:pt-4">
      {/* Catalog */}
      <div className="min-w-0">
        <PageHeader title="Vender" subtitle={openSession ? "Caja abierta" : "Caja cerrada — abre antes de cobrar"} />

        <div className="px-4 md:px-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre / código de barras"
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-card border border-border outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
            <CatChip active={catId === null} onClick={() => setCatId(null)}>Todos</CatChip>
            {categories?.map((c) => (
              <CatChip key={c.id} active={catId === c.id} onClick={() => setCatId(c.id!)}>{c.name}</CatChip>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {(combos ?? []).filter((c) => !catId).map((c) => (
              <button
                key={`combo-${c.id}`}
                onClick={() => addCombo(c)}
                className="text-left rounded-xl border p-3 active:scale-[0.97] transition-transform relative overflow-hidden"
                style={{ background: (c.color ?? "#ec4899") + "15", borderColor: (c.color ?? "#ec4899") + "55" }}
              >
                <div className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: c.color ?? "#ec4899" }}>
                  COMBO
                </div>
                <div className="aspect-square w-full rounded-lg overflow-hidden grid place-items-center mb-1.5" style={{ background: (c.color ?? "#ec4899") + "25" }}>
                  {c.image ? (
                    <img src={c.image} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Sparkles className="h-6 w-6" style={{ color: c.color ?? "#ec4899" }} />
                  )}
                </div>
                <div className="text-sm font-medium leading-tight line-clamp-2">{c.name}</div>
                <div className="mt-1 text-sm font-semibold" style={{ color: c.color ?? "#ec4899" }}>
                  {formatMoney(c.price, settings)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{c.items.length} productos</div>
              </button>
            ))}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="text-left rounded-xl bg-card border border-border p-3 active:scale-[0.97] transition-transform disabled:opacity-50"
                disabled={p.trackStock && p.stock <= 0}
              >
                <div className="aspect-square w-full rounded-lg bg-muted overflow-hidden grid place-items-center mb-1.5">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="text-sm font-medium leading-tight line-clamp-2">{p.name}</div>
                <div className="mt-1 text-sm font-semibold text-primary">{formatMoney(p.price, settings)}</div>
                {p.trackStock && (
                  <div className={`text-[10px] mt-0.5 ${p.stock <= 5 ? "text-warning" : "text-muted-foreground"}`}>
                    Stock: {p.stock}
                  </div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-10">
                Sin productos.{" "}
                <button onClick={() => navigate({ to: "/products" })} className="text-primary underline">Crear uno</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart — desktop sidebar */}
      <aside className="hidden md:flex flex-col rounded-xl bg-card border border-border h-[calc(100vh-2rem)] sticky top-4">
        <CartView cart={cart} settings={settings} onChangeQty={changeQty} onRemove={removeItem} onClear={() => setCart([])} onCheckout={() => setShowPay(true)} subtotal={subtotal} />
      </aside>

      {/* Cart bar — mobile */}
      {cart.length > 0 && (
        <button
          onClick={() => setShowPay(true)}
          className="md:hidden fixed left-3 right-3 bottom-[68px] z-30 h-14 px-4 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-between active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <span className="h-7 min-w-7 px-1.5 rounded-full bg-white/20 grid place-items-center text-xs font-bold">
              {cart.reduce((a, i) => a + i.qty, 0)}
            </span>
            <span className="font-semibold">Cobrar</span>
          </span>
          <span className="font-bold">{formatMoney(subtotal, settings)}</span>
        </button>
      )}

      {/* Payment sheet */}
      {showPay && (
        <PaySheet
          subtotal={subtotal}
          settings={settings}
          onClose={() => setShowPay(false)}
          onConfirm={completeSale}
          cart={cart}
          onChangeQty={changeQty}
          onRemove={removeItem}
        />
      )}
    </div>
  );
}

function CatChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CartView({
  cart, settings, onChangeQty, onRemove, onClear, onCheckout, subtotal,
}: {
  cart: CartItem[]; settings: any;
  onChangeQty: (i: number, d: number) => void;
  onRemove: (i: number) => void;
  onClear: () => void;
  onCheckout: () => void;
  subtotal: number;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="font-semibold">Carrito</div>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive">Vaciar</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 && (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">Toca productos para agregar</div>
        )}
        {cart.map((it, idx) => (
          <div key={idx} className="rounded-lg bg-background p-3 border border-border">
            <div className="flex justify-between gap-2">
              <div className="text-sm font-medium leading-tight">{it.name}</div>
              <button onClick={() => onRemove(idx)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button onClick={() => onChangeQty(idx, -1)} className="h-8 w-8 rounded-md bg-muted grid place-items-center"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-8 text-center text-sm font-semibold">{it.qty}</span>
                <button onClick={() => onChangeQty(idx, +1)} className="h-8 w-8 rounded-md bg-muted grid place-items-center"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="text-sm font-semibold">{formatMoney(it.total, settings)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold">{formatMoney(subtotal, settings)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          Cobrar {formatMoney(subtotal, settings)}
        </button>
      </div>
    </>
  );
}

function PaySheet({
  subtotal, settings, onClose, onConfirm, cart, onChangeQty, onRemove,
}: {
  subtotal: number; settings: any; onClose: () => void;
  onConfirm: (m: PaymentMethod, paid: number, discount: number) => void;
  cart: CartItem[]; onChangeQty: (i: number, d: number) => void; onRemove: (i: number) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState(0);
  const [paidStr, setPaidStr] = useState("");
  const total = Math.max(0, subtotal - discount);
  const paid = method === "cash" ? (Number(paidStr) || 0) : total;
  const change = Math.max(0, paid - total);

  const quickAmounts = [total, 10000, 20000, 50000, 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid md:place-items-center">
      <div className="absolute md:relative bottom-0 inset-x-0 md:inset-auto md:max-w-md md:w-full md:rounded-2xl bg-card md:border md:border-border rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">Cobrar</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Items summary */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {cart.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <button onClick={() => onChangeQty(idx, -1)} className="h-6 w-6 rounded bg-muted grid place-items-center"><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center text-xs font-semibold">{it.qty}</span>
                  <button onClick={() => onChangeQty(idx, +1)} className="h-6 w-6 rounded bg-muted grid place-items-center"><Plus className="h-3 w-3" /></button>
                </div>
                <div className="flex-1 truncate">{it.name}</div>
                <div className="font-medium">{formatMoney(it.total, settings)}</div>
                <button onClick={() => onRemove(idx)} className="text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          {/* Discount */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-muted-foreground">Descuento</label>
            <input
              type="number"
              inputMode="decimal"
              value={discount || ""}
              onChange={(e) => setDiscount(Math.max(0, Math.min(subtotal, Number(e.target.value) || 0)))}
              className="w-32 h-10 px-3 rounded-lg bg-background border border-border text-right text-sm"
              placeholder="0"
            />
          </div>

          {/* Method */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Método de pago</div>
            <div className="grid grid-cols-2 gap-2">
              <PayMethodBtn icon={Banknote} label="Efectivo" active={method === "cash"} onClick={() => setMethod("cash")} />
              <PayMethodBtn icon={CreditCard} label="Tarjeta" active={method === "card"} onClick={() => setMethod("card")} />
              <PayMethodBtn icon={Smartphone} label="Transfer." active={method === "transfer"} onClick={() => setMethod("transfer")} />
              <PayMethodBtn icon={HandCoins} label="Crédito" active={method === "credit"} onClick={() => setMethod("credit")} />
            </div>
          </div>

          {/* Cash entry */}
          {method === "cash" && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">Recibido</div>
              <input
                type="number"
                inputMode="decimal"
                value={paidStr}
                onChange={(e) => setPaidStr(e.target.value)}
                placeholder={String(total)}
                className="w-full h-12 px-3 rounded-xl bg-background border border-border text-right text-lg font-semibold"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {quickAmounts.map((v) => (
                  <button
                    key={v}
                    onClick={() => setPaidStr(String(v))}
                    className="px-3 h-9 rounded-lg bg-muted text-xs font-medium"
                  >
                    {formatMoney(v, settings)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-xl bg-background border border-border p-3 space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatMoney(subtotal, settings)} />
            {discount > 0 && <Row label="Descuento" value={"-" + formatMoney(discount, settings)} />}
            <Row label="TOTAL" value={formatMoney(total, settings)} bold />
            {method === "cash" && (
              <>
                <Row label="Recibido" value={formatMoney(paid, settings)} />
                <Row label="Cambio" value={formatMoney(change, settings)} bold />
              </>
            )}
          </div>

          <button
            onClick={() => onConfirm(method, paid, discount)}
            className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold text-lg active:scale-[0.99]"
          >
            Confirmar venta
          </button>
          <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <Printer className="h-3 w-3" /> Si tu impresora Bluetooth está pareada, se imprimirá automáticamente
          </p>
        </div>
      </div>
    </div>
  );
}

function PayMethodBtn({ icon: Icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`h-14 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}