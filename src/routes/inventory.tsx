import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, getSettings } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Sheet, Field } from "./suppliers";
import { adjustStock, transferStock, signedQty } from "@/lib/erp";
import { Warehouse, Plus, ArrowLeftRight, SlidersHorizontal, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario y bodegas — ERP" },
      { name: "description", content: "Controla existencias por bodega, ajustes, traslados y el kardex de cada producto." },
      { property: "og:title", content: "Inventario y bodegas — ERP" },
      { property: "og:description", content: "Controla existencias por bodega, ajustes, traslados y el kardex de cada producto." },
    ],
  }),
  component: InventoryPage,
});

type Tab = "stock" | "warehouses" | "kardex";

function InventoryPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const [tab, setTab] = useState<Tab>("stock");
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => p.active), []);
  const warehouses = useLiveQuery(() => db.warehouses.toArray(), []);
  const moves = useLiveQuery(async () => (await db.stockMoves.toArray()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200), []);
  const [adjusting, setAdjusting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [newWh, setNewWh] = useState(false);

  const inventoryValue = useMemo(
    () => (products ?? []).reduce((a, p) => a + p.stock * (p.cost ?? 0), 0),
    [products],
  );

  const stockByWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of moves ?? []) {
      const key = `${m.productId}:${m.warehouseId}`;
      map.set(key, (map.get(key) ?? 0) + signedQty(m));
    }
    return map;
  }, [moves]);

  return (
    <div>
      <PageHeader title="Inventario" subtitle={`Valor en costo: ${formatMoney(inventoryValue, settings)}`} />

      <div className="px-4 md:px-6 flex gap-2 overflow-x-auto pb-2">
        <TabBtn active={tab === "stock"} onClick={() => setTab("stock")}>Existencias</TabBtn>
        <TabBtn active={tab === "warehouses"} onClick={() => setTab("warehouses")}>Bodegas</TabBtn>
        <TabBtn active={tab === "kardex"} onClick={() => setTab("kardex")}>Kardex</TabBtn>
      </div>

      {tab === "stock" && (
        <div className="px-4 md:px-6 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAdjusting(true)} className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Ajustar
            </button>
            <button onClick={() => setTransferring(true)} className="h-11 rounded-xl border border-border text-sm font-semibold inline-flex items-center justify-center gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Trasladar
            </button>
          </div>
          {products?.map((p) => (
            <div key={p.id} className="rounded-xl bg-card border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">Costo {formatMoney(p.cost ?? 0, settings)} · Venta {formatMoney(p.price, settings)}</div>
                </div>
                <div className={`text-sm font-semibold ${p.trackStock && p.stock <= 5 ? "text-warning" : ""}`}>{p.stock} u.</div>
              </div>
              {(warehouses?.length ?? 0) > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {warehouses?.map((w) => (
                    <span key={w.id} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {w.name}: {stockByWarehouse.get(`${p.id}:${w.id}`) ?? 0}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {products?.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Crea productos primero</div>}
        </div>
      )}

      {tab === "warehouses" && (
        <div className="px-4 md:px-6 space-y-2">
          <button onClick={() => setNewWh(true)} className="h-11 w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Nueva bodega
          </button>
          {warehouses?.map((w) => (
            <div key={w.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Warehouse className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{w.name}</div>
                <div className="text-xs text-muted-foreground">{w.location || "Sin ubicación"}{w.isDefault ? " · Principal" : ""}</div>
              </div>
              {!w.isDefault && (
                <button
                  onClick={async () => {
                    await db.warehouses.toCollection().modify({ isDefault: false });
                    await db.warehouses.update(w.id!, { isDefault: true });
                    toast.success("Bodega principal actualizada");
                  }}
                  className="text-xs px-3 h-9 rounded-lg bg-muted font-medium"
                >
                  Principal
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "kardex" && (
        <div className="px-4 md:px-6 space-y-2">
          {moves?.map((m) => {
            const wh = warehouses?.find((w) => w.id === m.warehouseId);
            const q = signedQty(m);
            return (
              <div key={m.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><ScrollText className="h-4 w-4 text-muted-foreground" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.productName}</div>
                  <div className="text-xs text-muted-foreground truncate">{formatDate(m.createdAt)} · {wh?.name ?? "—"}{m.note ? ` · ${m.note}` : ""}</div>
                </div>
                <div className={`text-sm font-semibold ${q >= 0 ? "text-success" : "text-destructive"}`}>{q >= 0 ? "+" : ""}{q}</div>
              </div>
            );
          })}
          {moves?.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Sin movimientos todavía</div>}
        </div>
      )}

      {adjusting && <AdjustSheet onClose={() => setAdjusting(false)} />}
      {transferring && <TransferSheet onClose={() => setTransferring(false)} />}
      {newWh && <WarehouseSheet onClose={() => setNewWh(false)} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function WarehouseSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  return (
    <Sheet title="Nueva bodega" onClose={onClose}>
      <Field label="Nombre" value={name} onChange={setName} />
      <Field label="Ubicación" value={location} onChange={setLocation} />
      <button
        onClick={async () => {
          if (!name.trim()) { toast.error("Nombre obligatorio"); return; }
          await db.warehouses.add({ name: name.trim(), location: location.trim(), createdAt: Date.now() });
          toast.success("Bodega creada");
          onClose();
        }}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
      >
        Guardar
      </button>
    </Sheet>
  );
}

function ProductPicker({ value, onChange }: { value: number | ""; onChange: (v: number | "") => void }) {
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => p.active), []);
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">Producto</span>
      <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
        <option value="">Selecciona…</option>
        {products?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock})</option>)}
      </select>
    </label>
  );
}

function WarehousePicker({ label, value, onChange }: { label: string; value: number | ""; onChange: (v: number | "") => void }) {
  const warehouses = useLiveQuery(() => db.warehouses.toArray(), []);
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
        <option value="">Selecciona…</option>
        {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
}

function AdjustSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [productId, setProductId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet title="Ajuste de inventario" onClose={onClose}>
      <ProductPicker value={productId} onChange={setProductId} />
      <WarehousePicker label="Bodega" value={warehouseId} onChange={setWarehouseId} />
      <Field label="Cantidad (usa negativo para descontar)" value={qty} onChange={setQty} type="number" />
      <Field label="Motivo" value={note} onChange={setNote} />
      <button
        onClick={async () => {
          const n = Number(qty);
          if (!productId || !warehouseId || !n) { toast.error("Completa los campos"); return; }
          const p = await db.products.get(Number(productId));
          await adjustStock({
            productId: Number(productId), productName: p?.name ?? "", warehouseId: Number(warehouseId),
            qty: n, note: note || "Ajuste manual", ...(user?.id !== undefined ? { userId: user.id } : {}),
          });
          toast.success("Ajuste registrado");
          onClose();
        }}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
      >
        Aplicar ajuste
      </button>
    </Sheet>
  );
}

function TransferSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [productId, setProductId] = useState<number | "">("");
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  return (
    <Sheet title="Traslado entre bodegas" onClose={onClose}>
      <ProductPicker value={productId} onChange={setProductId} />
      <WarehousePicker label="Desde" value={fromId} onChange={setFromId} />
      <WarehousePicker label="Hacia" value={toId} onChange={setToId} />
      <Field label="Cantidad" value={qty} onChange={setQty} type="number" />
      <button
        onClick={async () => {
          try {
            if (!productId || !fromId || !toId) throw new Error("Completa los campos");
            const p = await db.products.get(Number(productId));
            await transferStock({
              productId: Number(productId), productName: p?.name ?? "",
              fromId: Number(fromId), toId: Number(toId), qty: Number(qty) || 0,
              note: "Traslado", ...(user?.id !== undefined ? { userId: user.id } : {}),
            });
            toast.success("Traslado registrado");
            onClose();
          } catch (e: any) { toast.error(e?.message ?? "Error"); }
        }}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
      >
        Trasladar
      </button>
    </Sheet>
  );
}
