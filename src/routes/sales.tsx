import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, getSettings, type Sale } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { buildReceiptText } from "@/lib/receipt";
import { isBluetoothSupported, pickPrinter, printText } from "@/lib/printer";
import { X, Printer, Ban, Receipt, FileCheck2, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { emitFactusInvoice, isFactusConfigured } from "@/lib/factus";

export const Route = createFileRoute("/sales")({ component: SalesPage });

function SalesPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const sales = useLiveQuery(async () => (await db.sales.toArray()).sort((a,b)=>b.createdAt-a.createdAt).slice(0, 100), []);
  const [selected, setSelected] = useState<Sale | null>(null);

  return (
    <div>
      <PageHeader title="Ventas" subtitle={`Últimas ${sales?.length ?? 0}`} />
      <div className="px-4 md:px-6 space-y-2">
        {sales?.map((s) => (
          <button key={s.id} onClick={() => setSelected(s)} className="w-full text-left rounded-xl bg-card border border-border p-3 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg grid place-items-center ${s.status === "voided" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
              <Receipt className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Ticket #{s.number} {s.status === "voided" && <span className="text-destructive">(anulada)</span>}</div>
              <div className="text-xs text-muted-foreground">{formatDate(s.createdAt)} · {s.paymentMethod}</div>
            </div>
            <div className="font-semibold">{formatMoney(s.total, settings)}</div>
          </button>
        ))}
        {sales?.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">Sin ventas todavía</div>}
      </div>

      {selected && <SaleDetail sale={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SaleDetail({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const factus = sale.factus;

  async function reprint() {
    if (!settings) return;
    if (!isBluetoothSupported()) { toast.error("Bluetooth no soportado"); return; }
    setBusy(true);
    try {
      const text = buildReceiptText(sale, settings, user?.name ?? "");
      await pickPrinter();
      await printText(text);
      toast.success("Enviado a impresora");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al imprimir");
    } finally { setBusy(false); }
  }

  async function voidSale() {
    if (sale.status === "voided") return;
    if (!confirm("¿Anular esta venta y restaurar stock?")) return;
    await db.transaction("rw", db.sales, db.products, async () => {
      for (const it of sale.items) {
        const p = await db.products.get(it.productId);
        if (p?.trackStock) await db.products.update(it.productId, { stock: p.stock + it.qty });
      }
      await db.sales.update(sale.id!, { status: "voided" });
    });
    toast.success("Venta anulada");
    onClose();
  }

  async function emitInvoice() {
    if (!settings || !isFactusConfigured(settings)) {
      toast.error("Configura Factus en Ajustes");
      return;
    }
    if (sale.status === "voided") { toast.error("Venta anulada"); return; }
    if (factus?.status === "validated") { toast.error("Ya facturada"); return; }
    setInvoicing(true);
    try {
      await emitFactusInvoice(sale);
      toast.success("Factura electrónica emitida");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al emitir factura");
    } finally {
      setInvoicing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-md md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">Ticket #{sale.number}</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground">{formatDate(sale.createdAt)}</div>
          <div className="rounded-lg bg-background border border-border divide-y divide-border">
            {sale.items.map((it, i) => (
              <div key={i} className="p-3 flex justify-between text-sm">
                <div className="min-w-0">
                  <div className="truncate">{it.name}</div>
                  <div className="text-xs text-muted-foreground">{it.qty} × {formatMoney(it.unitPrice, settings)}</div>
                </div>
                <div className="font-medium">{formatMoney(it.total, settings)}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-background border border-border p-3 text-sm space-y-1">
            <Row label="Subtotal" value={formatMoney(sale.subtotal, settings)} />
            {sale.discount > 0 && <Row label="Descuento" value={"-" + formatMoney(sale.discount, settings)} />}
            <Row label="Total" value={formatMoney(sale.total, settings)} bold />
            <Row label={`Pago (${sale.paymentMethod})`} value={formatMoney(sale.paid, settings)} />
            {sale.change > 0 && <Row label="Cambio" value={formatMoney(sale.change, settings)} />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={reprint} className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button onClick={voidSale} disabled={sale.status === "voided"} className="h-12 rounded-xl border border-destructive/40 text-destructive font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Ban className="h-4 w-4" /> Anular
            </button>
          </div>

          {settings?.factusEnabled && (
            <div className="rounded-lg bg-background border border-border p-3 space-y-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary" /> Factura electrónica (Factus)
              </div>
              {factus?.status === "validated" ? (
                <div className="space-y-1 text-xs">
                  {factus.number && <div><span className="text-muted-foreground">Nº: </span><span className="font-medium">{factus.number}</span></div>}
                  {factus.cufe && <div className="truncate"><span className="text-muted-foreground">CUFE: </span><span className="font-mono">{factus.cufe}</span></div>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {factus.pdfUrl && (
                      <a href={factus.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-card border border-border text-xs font-medium">
                        <FileText className="h-3.5 w-3.5" /> PDF <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {factus.xmlUrl && (
                      <a href={factus.xmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-card border border-border text-xs font-medium">
                        XML <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {factus?.status === "error" && (
                    <div className="text-xs text-destructive">{factus.errorMessage}</div>
                  )}
                  <button
                    onClick={emitInvoice}
                    disabled={invoicing || sale.status === "voided"}
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    {invoicing ? "Emitiendo..." : "Emitir factura electrónica"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}><span className={bold ? "" : "text-muted-foreground"}>{label}</span><span>{value}</span></div>;
}