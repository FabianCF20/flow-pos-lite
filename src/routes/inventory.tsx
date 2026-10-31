import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { listCloudProducts, type CloudProduct } from "@/lib/cloud-catalog";
import {
  listAccessibleWarehouses,
  listInventoryBalances,
  listInventoryMovements,
  postInventoryMovement,
  transferInventory,
  type InventoryBalance,
  type InventoryMovement,
  type InventoryWarehouse,
} from "@/lib/cloud-inventory";
import { formatDate, formatMoney } from "@/lib/format";
import { Sheet, Field } from "./suppliers";
import { toast } from "sonner";
import { Warehouse, RefreshCw, ArrowLeftRight, SlidersHorizontal, ScrollText, Plus, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario y bodegas — ERP" },
      { name: "description", content: "Control de existencias por bodega, lotes, movimientos y trazabilidad." },
    ],
  }),
  component: InventoryPage,
});

type Tab = "stock" | "warehouses" | "kardex";

function InventoryPage() {
  const { can, loading } = useAuth();
  const canRead = can("inventory", "read") && can("products", "read");
  const canWrite = can("inventory", "write");
  const [tab, setTab] = useState<Tab>("stock");
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const reloadBase = useCallback(async () => {
    const [nextWarehouses, nextProducts] = await Promise.all([
      listAccessibleWarehouses(),
      listCloudProducts(),
    ]);
    setWarehouses(nextWarehouses);
    setProducts(nextProducts.filter((product) => product.active && product.trackInventory));
    setWarehouseId((current) => current && nextWarehouses.some((item) => item.id === current)
      ? current
      : nextWarehouses[0]?.id ?? "");
  }, []);

  const reloadWarehouseData = useCallback(async (id: string) => {
    if (!id) {
      setBalances([]);
      setMovements([]);
      return;
    }
    const [nextBalances, nextMovements] = await Promise.all([
      listInventoryBalances(id),
      listInventoryMovements(id),
    ]);
    setBalances(nextBalances);
    setMovements(nextMovements);
  }, []);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      await reloadBase();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo consultar el inventario en Firestore.");
    } finally {
      setBusy(false);
    }
  }, [reloadBase]);

  useEffect(() => {
    if (!loading && canRead) void reload();
  }, [loading, canRead, reload]);

  useEffect(() => {
    if (!loading && canRead && warehouseId) {
      void reloadWarehouseData(warehouseId).catch((error) => {
        toast.error(error instanceof Error ? error.message : "No se pudieron consultar las existencias.");
      });
    }
  }, [loading, canRead, warehouseId, reloadWarehouseData]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const inventoryValue = useMemo(() => balances.reduce((total, balance) => {
    const product = productById.get(balance.productId);
    return total + balance.quantity * (product?.standardCost ?? 0);
  }, 0), [balances, productById]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!canRead) return <div className="p-6 text-sm text-destructive">Necesitas permiso de lectura de inventario y catálogo para consultar las existencias.</div>;

  async function refreshAll() {
    setBusy(true);
    try {
      await reloadBase();
      if (warehouseId) await reloadWarehouseData(warehouseId);
      toast.success("Inventario actualizado desde Firestore");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el inventario.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshWarehouse() {
    if (!warehouseId) return;
    try {
      await reloadWarehouseData(warehouseId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la bodega.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={`Valor estimado en costo estándar: ${formatMoney(inventoryValue)}`}
        right={
          <button onClick={() => void refreshAll()} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar
          </button>
        }
      />

      <div className="px-4 md:px-6 pb-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Bodega</label>
        <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-10 min-w-0 flex-1 sm:flex-none sm:min-w-64 px-3 rounded-lg bg-background border border-border text-sm">
          <option value="">Selecciona bodega…</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}
        </select>
      </div>

      <div className="px-4 md:px-6 flex gap-2 overflow-x-auto pb-3">
        <TabBtn active={tab === "stock"} onClick={() => setTab("stock")}>Existencias</TabBtn>
        <TabBtn active={tab === "warehouses"} onClick={() => setTab("warehouses")}>Bodegas</TabBtn>
        <TabBtn active={tab === "kardex"} onClick={() => setTab("kardex")}>Kardex</TabBtn>
      </div>

      {!warehouseId && tab !== "warehouses" && (
        <div className="mx-4 md:mx-6 rounded-xl border border-dashed border-border p-8 text-center">
          <Warehouse className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No hay bodegas disponibles</p>
          <p className="text-sm text-muted-foreground mt-1">Configura una bodega activa en la estructura organizacional y asígnala a tu usuario.</p>
          <a href="/organization" className="inline-flex items-center gap-2 mt-4 text-sm text-primary">Ir a estructura organizacional <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      )}

      {tab === "stock" && warehouseId && (
        <div className="px-4 md:px-6 pb-8 space-y-3">
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAdjusting(true)} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Nuevo movimiento
              </button>
              <button onClick={() => setTransferring(true)} disabled={warehouses.length < 2} className="h-10 px-3 rounded-xl border border-border text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                <ArrowLeftRight className="h-4 w-4" /> Trasladar
              </button>
            </div>
          )}
          {balances.map((balance) => {
            const product = productById.get(balance.productId);
            return (
              <article key={balance.id} className="rounded-xl bg-card border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{product?.name ?? "Producto no encontrado"}</div>
                    <div className="text-xs text-muted-foreground">{product?.code ?? balance.productId} · Lote {balance.lotCode}</div>
                    <div className="text-xs text-muted-foreground mt-1">Vence: {balance.expiryDate ? formatDate(balance.expiryDate) : "No aplica / no registrado"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-semibold ${balance.quantity <= 0 ? "text-destructive" : ""}`}>{balance.quantity} {balance.baseUnit}</div>
                    <div className="text-xs text-muted-foreground">{formatMoney(balance.quantity * (product?.standardCost ?? 0))}</div>
                  </div>
                </div>
              </article>
            );
          })}
          {balances.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Esta bodega todavía no tiene existencias registradas.</div>}
        </div>
      )}

      {tab === "warehouses" && (
        <div className="px-4 md:px-6 pb-8 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Las bodegas se crean y administran desde la estructura organizacional.</p>
            <a href="/organization" className="text-sm text-primary whitespace-nowrap">Administrar <ExternalLink className="inline h-3.5 w-3.5" /></a>
          </div>
          {warehouses.map((warehouse) => (
            <button key={warehouse.id} onClick={() => { setWarehouseId(warehouse.id); setTab("stock"); }} className="w-full text-left rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Warehouse className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{warehouse.name}</div>
                <div className="text-xs text-muted-foreground">{warehouse.code} · {warehouse.active ? "Activa" : "Inactiva"}</div>
              </div>
              <span className="text-xs text-primary">Ver existencias</span>
            </button>
          ))}
          {warehouses.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No tienes bodegas asignadas.</p>}
        </div>
      )}

      {tab === "kardex" && warehouseId && (
        <div className="px-4 md:px-6 pb-8 space-y-2">
          {movements.map((movement) => {
            const product = productById.get(movement.productId);
            const quantity = movement.quantityDelta;
            return (
              <article key={movement.id} className="rounded-xl bg-card border border-border p-3 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><ScrollText className="h-4 w-4 text-muted-foreground" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{product?.name ?? movement.productId}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(movement.createdAt)} · Lote {movement.lotCode} · {movement.reason}</div>
                  <div className="text-[11px] text-muted-foreground">Saldo: {movement.balanceBefore} → {movement.balanceAfter} {movement.baseUnit}</div>
                </div>
                <div className={`text-sm font-semibold ${quantity >= 0 ? "text-success" : "text-destructive"}`}>{quantity > 0 ? "+" : ""}{quantity}</div>
              </article>
            );
          })}
          {movements.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Sin movimientos registrados en esta bodega.</div>}
        </div>
      )}

      {adjusting && <MovementSheet products={products} warehouseId={warehouseId} onClose={() => setAdjusting(false)} onSaved={refreshWarehouse} />}
      {transferring && <TransferSheet products={products} warehouses={warehouses} sourceWarehouseId={warehouseId} onClose={() => setTransferring(false)} onSaved={refreshAll} />}
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

function MovementSheet({ products, warehouseId, onClose, onSaved }: {
  products: CloudProduct[];
  warehouseId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"receipt" | "issue" | "adjustment">("receipt");
  const [quantity, setQuantity] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const selected = products.find((product) => product.id === productId);
      if (!selected) throw new Error("Selecciona un producto.");
      const amount = Number(quantity);
      if (!Number.isFinite(amount) || (type === "adjustment" ? amount === 0 : amount <= 0)) {
        throw new Error(type === "adjustment" ? "El ajuste debe ser distinto de cero." : "La cantidad debe ser mayor que cero.");
      }
      const expiry = expiryDate ? new Date(`${expiryDate}T23:59:59`).getTime() : undefined;
      await postInventoryMovement({
        productId,
        warehouseId,
        type,
        quantity: amount,
        lotCode: lotCode.trim(),
        ...(expiry !== undefined ? { expiryDate: expiry } : {}),
        ...(unitCost.trim() ? { unitCost: Number(unitCost) } : {}),
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("Movimiento confirmado en Firestore");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Nuevo movimiento de inventario" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block"><span className="text-xs text-muted-foreground">Tipo</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm"><option value="receipt">Entrada</option><option value="issue">Salida</option><option value="adjustment">Ajuste (+/-)</option></select></label>
        <label className="block"><span className="text-xs text-muted-foreground">Producto</span><select required value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm"><option value="">Selecciona…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.baseUnit}</option>)}</select></label>
        <Field label={type === "adjustment" ? "Cantidad (negativo para descontar)" : "Cantidad"} value={quantity} onChange={setQuantity} type="number" />
        <Field label="Lote" value={lotCode} onChange={setLotCode} />
        <label className="block"><span className="text-xs text-muted-foreground">Vencimiento (obligatorio para materias primas y producto terminado al recibir)</span><input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm" /></label>
        {type === "receipt" && <Field label="Costo unitario (opcional)" value={unitCost} onChange={setUnitCost} type="number" />}
        <Field label="Motivo / referencia" value={reason} onChange={setReason} />
        <button type="submit" disabled={saving} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">{saving ? "Guardando…" : "Confirmar movimiento"}</button>
      </form>
    </Sheet>
  );
}

function TransferSheet({ products, warehouses, sourceWarehouseId, onClose, onSaved }: {
  products: CloudProduct[];
  warehouses: InventoryWarehouse[];
  sourceWarehouseId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [targetWarehouseId, setTargetWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [reason, setReason] = useState("Traslado interno");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (!productId) throw new Error("Selecciona un producto.");
      if (!targetWarehouseId || targetWarehouseId === sourceWarehouseId) throw new Error("Selecciona una bodega destino diferente.");
      const amount = Number(quantity);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("La cantidad debe ser mayor que cero.");
      await transferInventory({
        productId,
        sourceWarehouseId,
        targetWarehouseId,
        quantity: amount,
        lotCode,
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("Traslado confirmado en Firestore");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo trasladar el inventario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Traslado entre bodegas" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block"><span className="text-xs text-muted-foreground">Producto</span><select required value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm"><option value="">Selecciona…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="block"><span className="text-xs text-muted-foreground">Bodega destino</span><select required value={targetWarehouseId} onChange={(event) => setTargetWarehouseId(event.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm"><option value="">Selecciona…</option>{warehouses.filter((warehouse) => warehouse.id !== sourceWarehouseId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <Field label="Lote" value={lotCode} onChange={setLotCode} />
        <Field label="Cantidad" value={quantity} onChange={setQuantity} type="number" />
        <Field label="Motivo" value={reason} onChange={setReason} />
        <button type="submit" disabled={saving} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">{saving ? "Trasladando…" : "Confirmar traslado"}</button>
      </form>
    </Sheet>
  );
}
