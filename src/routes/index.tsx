import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSettings } from "@/lib/db";
import { formatMoney, startOfDay, endOfDay } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { trialBalance } from "@/lib/erp";
import {
  ShoppingCart, Package, Wallet, TrendingUp, ReceiptText, AlertTriangle,
  HandCoins, ShoppingBag, Boxes, Landmark,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Panel del ERP — Ventas, inventario y contabilidad" },
      { name: "description", content: "Panel central del ERP offline: ventas del día, cartera, cuentas por pagar, inventario y resultados contables." },
      { property: "og:title", content: "Panel del ERP — Ventas, inventario y contabilidad" },
      { property: "og:description", content: "Panel central del ERP offline: ventas del día, cartera, cuentas por pagar, inventario y resultados contables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});


function Dashboard() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const today = useLiveQuery(async () => {
    const from = startOfDay(), to = endOfDay();
    const sales = await db.sales.where("createdAt").between(from, to).toArray();
    const completed = sales.filter((s) => s.status === "completed");
    const total = completed.reduce((a, s) => a + s.total, 0);
    const count = completed.length;
    const items = completed.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty, 0), 0);
    return { total, count, items };
  }, []);
  const productCount = useLiveQuery(() => db.products.where("active").equals(1 as any).count().catch(async () => (await db.products.toArray()).filter(p => p.active).length), []);
  const lowStock = useLiveQuery(async () => {
    const all = await db.products.toArray();
    return all.filter((p) => p.active && p.trackStock && p.stock <= 5);
  }, []);
  const openSession = useLiveQuery(async () => {
    const all = await db.cashSessions.toArray();
    return all.find((s) => !s.closedAt) ?? null;
  }, []);
  const ar = useLiveQuery(async () => {
    const all = await db.receivables.toArray();
    const open = all.filter((r) => r.status !== "paid");
    return { count: open.length, total: open.reduce((a, r) => a + (r.total - r.paid), 0) };
  }, []);
  const ap = useLiveQuery(async () => {
    const all = await db.purchases.toArray();
    const open = all.filter((p) => p.status === "received" && p.paid < p.total);
    return { count: open.length, total: open.reduce((a, p) => a + (p.total - p.paid), 0) };
  }, []);
  const pnl = useLiveQuery(async () => {
    await db.journalEntries.count();
    const bal = await trialBalance();
    const income = bal.filter((b) => b.type === "ingreso").reduce((a, b) => a + b.balance, 0);
    const cost = bal.filter((b) => b.type === "gasto" || b.type === "costo").reduce((a, b) => a + b.balance, 0);
    return { income, cost, profit: income - cost };
  }, []);

  return (
    <div>
      <PageHeader
        title="Panel general"
        subtitle={settings?.businessName ? `${settings.businessName} · importación y comercialización` : "Importación y comercialización"}
      />

      <div className="px-4 md:px-6">
        <div className="grid gap-3 lg:grid-cols-3">
          <Link
            to="/pos"
            className="lg:col-span-2 block rounded-xl p-5 md:p-6 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elevated active:scale-[0.995] transition-transform"
          >
            <div className="text-[11px] uppercase tracking-[0.16em] opacity-75">Ventas de hoy</div>
            <div className="text-3xl md:text-4xl font-display font-semibold mt-1.5 tabular">
              {formatMoney(today?.total ?? 0, settings)}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="opacity-90 tabular">{today?.count ?? 0} tickets · {today?.items ?? 0} unidades</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-gold-foreground text-xs font-semibold">
                <ShoppingCart className="h-3.5 w-3.5" /> Registrar venta
              </span>
            </div>
          </Link>

          <div className="card-surface p-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Resultado acumulado</div>
            <div className={`text-2xl font-display font-semibold mt-1.5 tabular ${(pnl?.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
              {formatMoney(pnl?.profit ?? 0, settings)}
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ingresos</dt>
                <dd className="tabular font-medium">{formatMoney(pnl?.income ?? 0, settings)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Costos y gastos</dt>
                <dd className="tabular font-medium">{formatMoney(pnl?.cost ?? 0, settings)}</dd>
              </div>
            </dl>
            <Link to="/accounting" className="mt-4 inline-flex text-xs font-semibold text-primary hover:underline">
              Ver contabilidad →
            </Link>
          </div>
        </div>

        <SectionTitle>Finanzas</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={HandCoins} label="Cartera por cobrar" value={formatMoney(ar?.total ?? 0, settings)} hint={`${ar?.count ?? 0} facturas abiertas`} accent={(ar?.total ?? 0) > 0 ? "text-warning" : undefined} to="/receivables" />
          <StatCard icon={ShoppingBag} label="Cuentas por pagar" value={formatMoney(ap?.total ?? 0, settings)} hint={`${ap?.count ?? 0} compras pendientes`} accent={(ap?.total ?? 0) > 0 ? "text-warning" : undefined} to="/purchases" />
          <StatCard icon={Wallet} label="Caja" value={openSession ? "Abierta" : "Cerrada"} hint={openSession ? "Turno en curso" : "Sin turno activo"} accent={openSession ? "text-success" : "text-muted-foreground"} to="/cash" />
          <StatCard icon={Landmark} label="Contabilidad" value="Libro diario" hint="Asientos automáticos" to="/accounting" />
        </div>

        <SectionTitle>Importación e inventario</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Boxes} label="Inventario" value="Existencias" hint="Bodegas y kardex" to="/inventory" />
          <StatCard icon={Package} label="Productos activos" value={String(productCount ?? 0)} hint="Catálogo" to="/products" />
          <StatCard icon={ReceiptText} label="Tickets de hoy" value={String(today?.count ?? 0)} hint="Ventas emitidas" to="/sales" />
          <StatCard icon={TrendingUp} label="Reportes" value="Analítica" hint="Ventas y márgenes" to="/reports" />
        </div>

        {lowStock && lowStock.length > 0 && (
          <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <div className="flex items-center gap-2 text-warning font-semibold text-sm">
              <AlertTriangle className="h-4 w-4" /> Reposición sugerida ({lowStock.length})
            </div>
            <ul className="mt-2.5 space-y-1.5 text-sm">
              {lowStock.slice(0, 5).map((p) => (
                <li key={p.id} className="flex justify-between border-b border-border/60 pb-1.5 last:border-0 last:pb-0">
                  <span className="truncate pr-3">{p.name}</span>
                  <span className="text-muted-foreground tabular shrink-0">{p.stock} u.</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h2>
  );
}

function StatCard({ icon: Icon, label, value, accent, hint, to }: { icon: any; label: string; value: string; accent?: string; hint?: string; to: string }) {
  return (
    <Link to={to} className="card-surface p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div className="text-xs text-muted-foreground mt-2.5">{label}</div>
      <div className={`text-lg font-display font-semibold mt-0.5 tabular truncate ${accent ?? ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </Link>
  );
}
