import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { listCloudProducts, type CloudProduct } from "@/lib/cloud-catalog";
import { createSalesOrder, listSalesOrders, type SalesOrder } from "@/lib/cloud-orders";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ClipboardList, Plus, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Pedidos de venta — ERP" }, { name: "description", content: "Pedidos de productos terminados y seguimiento de despachos." }] }),
  component: OrdersPage,
});

type DraftLine = { productId: string; quantity: string };

function OrdersPage() {
  const { can, loading } = useAuth();
  const canRead = can("orders", "read");
  const canWrite = can("orders", "write");
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  const finishedProducts = useMemo(
    () => products.filter((product) => product.active && product.productType === "finished_product"),
    [products],
  );

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [nextProducts, nextOrders] = await Promise.all([listCloudProducts(), listSalesOrders()]);
      setProducts(nextProducts);
      setOrders(nextOrders);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron consultar los pedidos.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canRead) void reload();
  }, [loading, canRead, reload]);

  function addLine() {
    const amount = Number(quantity);
    if (!productId) { toast.error("Selecciona un producto terminado."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Indica una cantidad válida."); return; }
    if (lines.some((line) => line.productId === productId)) { toast.error("Ese producto ya está en el pedido."); return; }
    setLines((current) => [...current, { productId, quantity: String(amount) }]);
    setProductId("");
    setQuantity("1");
  }

  async function saveOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite) { toast.error("No tienes permiso para crear pedidos."); return; }
    setBusy(true);
    try {
      await createSalesOrder({
        customerName,
        customerDocument,
        deliveryAddress,
        notes,
        lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
      });
      toast.success("Pedido creado en Firestore. No se descontó inventario.");
      setCustomerName("");
      setCustomerDocument("");
      setDeliveryAddress("");
      setNotes("");
      setLines([]);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el pedido.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!canRead) return <div className="p-6 text-sm text-destructive">No tienes permiso para consultar pedidos.</div>;

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Los pedidos se registran sin descontar existencias. El inventario cambia al confirmar el despacho."
        right={<button onClick={() => void reload()} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-2"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar</button>}
      />

      {canWrite && (
        <form onSubmit={saveOrder} className="mx-4 md:mx-6 mb-6 rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Nuevo pedido</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Cliente / destinatario
              <input required maxLength={160} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="Nombre o razón social" />
            </label>
            <label className="text-xs text-muted-foreground">Documento del cliente (opcional)
              <input value={customerDocument} onChange={(event) => setCustomerDocument(event.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="NIT / identificación" />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">Dirección de entrega
            <input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="Dirección o punto de entrega" />
          </label>
          <div className="grid sm:grid-cols-[minmax(0,1fr)_110px_auto] gap-2 items-end">
            <label className="text-xs text-muted-foreground">Producto terminado
              <select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground">
                <option value="">Selecciona producto…</option>
                {finishedProducts.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Cantidad
              <input type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <button type="button" onClick={addLine} className="h-10 px-3 rounded-lg border border-border text-sm inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" /> Agregar</button>
          </div>
          {lines.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border">
              {lines.map((line) => {
                const product = finishedProducts.find((item) => item.id === line.productId);
                return <div key={line.productId} className="p-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0"><div className="font-medium truncate">{product?.name}</div><div className="text-xs text-muted-foreground">{product?.code} · {product?.baseUnit}</div></div>
                  <span className="font-semibold">{line.quantity} {product?.baseUnit}</span>
                  <button type="button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))} aria-label="Quitar producto" className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>;
              })}
            </div>
          )}
          <label className="block text-xs text-muted-foreground">Observaciones
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full p-3 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="Instrucciones para preparación o entrega" />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{lines.length} producto(s) en el pedido</span>
            <button type="submit" disabled={busy || lines.length === 0} className="h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{busy ? "Guardando…" : "Crear pedido"}</button>
          </div>
        </form>
      )}

      <div className="px-4 md:px-6 pb-8 space-y-3">
        <div className="font-semibold text-sm">Historial de pedidos ({orders.length})</div>
        {orders.map((order) => (
          <article key={order.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><div className="font-semibold text-sm">{order.orderCode}</div><div className="text-xs text-muted-foreground">{order.customerName} · {formatDate(order.createdAt)}</div></div>
              <span className="text-xs rounded-full bg-muted px-2.5 py-1">{order.status === "open" ? "Pendiente" : order.status === "partially_dispatched" ? "Parcial" : order.status === "dispatched" ? "Despachado" : "Cancelado"}</span>
            </div>
            <div className="text-xs text-muted-foreground">{order.lines.map((line) => `${line.productName}: ${line.dispatchedQty}/${line.orderedQty} ${line.baseUnit}`).join(" · ")}</div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total del pedido</span><strong>{formatMoney(order.subtotal)}</strong></div>
          </article>
        ))}
        {orders.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Todavía no hay pedidos en Firestore.</div>}
      </div>
    </div>
  );
}
