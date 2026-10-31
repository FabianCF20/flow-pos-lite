import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { listAccessibleWarehouses, type InventoryWarehouse } from "@/lib/cloud-inventory";
import { confirmSalesOrderDispatch, listDispatchNotifications, listDispatchQueue, type DispatchNotification, type SalesOrder } from "@/lib/cloud-orders";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { RefreshCw, Truck, PackageCheck } from "lucide-react";

export const Route = createFileRoute("/dispatch")({
  head: () => ({ meta: [{ title: "Despachos — ERP" }, { name: "description", content: "Preparación, despacho parcial y descuento confirmado de inventario." }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const { can, loading } = useAuth();
  const canRead = can("dispatch", "read");
  const canConfirm = can("dispatch", "write") && can("inventory", "write");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [notifications, setNotifications] = useState<DispatchNotification[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [nextOrders, nextNotifications, nextWarehouses] = await Promise.all([
        listDispatchQueue(),
        listDispatchNotifications(),
        listAccessibleWarehouses(),
      ]);
      setOrders(nextOrders);
      setNotifications(nextNotifications);
      setWarehouses(nextWarehouses);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la cola de despachos.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canRead) void reload();
  }, [loading, canRead, reload]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!canRead) return <div className="p-6 text-sm text-destructive">No tienes permiso para consultar despachos.</div>;

  return (
    <div>
      <PageHeader
        title="Despachos"
        subtitle="Solo al confirmar la salida se descuentan las existencias y se registra el movimiento de inventario."
        right={<button onClick={() => void reload()} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-2"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar</button>}
      />
      <div className="px-4 md:px-6 pb-8 space-y-4">
        {notifications.some((item) => item.status === "pending") && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <strong>{notifications.filter((item) => item.status === "pending").length} pedido(s) nuevo(s).</strong>
            <span className="text-muted-foreground"> Ventas registró pedidos que requieren preparación y despacho.</span>
          </div>
        )}
        {warehouses.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            No tienes bodegas asignadas. Solicita al administrador que asigne una bodega a tu usuario.
          </div>
        )}
        {orders.map((order) => (
          <DispatchOrderCard
            key={order.id}
            order={order}
            warehouses={warehouses}
            canConfirm={canConfirm}
            notificationStatus={notifications.find((item) => item.orderId === order.id)?.status}
            onSaved={reload}
          />
        ))}
        {orders.length === 0 && !busy && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <PackageCheck className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No hay pedidos pendientes</div>
            <div className="text-sm text-muted-foreground mt-1">Los pedidos nuevos aparecerán aquí para su preparación y despacho.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DispatchOrderCard({ order, warehouses, canConfirm, notificationStatus, onSaved }: {
  order: SalesOrder;
  warehouses: InventoryWarehouse[];
  canConfirm: boolean;
  notificationStatus?: DispatchNotification["status"];
  onSaved: () => Promise<void>;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(warehouses[0].id);
  }, [warehouseId, warehouses]);

  const pendingLines = order.lines.filter((line) => line.orderedQty > line.dispatchedQty);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    const lines = pendingLines
      .map((line) => ({
        productId: line.productId,
        quantity: Number(quantities[line.productId] ?? 0),
        lotCode: line.trackInventory ? (lots[line.productId] ?? "").trim() : "NO_INVENTORY",
      }))
      .filter((line) => line.quantity > 0);
    if (!warehouseId) { toast.error("Selecciona la bodega de salida."); return; }
    if (!lines.length) { toast.error("Indica al menos una cantidad para despachar."); return; }
    if (lines.some((line) => !line.lotCode)) { toast.error("Indica el lote de cada producto con control de inventario."); return; }

    setSaving(true);
    try {
      await confirmSalesOrderDispatch({
        orderId: order.id,
        warehouseId,
        lines,
        notes,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("Despacho confirmado. Inventario actualizado en Firestore.");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo confirmar el despacho.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={confirm} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-semibold">{order.orderCode}</div><div className="text-xs text-muted-foreground">{order.customerName} · {formatDate(order.createdAt)}</div></div>
        <span className="text-xs rounded-full bg-muted px-2.5 py-1">{notificationStatus === "pending" ? "Nuevo pedido" : notificationStatus === "in_progress" ? "En preparación" : order.status === "partially_dispatched" ? "Despacho parcial" : "Pendiente"}</span>
      </div>
      {order.deliveryAddress && <div className="text-xs text-muted-foreground">Entrega: {order.deliveryAddress}</div>}
      <div className="space-y-2">
        {pendingLines.map((line) => {
          const remaining = line.orderedQty - line.dispatchedQty;
          return (
            <div key={line.productId} className="rounded-lg bg-background border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="text-sm font-medium">{line.productName}</div><div className="text-xs text-muted-foreground">Pendiente: {remaining} {line.baseUnit}</div></div>
                <div className="text-xs text-muted-foreground">{line.trackInventory ? "Control por lote" : "Sin control de stock"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Cantidad a despachar
                  <input type="number" min="0" max={remaining} step="any" value={quantities[line.productId] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.productId]: event.target.value }))} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-card text-sm text-foreground" placeholder={String(remaining)} />
                </label>
                {line.trackInventory && <label className="text-xs text-muted-foreground">Lote
                  <input value={lots[line.productId] ?? ""} onChange={(event) => setLots((current) => ({ ...current, [line.productId]: event.target.value }))} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-card text-sm text-foreground" placeholder="Código del lote" />
                </label>}
              </div>
            </div>
          );
        })}
      </div>
      <label className="block text-xs text-muted-foreground">Bodega de salida
        <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground">
          <option value="">Selecciona bodega…</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">Observaciones del despacho
        <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full p-3 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="Novedades, transportador o referencia" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{order.dispatchedQtyTotal}/{order.orderedQtyTotal} unidades despachadas</span>
        <button type="submit" disabled={!canConfirm || saving || warehouses.length === 0} className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"><Truck className="h-4 w-4" />{!canConfirm ? "Solo consulta" : saving ? "Confirmando…" : "Confirmar despacho"}</button>
      </div>
    </form>
  );
}
