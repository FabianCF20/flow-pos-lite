import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, getSettings, type CashSession } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { ArrowDownCircle, ArrowUpCircle, X, DoorOpen, DoorClosed } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cash")({ component: CashPage });

function CashPage() {
  const { user } = useAuth();
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const open = useLiveQuery(async () => (await db.cashSessions.toArray()).find((s) => !s.closedAt) ?? null, []);
  const movements = useLiveQuery(async () => open ? await db.cashMovements.where("sessionId").equals(open.id!).toArray() : [], [open?.id]);
  const sales = useLiveQuery(async () => open ? await db.sales.where("cashSessionId").equals(open.id!).toArray() : [], [open?.id]);
  const recent = useLiveQuery(async () => (await db.cashSessions.toArray()).filter(s => s.closedAt).sort((a,b) => (b.closedAt!) - (a.closedAt!)).slice(0, 5), []);

  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showMov, setShowMov] = useState<null | "in" | "out">(null);

  const expected = useMemo(() => {
    if (!open) return 0;
    const cashSales = (sales ?? []).filter(s => s.status === "completed" && s.paymentMethod === "cash").reduce((a, s) => a + s.total, 0);
    const ins = (movements ?? []).filter(m => m.type === "in").reduce((a, m) => a + m.amount, 0);
    const outs = (movements ?? []).filter(m => m.type === "out").reduce((a, m) => a + m.amount, 0);
    return open.openingAmount + cashSales + ins - outs;
  }, [open, sales, movements]);

  return (
    <div>
      <PageHeader title="Caja" subtitle={open ? `Abierta — ${formatDate(open.openedAt)}` : "Sin sesión activa"} />

      <div className="px-4 md:px-6 space-y-3">
        {!open ? (
          <div className="rounded-2xl bg-card border border-border p-5 text-center">
            <DoorClosed className="h-10 w-10 mx-auto text-muted-foreground" />
            <div className="mt-3 font-semibold">Caja cerrada</div>
            <p className="text-sm text-muted-foreground mt-1">Abre una sesión para empezar a vender</p>
            <button onClick={() => setShowOpen(true)} className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-medium">Abrir caja</button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-glow p-5 text-primary-foreground">
              <div className="text-xs uppercase opacity-80">Efectivo esperado</div>
              <div className="text-3xl font-bold mt-1">{formatMoney(expected, settings)}</div>
              <div className="text-xs opacity-80 mt-2">Apertura: {formatMoney(open.openingAmount, settings)}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setShowMov("in")} className="h-14 rounded-xl bg-card border border-border flex flex-col items-center justify-center text-xs">
                <ArrowDownCircle className="h-5 w-5 text-success" /> Ingreso
              </button>
              <button onClick={() => setShowMov("out")} className="h-14 rounded-xl bg-card border border-border flex flex-col items-center justify-center text-xs">
                <ArrowUpCircle className="h-5 w-5 text-destructive" /> Retiro
              </button>
              <button onClick={() => setShowClose(true)} className="h-14 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive flex flex-col items-center justify-center text-xs">
                <DoorOpen className="h-5 w-5" /> Cerrar
              </button>
            </div>

            <div className="rounded-xl bg-card border border-border">
              <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">Movimientos</div>
              <div className="divide-y divide-border">
                {(movements ?? []).length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">Sin movimientos</div>}
                {(movements ?? []).map((m) => (
                  <div key={m.id} className="p-3 flex items-center gap-3">
                    {m.type === "in" ? <ArrowDownCircle className="h-4 w-4 text-success" /> : <ArrowUpCircle className="h-4 w-4 text-destructive" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{m.reason}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</div>
                    </div>
                    <div className={`text-sm font-semibold ${m.type === "in" ? "text-success" : "text-destructive"}`}>
                      {m.type === "in" ? "+" : "-"}{formatMoney(m.amount, settings)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {recent && recent.length > 0 && (
          <div className="rounded-xl bg-card border border-border">
            <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">Cierres recientes</div>
            <div className="divide-y divide-border">
              {recent.map((s) => (
                <div key={s.id} className="p-3 text-sm flex justify-between">
                  <div>
                    <div>{formatDate(s.closedAt!)}</div>
                    <div className="text-xs text-muted-foreground">Esperado {formatMoney(s.expectedAmount ?? 0, settings)} · Contado {formatMoney(s.countedAmount ?? 0, settings)}</div>
                  </div>
                  <div className={`font-semibold ${(s.difference ?? 0) === 0 ? "" : (s.difference ?? 0) > 0 ? "text-success" : "text-destructive"}`}>
                    {(s.difference ?? 0) >= 0 ? "+" : ""}{formatMoney(s.difference ?? 0, settings)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showOpen && <OpenSheet onClose={() => setShowOpen(false)} userId={user!.id!} />}
      {showClose && open && <CloseSheet session={open} expected={expected} onClose={() => setShowClose(false)} />}
      {showMov && open && <MovSheet type={showMov} sessionId={open.id!} userId={user!.id!} onClose={() => setShowMov(null)} />}
    </div>
  );
}

function OpenSheet({ onClose, userId }: { onClose: () => void; userId: number }) {
  const [amount, setAmount] = useState("0");
  async function open() {
    await db.cashSessions.add({ userId, openedAt: Date.now(), openingAmount: Number(amount) || 0 });
    toast.success("Caja abierta");
    onClose();
  }
  return <Sheet title="Abrir caja" onClose={onClose}>
    <Field label="Monto inicial en efectivo">
      <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="ipt text-right text-lg" />
    </Field>
    <button onClick={open} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold mt-2">Abrir</button>
  </Sheet>;
}

function CloseSheet({ session, expected, onClose }: { session: CashSession; expected: number; onClose: () => void }) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const diff = (Number(counted) || 0) - expected;
  async function close() {
    await db.cashSessions.update(session.id!, {
      closedAt: Date.now(),
      countedAmount: Number(counted) || 0,
      expectedAmount: expected,
      difference: diff,
      notes,
    });
    toast.success("Caja cerrada");
    onClose();
  }
  return <Sheet title="Cerrar caja" onClose={onClose}>
    <div className="rounded-lg bg-background border border-border p-3 text-sm flex justify-between">
      <span className="text-muted-foreground">Esperado</span><span className="font-semibold">{formatMoney(expected)}</span>
    </div>
    <Field label="Efectivo contado">
      <input type="number" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus className="ipt text-right text-lg" />
    </Field>
    <div className={`rounded-lg p-3 text-sm flex justify-between ${diff === 0 ? "bg-muted" : diff > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
      <span>Diferencia</span><span className="font-semibold">{formatMoney(diff)}</span>
    </div>
    <Field label="Notas (opc.)">
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="ipt h-auto py-2" />
    </Field>
    <button onClick={close} className="w-full h-12 rounded-xl bg-destructive text-destructive-foreground font-semibold mt-2">Cerrar caja</button>
  </Sheet>;
}

function MovSheet({ type, sessionId, userId, onClose }: { type: "in" | "out"; sessionId: number; userId: number; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  async function save() {
    if (!Number(amount)) { toast.error("Monto requerido"); return; }
    if (!reason.trim()) { toast.error("Motivo requerido"); return; }
    await db.cashMovements.add({ sessionId, type, amount: Number(amount), reason, userId, createdAt: Date.now() });
    toast.success("Registrado"); onClose();
  }
  return <Sheet title={type === "in" ? "Ingreso de efectivo" : "Retiro de efectivo"} onClose={onClose}>
    <Field label="Monto"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="ipt text-right text-lg" /></Field>
    <Field label="Motivo"><input value={reason} onChange={(e) => setReason(e.target.value)} className="ipt" /></Field>
    <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold mt-2">Guardar</button>
  </Sheet>;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-md md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
      <style>{`.ipt{width:100%;height:44px;padding:0 12px;border-radius:10px;background:var(--background);border:1px solid var(--border);outline:none;font-size:14px;color:var(--foreground)}.ipt:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}