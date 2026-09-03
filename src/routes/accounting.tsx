import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, getSettings, type AccountType } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate, startOfDay } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Sheet, Field } from "./suppliers";
import { Attachments } from "@/components/Attachments";
import { trialBalance, postEntry, incomeStatement, salesIncome, ledger, toCSV, ACC } from "@/lib/erp";
import { downloadBlob } from "@/lib/backup";
import { BookOpen, Plus, Landmark, Download, TrendingUp, Paperclip } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Contabilidad e ingresos — ERP" },
      { name: "description", content: "Estado de resultados, ingresos por ventas, balance, libro diario, libro mayor y documentos soporte." },
      { property: "og:title", content: "Contabilidad e ingresos — ERP" },
      { property: "og:description", content: "Estado de resultados, ingresos por ventas, balance, libro diario, libro mayor y documentos soporte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountingPage,
});

type Tab = "results" | "balance" | "journal" | "ledger" | "accounts";
type Period = "month" | "year" | "all";

const TYPE_LABEL: Record<AccountType, string> = {
  activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio",
  ingreso: "Ingreso", gasto: "Gasto", costo: "Costo",
};

function periodRange(p: Period): { from?: number; to?: number; label: string } {
  const now = new Date();
  if (p === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { from, to: Date.now(), label: "Mes actual" };
  }
  if (p === "year") {
    const from = new Date(now.getFullYear(), 0, 1).getTime();
    return { from, to: Date.now(), label: `Año ${now.getFullYear()}` };
  }
  return { label: "Histórico" };
}

function AccountingPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const [tab, setTab] = useState<Tab>("results");
  const [period, setPeriod] = useState<Period>("month");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const range = periodRange(period);

  const pl = useLiveQuery(async () => {
    await db.journalEntries.count();
    return incomeStatement(range.from, range.to);
  }, [period]);
  const sales = useLiveQuery(async () => {
    await db.sales.count();
    return salesIncome(range.from, range.to);
  }, [period]);
  const balances = useLiveQuery(async () => {
    await db.journalEntries.count();
    return trialBalance(range.from, range.to);
  }, [period]);
  const entries = useLiveQuery(async () => {
    const all = await db.journalEntries.toArray();
    return all
      .filter((e) => (range.from === undefined || e.date >= range.from) && (range.to === undefined || e.date <= range.to))
      .sort((a, b) => b.date - a.date)
      .slice(0, 200);
  }, [period]);
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).sort((a, b) => a.code.localeCompare(b.code)), []);

  const assets = (balances ?? []).filter((b) => b.type === "activo").reduce((a, b) => a + b.balance, 0);
  const liabilities = (balances ?? []).filter((b) => b.type === "pasivo").reduce((a, b) => a + b.balance, 0);
  const equity = (balances ?? []).filter((b) => b.type === "patrimonio").reduce((a, b) => a + b.balance, 0);

  function exportPL() {
    if (!pl) return;
    const rows: (string | number)[][] = [
      ["Estado de resultados", range.label],
      [],
      ["Concepto", "Valor"],
      ["Ingresos por ventas", pl.sales],
      ["Devoluciones en ventas", -pl.returns],
      ["Otros ingresos", pl.otherIncome],
      ["Ingresos netos", pl.netRevenue],
      ["Costo de ventas", -pl.cogs],
      ["Otros costos", -pl.otherCosts],
      ["Utilidad bruta", pl.grossProfit],
      ["Gastos operacionales", -pl.expenses],
      ["Utilidad neta", pl.netProfit],
      [],
      ["Detalle", "Código", "Saldo"],
      ...[...pl.revenueRows, ...pl.costRows, ...pl.expenseRows].map((r) => [r.name, r.code, r.balance] as (string | number)[]),
    ];
    downloadBlob(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }), `estado-resultados-${period}.csv`);
  }

  return (
    <div>
      <PageHeader title="Contabilidad" subtitle={settings?.businessName} />

      <div className="px-4 md:px-6 flex gap-2 overflow-x-auto pb-2">
        <TabBtn active={tab === "results"} onClick={() => setTab("results")}>Resultados</TabBtn>
        <TabBtn active={tab === "balance"} onClick={() => setTab("balance")}>Balance</TabBtn>
        <TabBtn active={tab === "journal"} onClick={() => setTab("journal")}>Libro diario</TabBtn>
        <TabBtn active={tab === "ledger"} onClick={() => setTab("ledger")}>Libro mayor</TabBtn>
        <TabBtn active={tab === "accounts"} onClick={() => setTab("accounts")}>Plan de cuentas</TabBtn>
      </div>

      {tab !== "accounts" && (
        <div className="px-4 md:px-6 flex items-center gap-2 pb-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="h-9 px-3 rounded-lg bg-card border border-border text-xs"
            aria-label="Periodo"
          >
            <option value="month">Mes actual</option>
            <option value="year">Año actual</option>
            <option value="all">Histórico</option>
          </select>
          <span className="text-xs text-muted-foreground">{range.label}</span>
        </div>
      )}

      {tab === "results" && (
        <div className="px-4 md:px-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Ingresos por ventas" value={formatMoney(pl?.sales ?? 0, settings)} accent="text-primary" />
            <Kpi label="Ingresos netos" value={formatMoney(pl?.netRevenue ?? 0, settings)} />
            <Kpi label="Utilidad bruta" value={formatMoney(pl?.grossProfit ?? 0, settings)} />
            <Kpi
              label="Utilidad neta"
              value={formatMoney(pl?.netProfit ?? 0, settings)}
              accent={(pl?.netProfit ?? 0) >= 0 ? "text-success" : "text-destructive"}
            />
          </div>

          <div className="rounded-xl bg-card border border-border p-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" /> Estado de resultados
            </div>
            <Row label="Ingresos por ventas (4135)" value={formatMoney(pl?.sales ?? 0, settings)} />
            <Row label="(-) Devoluciones en ventas" value={formatMoney(-(pl?.returns ?? 0), settings)} />
            <Row label="(+) Otros ingresos" value={formatMoney(pl?.otherIncome ?? 0, settings)} />
            <Row label="Ingresos netos" value={formatMoney(pl?.netRevenue ?? 0, settings)} strong />
            <Row label="(-) Costo de ventas" value={formatMoney(-(pl?.cogs ?? 0), settings)} />
            <Row label="(-) Otros costos e importación" value={formatMoney(-(pl?.otherCosts ?? 0), settings)} />
            <Row label="Utilidad bruta" value={formatMoney(pl?.grossProfit ?? 0, settings)} strong />
            <Row label="(-) Gastos operacionales" value={formatMoney(-(pl?.expenses ?? 0), settings)} />
            <Row label="Utilidad neta" value={formatMoney(pl?.netProfit ?? 0, settings)} strong />
            <Row label="Margen neto" value={`${(pl?.margin ?? 0).toFixed(1)} %`} />
          </div>

          <div className="rounded-xl bg-card border border-border p-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ingresos registrados en ventas
            </div>
            <Row label="Ventas facturadas" value={String(sales?.count ?? 0)} />
            <Row label="Total facturado (con IVA)" value={formatMoney(sales?.gross ?? 0, settings)} />
            <Row label="Base gravable" value={formatMoney(sales?.base ?? 0, settings)} />
            <Row label="IVA generado" value={formatMoney(sales?.tax ?? 0, settings)} />
            {sales?.byMethod.map(([m, v]) => (
              <Row key={m} label={`Por ${METHOD_LABEL[m] ?? m}`} value={formatMoney(v, settings)} />
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setExpenseOpen(true)} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Registrar gasto
            </button>
            <button onClick={exportPL} className="h-11 px-4 rounded-xl border border-border text-sm font-semibold inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
      )}

      {tab === "balance" && (
        <div className="px-4 md:px-6 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Activos" value={formatMoney(assets, settings)} />
            <Kpi label="Pasivos" value={formatMoney(liabilities, settings)} />
            <Kpi label="Patrimonio" value={formatMoney(equity + (pl?.netProfit ?? 0), settings)} />
          </div>

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
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin movimientos contables en el periodo</div>
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
            <JournalCard key={e.id} entry={e} settings={settings} />
          ))}
          {entries?.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">El libro diario se llena automáticamente con ventas y compras</div>}
        </div>
      )}

      {tab === "ledger" && <LedgerTab />}

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

const METHOD_LABEL: Record<string, string> = {
  cash: "efectivo", card: "tarjeta", transfer: "transferencia", credit: "crédito", other: "otro",
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold border-t border-border pt-1.5" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function JournalCard({ entry, settings }: { entry: any; settings: any }) {
  const [open, setOpen] = useState(false);
  const count = useLiveQuery(async () => {
    const all = await db.attachments.where("refType").equals("journal").toArray();
    return all.filter((a) => a.refId === entry.id).length;
  }, [entry.id]);

  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">
          {entry.number ? `#${entry.number} · ` : ""}{entry.description}
        </div>
        <div className="text-[11px] text-muted-foreground shrink-0">{formatDate(entry.date)}</div>
      </div>
      {entry.thirdParty && <div className="text-[11px] text-muted-foreground">{entry.thirdParty}</div>}
      <div className="mt-2 space-y-0.5">
        {entry.lines.map((l: any, i: number) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-muted-foreground truncate">{l.accountCode} {l.accountName}</span>
            <span className={l.debit ? "text-success" : "text-primary"}>
              {l.debit ? `D ${formatMoney(l.debit, settings)}` : `C ${formatMoney(l.credit, settings)}`}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-[11px] font-semibold text-primary inline-flex items-center gap-1"
      >
        <Paperclip className="h-3 w-3" /> Soportes ({count ?? 0})
      </button>
      {open && (
        <div className="mt-2">
          <Attachments refType="journal" refId={entry.id} title="Soportes del comprobante" />
        </div>
      )}
    </div>
  );
}

function LedgerTab() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).sort((a, b) => a.code.localeCompare(b.code)), []);
  const [code, setCode] = useState<string>(ACC.revenue);
  const rows = useLiveQuery(async () => {
    await db.journalEntries.count();
    return ledger(code);
  }, [code]);
  const final = rows?.length ? rows[rows.length - 1]!.balance : 0;

  return (
    <div className="px-4 md:px-6 space-y-3">
      <label className="block">
        <span className="text-xs text-muted-foreground">Cuenta</span>
        <select value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-card border border-border text-sm">
          {accounts?.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
      </label>

      <div className="rounded-xl bg-card border border-border divide-y divide-border">
        {rows?.map((r, i) => (
          <div key={i} className="px-3 py-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="truncate">{r.number ? `#${r.number} · ` : ""}{r.description}</span>
              <span className="text-muted-foreground shrink-0">{formatDate(r.date)}</span>
            </div>
            <div className="flex justify-between gap-2 mt-0.5">
              <span className="text-muted-foreground">
                {r.debit ? `Débito ${formatMoney(r.debit, settings)}` : `Crédito ${formatMoney(r.credit, settings)}`}
                {r.thirdParty ? ` · ${r.thirdParty}` : ""}
              </span>
              <span className="font-semibold">{formatMoney(r.balance, settings)}</span>
            </div>
          </div>
        ))}
        {rows?.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Cuenta sin movimientos</div>}
      </div>
      {!!rows?.length && (
        <div className="rounded-xl bg-card border border-border p-3 flex justify-between text-sm font-semibold">
          <span>Saldo final</span><span>{formatMoney(final, settings)}</span>
        </div>
      )}
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
  const [account, setAccount] = useState<string>(ACC.misc);
  const [pay, setPay] = useState<string>(ACC.cash);
  const [savedId, setSavedId] = useState<number | null>(null);
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).filter((a) => a.type === "gasto" || a.type === "costo"), []);

  async function save() {
    const v = Number(amount) || 0;
    if (!desc.trim() || v <= 0) { toast.error("Completa descripción y monto"); return; }
    const id = await postEntry({
      description: desc.trim(),
      refType: "expense",
      date: startOfDay() + 43200000,
      ...(user?.id !== undefined ? { userId: user.id } : {}),
      lines: [{ code: account, debit: v }, { code: pay, credit: v }],
    });
    if (id) setSavedId(id);
    toast.success("Gasto registrado — adjunta la factura como soporte");
  }

  return (
    <Sheet title="Registrar gasto" onClose={onClose}>
      {savedId === null ? (
        <>
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
          <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">
            Guardar gasto
          </button>
        </>
      ) : (
        <>
          <div className="rounded-xl bg-background border border-border p-3 text-sm">
            <div className="font-semibold">{desc}</div>
            <div className="text-xs text-muted-foreground">Gasto contabilizado correctamente</div>
          </div>
          <Attachments
            refType="journal"
            refId={savedId}
            title="Factura del gasto"
            hint="Adjunta la factura, recibo o comprobante de pago (imagen, PDF o XML)."
          />
          <button onClick={onClose} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">
            Listo
          </button>
        </>
      )}
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
  const [savedId, setSavedId] = useState<number | null>(null);

  async function save() {
    const v = Number(amount) || 0;
    if (!desc.trim() || !debitAcc || !creditAcc || v <= 0) { toast.error("Completa todos los campos"); return; }
    if (debitAcc === creditAcc) { toast.error("Las cuentas deben ser distintas"); return; }
    const id = await postEntry({
      description: desc.trim(),
      refType: "manual",
      ...(user?.id !== undefined ? { userId: user.id } : {}),
      lines: [{ code: debitAcc, debit: v }, { code: creditAcc, credit: v }],
    });
    if (id) setSavedId(id);
    toast.success("Asiento registrado");
  }

  return (
    <Sheet title="Asiento manual" onClose={onClose}>
      {savedId === null ? (
        <>
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
          <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">
            Guardar asiento
          </button>
        </>
      ) : (
        <>
          <Attachments refType="journal" refId={savedId} title="Soportes del asiento" />
          <button onClick={onClose} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Listo</button>
        </>
      )}
    </Sheet>
  );
}
