import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db, type Combo, type ComboItem, getSettings } from "@/lib/db";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { Plus, X, Trash2, Edit3, Package, Minus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/combos")({ component: CombosPage });

function CombosPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const combos = useLiveQuery(() => db.combos.toArray(), []);
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const [editing, setEditing] = useState<Combo | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      navigate({ to: "/pos", replace: true });
    }
  }, [loading, user, navigate]);

  const hasProducts = (products?.length ?? 0) > 0;

  function sumComponents(items: ComboItem[]) {
    return items.reduce((acc, it) => {
      const p = products?.find((x) => x.id === it.productId);
      return acc + (p ? p.price * it.qty : 0);
    }, 0);
  }

  return (
    <div>
      <PageHeader
        title="Combos y promociones"
        subtitle={`${combos?.length ?? 0} combos`}
        right={
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            disabled={!hasProducts}
            className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        }
      />

      <div className="px-4 md:px-6 space-y-2">
        {!hasProducts && (
          <Link to="/products" className="block rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Primero crea productos para poder armar combos.
          </Link>
        )}

        {(combos ?? []).map((c) => {
          const sum = sumComponents(c.items);
          const saving = sum - c.price;
          return (
            <div key={c.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg grid place-items-center shrink-0 overflow-hidden" style={{ background: c.color ?? "#ec4899" }}>
                {c.image ? <img src={c.image} alt={c.name} className="h-full w-full object-cover" /> : <Sparkles className="h-5 w-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.items.length} producto(s) · {formatMoney(c.price, settings)}
                  {saving > 0 && <span className="text-success ml-1">· ahorro {formatMoney(saving, settings)}</span>}
                </div>
              </div>
              <button onClick={() => { setEditing(c); setShowForm(true); }} className="h-9 w-9 rounded-lg bg-muted grid place-items-center">
                <Edit3 className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        {(combos?.length ?? 0) === 0 && hasProducts && (
          <div className="text-center text-sm text-muted-foreground py-10">
            Aún no hay combos. Crea uno para ofrecer promociones con precio especial.
          </div>
        )}
      </div>

      {showForm && (
        <ComboForm
          combo={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

const PALETTE = ["#ec4899", "#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6"];

function ComboForm({
  combo, onClose, onSaved,
}: {
  combo: Combo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => p.active), []);
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const [name, setName] = useState(combo?.name ?? "");
  const [price, setPrice] = useState<number>(combo?.price ?? 0);
  const [active, setActive] = useState<boolean>(combo?.active ?? true);
  const [color, setColor] = useState(combo?.color ?? PALETTE[0]);
  const [items, setItems] = useState<ComboItem[]>(combo?.items ?? []);
  const [search, setSearch] = useState("");

  const sumNormal = useMemo(() => items.reduce((a, it) => {
    const p = products?.find((x) => x.id === it.productId);
    return a + (p ? p.price * it.qty : 0);
  }, 0), [items, products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, search]);

  function addItem(productId: number) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.productId === productId);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { productId, qty: 1 }];
    });
  }

  function changeQty(productId: number, delta: number) {
    setItems((prev) => {
      const next = prev
        .map((x) => x.productId === productId ? { ...x, qty: x.qty + delta } : x)
        .filter((x) => x.qty > 0);
      return next;
    });
  }

  async function save() {
    const n = name.trim();
    if (!n) { toast.error("Nombre requerido"); return; }
    if (items.length === 0) { toast.error("Agrega al menos un producto"); return; }
    if (price < 0) { toast.error("Precio inválido"); return; }
    const data: Combo = {
      name: n, price: Number(price) || 0, items, color, active,
      createdAt: combo?.createdAt ?? Date.now(),
    };
    if (combo?.id) await db.combos.put({ ...data, id: combo.id });
    else await db.combos.add(data);
    toast.success("Guardado");
    onSaved();
  }

  async function remove() {
    if (!combo?.id) return;
    if (!confirm("¿Eliminar combo?")) return;
    await db.combos.delete(combo.id);
    toast.success("Eliminado");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-lg md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border z-10">
          <div className="font-semibold">{combo ? "Editar" : "Nuevo"} combo</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">Nombre</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border outline-none focus:border-primary text-sm"
              placeholder="Ej: Combo familiar"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Precio del combo</span>
              <input
                type="number"
                inputMode="decimal"
                value={price || ""}
                onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-right text-sm font-semibold"
                placeholder="0"
              />
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
              <span className="text-sm">Activo</span>
            </label>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Color</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Productos del combo</span>
              <span className="text-xs text-muted-foreground">
                Suma normal: <b className="text-foreground">{formatMoney(sumNormal, settings)}</b>
              </span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {items.length === 0 && (
                <div className="p-3 text-center text-xs text-muted-foreground">Sin productos</div>
              )}
              {items.map((it) => {
                const p = products?.find((x) => x.id === it.productId);
                if (!p) return null;
                return (
                  <div key={it.productId} className="p-2 flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{formatMoney(p.price, settings)} c/u</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(it.productId, -1)} className="h-7 w-7 rounded bg-muted grid place-items-center"><Minus className="h-3 w-3" /></button>
                      <span className="w-6 text-center text-xs font-semibold">{it.qty}</span>
                      <button onClick={() => changeQty(it.productId, +1)} className="h-7 w-7 rounded bg-muted grid place-items-center"><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Agregar producto</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="mt-1 w-full h-10 px-3 rounded-lg bg-background border border-border text-sm"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {filtered.slice(0, 30).map((p) => (
                <button key={p.id} onClick={() => addItem(p.id!)} className="w-full p-2 flex items-center gap-2 hover:bg-muted text-left">
                  <Plus className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-sm truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{formatMoney(p.price, settings)}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="p-3 text-center text-xs text-muted-foreground">Sin resultados</div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {combo && (
              <button onClick={remove} className="h-12 px-4 rounded-xl border border-destructive/40 text-destructive flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={save} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}