import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, getSettings, type AccountType } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate, startOfDay } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Sheet, Field } from "./suppliers";
import { trialBalance, postEntry, ACC } from "@/lib/erp";
import { BookOpen, Plus, Landmark } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Contabilidad — ERP" },
      { name: "description", content: "Plan de cuentas, libro diario automático, balance de prueba y estado de resultados." },
      { property: "og:title", content: "Contabilidad — ERP" },
      { property: "og:description", content: "Plan de cuentas, libro diario automático, balance de prueba y estado de resultados." },
    ],
  }),
  component: AccountingPage,
});

type Tab = "balance" | "journal" | "accounts";

const TYPE_LABEL: Record<AccountType, string> = {
  activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio",
  ingreso: "Ingreso", gasto: "Gasto", costo: "Costo",
};

function AccountingPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const [tab, setTab] = useState<Tab>("balance");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);

  const balances = useLiveQuery(async () => {
    await db.journalEntries.count();
    return trialBalance();
  }, []);
  const entries = useLiveQuery(async () => (await db.journalEntries.toArray()).sort((a, b) => b.date - a.date).slice(0, 150), []);
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).sort((a, b) => a.code.localeCompare(b.code)), []);

  const income = (balances ?? []).filter((b) => b.type === "ingreso").reduce((a, b) => a + b.balance, 0);
  const expenses = (balances ?? []).filter((b) => b.type === "gasto" || b.type === "costo").reduce((a, b) => a + b.balance, 0);
  const profit = income - expenses;
  const assets = (balances ?? []).filter((b) => b.type === "activo").reduce((a, b) => a + b.balance, 0);
  const liabilities = (balances ?? []).filter((b) => b.type === "pasivo").reduce((a, b) => a + b.balance, 0);

  return (
    <div>
      <PageHeader title="Contabilidad" subtitle={settings?.businessName} />

      <div className="px-4 md:px-6 flex gap-2 overflow-x-auto pb-2">
        <TabBtn active={tab === "balance"} onClick={() => setTab("balance")}>Balance</TabBtn>
        <TabBtn active={tab === "journal"} onClick={() => setTab("journal")}>Libro diario</TabBtn>
        <TabBtn active={tab === "accounts"} onClick={() => setTab("accounts")}>Plan de cuentas</TabBtn>
      </div>

      {tab === "balance" && (
        <div className="px-4 md:px-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Ingresos" value={formatMoney(income, settings)} />
            <Kpi label="Costos y gastos" value={formatMoney(expenses, settings)} />
            <Kpi label="Utilidad" value={formatMoney(profit, settings)} accent={profit >= 0 ? "text-success" : "text-destructive"} />
            <Kpi label="Activos" value={formatMoney(assets, settings)} />
            <Kpi label="Pasivos" value={formatMoney(liabilities, settings)} />
            <Kpi label="Patrimonio" value={formatMoney(assets - liabilities, settings)} />
          </div>

          <button onClick={() => setExpenseOpen(true)} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Registrar gasto
          </button>

          <div className="rounded-xl bg-card border border-border divide-y divide-border">
            <div className="px-3 py-2 text-xs text-muted-foreground flex justify-between">
              <span>Cuenta</span><span>Saldo</span>
            </div>
            {balances?.filter((b) => b.debit !== 0 || b.credit !== 0).map((b) => (
              <div key={b.code} className="px-3 py-2.5 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground">{b.code} · {TYPE_LABEL[b.type]}</div>
                </div>
                <div className="font-semibold">{formatMoney(b.balance, settings)}</div>
              </div>
            ))}
            {balances?.every((b) => b.debit === 0 && b.credit === 0) && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin movimientos contables aún</div>
            )}
          </div>
        </div>
      )}

      {tab === "journal" && (
        <div className="px-4 md:px-6 space-y-2">
          <button onClick={() => setEntryOpen(true)} className="w-full h-11 rounded-xl border border-border text-sm font-semibold inline-flex items-center justify-center gap-2">
            <BookOpen className="h-4 w-4" /> Asiento manual
          </button>
          {entries?.map((e) => (
            <div key={e.id} className="rounded-xl bg-card border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{e.description}</div>
                <div className="text-[11px] text-muted-foreground shrink-0">{formatDate(e.date)}</div>
              </div>
              <div className="mt-2 space-y-0.5">
                {e.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate">{l.accountCode} {l.accountName}</span>
                    <span className={l.debit ? "text-success" : "text-primary"}>
                      {l.debit ? `D ${formatMoney(l.debit, settings)}` : `C ${formatMoney(l.credit, settings)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {entries?.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">El libro diario se llena automáticamente con ventas y compras</div>}
        </div>
      )}

      {tab === "accounts" && (
        <div className="px-4 md:px-6 space-y-2">
          {accounts?.map((a) => (
            <div key={a.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center"><Landmark className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.code} · {TYPE_LABEL[a.type]}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {expenseOpen && <ExpenseSheet onClose={() => setExpenseOpen(false)} />}
      {entryOpen && <ManualEntrySheet onClose={() => setEntryOpen(false)} />}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${accent ?? ""}`}>{value}</div>
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

function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState(ACC.misc);
  const [pay, setPay] = useState(ACC.cash);
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).filter((a) => a.type === "gasto" || a.type === "costo"), []);

  return (
    <Sheet title="Registrar gasto" onClose={onClose}>
      <Field label="Descripción" value={desc} onChange={setDesc} />
      <Field label="Monto" value={amount} onChange={setAmount} type="number" />
      <label className="block">
        <span className="text-xs text-muted-foreground">Cuenta de gasto</span>
        <select value={account} onChange={(e) => setAccount(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
          {accounts?.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Pagado con</span>
        <select value={pay} onChange={(e) => setPay(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
          <option value={ACC.cash}>Caja</option>
          <option value={ACC.bank}>Bancos</option>
          <option value={ACC.ap}>Por pagar</option>
        </select>
      </label>
      <button
        onClick={async () => {
          const v = Number(amount) || 0;
          if (!desc.trim() || v <= 0) { toast.error("Completa descripción y monto"); return; }
          await postEntry({
            description: desc.trim(),
            refType: "expense",
            date: startOfDay() + 43200000,
            ...(user?.id !== undefined ? { userId: user.id } : {}),
            lines: [{ code: account, debit: v }, { code: pay, credit: v }],
          });
          toast.success("Gasto registrado");
          onClose();
        }}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
      >
        Guardar gasto
      </button>
    </Sheet>
  );
}

function ManualEntrySheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).sort((a, b) => a.code.localeCompare(b.code)), []);
  const [desc, setDesc] = useState("");
  const [debitAcc, setDebitAcc] = useState("");
  const [creditAcc, setCreditAcc] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <Sheet title="Asiento manual" onClose={onClose}>
      <Field label="Descripción" value={desc} onChange={setDesc} />
      <label className="block">
        <span className="text-xs text-muted-foreground">Cuenta débito</span>
        <select value={debitAcc} onChange={(e) => setDebitAcc(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
          <option value="">Selecciona…</option>
          {accounts?.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Cuenta crédito</span>
        <select value={creditAcc} onChange={(e) => setCreditAcc(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm">
          <option value="">Selecciona…</option>
          {accounts?.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
      </label>
      <Field label="Monto" value={amount} onChange={setAmount} type="number" />
      <button
        onClick={async () => {
          const v = Number(amount) || 0;
          if (!desc.trim() || !debitAcc || !creditAcc || v <= 0) { toast.error("Completa todos los campos"); return; }
          if (debitAcc === creditAcc) { toast.error("Las cuentas deben ser distintas"); return; }
          await postEntry({
            description: desc.trim(),
            refType: "manual",
            ...(user?.id !== undefined ? { userId: user.id } : {}),
            lines: [{ code: debitAcc, debit: v }, { code: creditAcc, credit: v }],
          });
          toast.success("Asiento registrado");
          onClose();
        }}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
      >
        Guardar asiento
      </button>
    </Sheet>
  );
}
