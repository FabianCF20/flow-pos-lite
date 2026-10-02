import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Undo2, FilePlus2, FileText, ExternalLink, X, FileCheck2 } from "lucide-react";
import {
  db, getSettings, CREDIT_NOTE_CONCEPTS, DEBIT_NOTE_CONCEPTS,
  type Sale, type SaleReturn, type DebitNote, type RefundMode, type CreditNoteConcept, type DebitNoteConcept,
  type FactusInvoiceInfo,
} from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { createSaleReturn, createDebitNote, returnedQtyBySale } from "@/lib/erp";
import { emitFactusCreditNote, emitFactusDebitNote, isFactusConfigured } from "@/lib/factus";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "Devoluciones y notas — ERP" },
      { name: "description", content: "Devoluciones en ventas, notas crédito y notas débito electrónicas con Factus." },
      { property: "og:title", content: "Devoluciones y notas — ERP" },
      { property: "og:description", content: "Notas crédito y débito electrónicas DIAN vía Factus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsPage,
});

const inp = "mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm";

function ReturnsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const [tab, setTab] = useState<"credit" | "debit">("credit");
  const [newFor, setNewFor] = useState<"credit" | "debit" | null>(null);
  const returns = useLiveQuery(async () => (await db.saleReturns.toArray()).sort((a, b) => b.createdAt - a.createdAt), []);
  const debits = useLiveQuery(async () => (await db.debitNotes.toArray()).sort((a, b) => b.createdAt - a.createdAt), []);
  const fx = isFactusConfigured(settings);

  return (
    <div>
      <PageHeader title="Devoluciones y notas" subtitle="Notas crédito y débito sobre ventas" />
      <div className="px-4 md:px-6 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setTab("credit")} className={`h-10 px-4 rounded-lg text-sm font-medium border ${tab === "credit" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>Notas crédito</button>
          <button onClick={() => setTab("debit")} className={`h-10 px-4 rounded-lg text-sm font-medium border ${tab === "debit" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>Notas débito</button>
          <button onClick={() => setNewFor(tab)} className="ml-auto h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2">
            <FilePlus2 className="h-4 w-4" /> Nueva
          </button>
        </div>

        {tab === "credit" && returns?.map((r) => (
          <DocRow key={r.id} title={`Devolución #${r.number} · Venta #${r.saleNumber}`}
            sub={`${formatDate(r.createdAt)} · ${r.customerName} · ${CREDIT_NOTE_CONCEPTS.find((c) => c.code === r.concept)?.label ?? ""}${r.fullVoid ? " · anulación total" : ""}`}
            amount={formatMoney(r.total, settings)} info={r.factus} fx={fx}
            onEmit={async () => { await emitFactusCreditNote(r); }} />
        ))}
        {tab === "credit" && returns?.length === 0 && <Empty />}
        {tab === "debit" && debits?.map((d) => (
          <DocRow key={d.id} title={`Nota débito #${d.number} · Venta #${d.saleNumber}`}
            sub={`${formatDate(d.createdAt)} · ${d.customerName} · ${DEBIT_NOTE_CONCEPTS.find((c) => c.code === d.concept)?.label ?? ""}`}
            amount={formatMoney(d.total, settings)} info={d.factus} fx={fx}
            onEmit={async () => { await emitFactusDebitNote(d); }} />
        ))}
        {tab === "debit" && debits?.length === 0 && <Empty />}
      </div>
      {newFor && <NewDoc kind={newFor} onClose={() => setNewFor(null)} />}
    </div>
  );
}

function Empty() { return <div className="text-center text-sm text-muted-foreground py-8">Sin documentos todavía</div>; }

