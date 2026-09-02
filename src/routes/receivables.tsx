import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, getSettings, type Receivable, type PaymentMethod } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Sheet, Field } from "./suppliers";
import { payReceivable } from "@/lib/erp";
import { HandCoins, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/receivables")({
  head: () => ({
    meta: [
      { title: "Cartera y cuentas por cobrar — ERP" },
      { name: "description", content: "Controla ventas a crédito, abonos parciales, vencimientos y clientes en mora." },
      { property: "og:title", content: "Cartera y cuentas por cobrar — ERP" },
      { property: "og:description", content: "Controla ventas a crédito, abonos parciales, vencimientos y clientes en mora." },
    ],
  }),
  component: ReceivablesPage,
});

function ReceivablesPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const list = useLiveQuery(async () => (await db.receivables.toArray()).sort((a, b) => a.dueDate - b.dueDate), []);
  const [selected, setSelected] = useState<Receivable | null>(null);

  const open = (list ?? []).filter((r) => r.status === "open");
  const totalDue = open.reduce((a, r) => a + (r.total - r.paid), 0);
  const overdue = open.filter((r) => r.dueDate < Date.now());

  return (
    <div>
      <PageHeader title="Cartera" subtitle={`Por cobrar: ${formatMoney(totalDue, settings)}`} />

      <div className="px-4 md:px-6 space-y-3">
        {overdue.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {overdue.length} cuenta(s) en mora
          </div>
        )}
        {list?.map((r) => {
          const due = r.total - r.paid;
          const late = r.status === "open" && r.dueDate < Date.now();
          return (
            <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg grid place-items-center ${r.status === "paid" ? "bg-success/15 text-success" : late ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                {r.status === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <HandCoins className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.customerName}</div>
                <div className="text-xs text-muted-foreground">
                  Venta #{r.saleNumber} · vence {formatDate(r.dueDate)}
                  {r.status === "cancelled" && " · anulada"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{formatMoney(due, settings)}</div>
                <div className="text-[11px] text-muted-foreground">de {formatMoney(r.total, settings)}</div>
              </div>
            </button>
          );
        })}
        {list?.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            Sin cuentas por cobrar. Las ventas con pago "Crédito" aparecen aquí.
          </div>
        )}
      </div>

      {selected && <ReceivableDetail rec={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReceivableDetail({ rec, onClose }: { rec: Receivable; onClose: () => void }) {
  const { user } = useAuth();
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const live = useLiveQuery(() => db.receivables.get(rec.id!), [rec.id]) ?? rec;
  const payments = useLiveQuery(async () => (await db.arPayments.toArray()).filter((p) => p.receivableId === rec.id), [rec.id]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const due = live.total - live.paid;

  async function abonar() {
    try {
      await payReceivable(live.id!, Number(amount) || 0, method, user?.id);
      toast.success("Abono registrado");
      setAmount("");
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  return (
    <Sheet title={`${live.customerName}`} onClose={onClose}>
      <div className="rounded-xl bg-background border border-border p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Venta</span><span>#{live.saleNumber}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{formatMoney(live.total, settings)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Abonado</span><span>{formatMoney(live.paid, settings)}</span></div>
        <div className="flex justify-between font-bold text-base"><span>Saldo</span><span>{formatMoney(due, settings)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Vence</span><span>{formatDate(live.dueDate)}</span></div>
      </div>

      {live.status === "open" && (
        <>
          <Field label="Monto del abono" value={amount} onChange={setAmount} type="number" />
          <label className="block">
            <span className="text-xs text-muted-foreground">Medio de pago</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setAmount(String(due))} className="h-12 px-3 rounded-xl bg-muted text-xs font-medium">Saldo total</button>
            <button onClick={abonar} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Registrar abono</button>
          </div>
        </>
      )}

      {payments && payments.length > 0 && (
        <div className="text-xs space-y-1">
          <div className="font-semibold text-sm">Historial de abonos</div>
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between text-muted-foreground">
              <span>{formatDate(p.createdAt)} · {p.method}</span>
              <span className="text-foreground">{formatMoney(p.amount, settings)}</span>
            </div>
          ))}
        </div>
      )}

      <Attachments
        refType="ar_payment"
        refId={live.id!}
        title="Evidencias de pago"
        hint="Sube consignaciones, transferencias o la factura de la venta a crédito."
      />
    </Sheet>

  );
}