function DocRow({ title, sub, amount, info, fx, onEmit }: {
  title: string; sub: string; amount: string; info?: FactusInvoiceInfo | undefined; fx: boolean; onEmit: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg grid place-items-center bg-primary/15 text-primary"><Undo2 className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        </div>
        <div className="font-semibold">{amount}</div>
      </div>
      {info?.status === "validated" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-primary font-medium"><FileCheck2 className="h-3.5 w-3.5" /> {info.number}</span>
          {info.cufe && <span className="font-mono truncate max-w-[220px] text-muted-foreground">CUDE {info.cufe}</span>}
          {info.pdfUrl && <a href={info.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-border"><FileText className="h-3 w-3" /> PDF <ExternalLink className="h-3 w-3" /></a>}
          {info.xmlUrl && <a href={info.xmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-border">XML <ExternalLink className="h-3 w-3" /></a>}
        </div>
      ) : fx ? (
        <div className="space-y-1">
          {info?.status === "error" && <div className="text-xs text-destructive">{info.errorMessage}</div>}
          <button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onEmit(); toast.success("Documento electrónico emitido"); }
            catch (e: any) { toast.error(e?.message ?? "Error de Factus"); }
            finally { setBusy(false); }
          }} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
            {busy ? "Emitiendo…" : "Emitir en Factus"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NewDoc({ kind, onClose }: { kind: "credit" | "debit"; onClose: () => void }) {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const { user } = useAuth();
  const sales = useLiveQuery(async () => (await db.sales.toArray()).filter((s) => s.status !== "voided").sort((a, b) => b.createdAt - a.createdAt).slice(0, 200), []);
  const [search, setSearch] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [returned, setReturned] = useState<Map<number, number>>(new Map());
  const [concept, setConcept] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<RefundMode>("cash");
  const [restock, setRestock] = useState(true);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => (sales ?? []).filter((s) => !search || String(s.number).includes(search) || s.factus?.number?.toLowerCase().includes(search.toLowerCase())), [sales, search]);

  async function pick(s: Sale) {
    setSale(s);
    setReturned(await returnedQtyBySale(s.id!));
    setQty({});
    setRefund(s.paymentMethod === "credit" ? "credit_balance" : (s.paymentMethod as RefundMode));
  }

  const lines = sale ? sale.items.map((it, i) => {
    const max = it.qty - (returned.get(it.productId) ?? 0);
    return { ...it, i, max: Math.max(0, max), q: Math.min(qty[i] ?? 0, Math.max(0, max)) };
  }) : [];
  const total = lines.reduce((a, l) => a + l.q * l.unitPrice, 0);

  async function submit() {
    if (!sale) return;
    setBusy(true);
    try {
      if (kind === "credit") {
        const ret: SaleReturn = await createSaleReturn({
          sale, concept: concept as CreditNoteConcept, reason, refundMode: refund, restock,
          items: lines.filter((l) => l.q > 0).map((l) => ({ productId: l.productId, name: l.name, qty: l.q, unitPrice: l.unitPrice, total: l.q * l.unitPrice })),
          ...(user?.id !== undefined ? { userId: user.id } : {}),
        });
        toast.success(`Devolución #${ret.number} registrada`);
        if (settings?.factusAutoCreditNote && isFactusConfigured(settings) && sale.factus?.status === "validated") {
          try { await emitFactusCreditNote(ret); toast.success("Nota crédito electrónica emitida"); }
          catch (e: any) { toast.error(`Factus: ${e?.message}`); }
        }
      } else {
        const note: DebitNote = await createDebitNote({
          sale, concept: concept as DebitNoteConcept, reason, total: amount,
          ...(user?.id !== undefined ? { userId: user.id } : {}),
        });
        toast.success(`Nota débito #${note.number} registrada`);
      }
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Error"); } finally { setBusy(false); }
  }

  const concepts = kind === "credit" ? CREDIT_NOTE_CONCEPTS : DEBIT_NOTE_CONCEPTS;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-lg md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">{kind === "credit" ? "Nueva devolución / nota crédito" : "Nueva nota débito"}</div>
          <button onClick={onClose} aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          {!sale ? (
            <>
              <input className={inp} placeholder="Buscar por ticket o número de factura" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {filtered.map((s) => (
                  <button key={s.id} onClick={() => pick(s)} className="w-full text-left rounded-lg border border-border p-2 flex justify-between text-sm">
                    <span>Ticket #{s.number} {s.factus?.number && <span className="text-primary">· {s.factus.number}</span>}<br /><span className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</span></span>
                    <span className="font-medium">{formatMoney(s.total, settings)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm">Venta <b>#{sale.number}</b> {sale.factus?.number ? `· Factura ${sale.factus.number}` : "· sin factura electrónica"} <button className="text-primary underline ml-2 text-xs" onClick={() => setSale(null)}>cambiar</button></div>
              <label className="block"><span className="text-xs text-muted-foreground">Concepto DIAN</span>
                <select className={inp} value={concept} onChange={(e) => setConcept(Number(e.target.value))}>
                  {concepts.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                </select>
              </label>
              {kind === "credit" ? (
                <>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {lines.map((l) => (
                      <div key={l.i} className="p-2 flex items-center gap-2 text-sm">
                        <div className="flex-1 min-w-0"><div className="truncate">{l.name}</div><div className="text-xs text-muted-foreground">Disponible {l.max} × {formatMoney(l.unitPrice, settings)}</div></div>
                        <button className="h-8 w-8 rounded border border-border" onClick={() => setQty({ ...qty, [l.i]: Math.max(0, l.q - 1) })}>−</button>
                        <span className="w-6 text-center">{l.q}</span>
                        <button className="h-8 w-8 rounded border border-border" onClick={() => setQty({ ...qty, [l.i]: Math.min(l.max, l.q + 1) })}>+</button>
                      </div>
                    ))}
                  </div>
                  <button className="text-xs text-primary underline" onClick={() => setQty(Object.fromEntries(lines.map((l) => [l.i, l.max])))}>Devolver todo (anulación)</button>
                  <label className="block"><span className="text-xs text-muted-foreground">Reembolso</span>
                    <select className={inp} value={refund} onChange={(e) => setRefund(e.target.value as RefundMode)}>
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                      <option value="transfer">Transferencia</option>
                      <option value="credit_balance">Saldo a favor / abono a cartera</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Reingresar productos al inventario</label>
                </>
              ) : (
                <label className="block"><span className="text-xs text-muted-foreground">Valor del cargo (IVA incluido)</span>
                  <input type="number" className={inp} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
                </label>
              )}
              <label className="block"><span className="text-xs text-muted-foreground">Motivo / observación</span>
                <input className={inp} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(kind === "credit" ? total : amount, settings)}</span></div>
              <button disabled={busy || (kind === "credit" ? total <= 0 : amount <= 0)} onClick={submit} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                {busy ? "Guardando…" : "Registrar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
