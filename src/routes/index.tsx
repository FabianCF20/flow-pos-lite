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
      <PageHeader title={`Hola 👋`} subtitle={settings?.businessName} />

      <div className="px-4 md:px-6">
        <Link
          to="/pos"
          className="block rounded-2xl p-5 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.99] transition-transform"
        >
          <div className="text-xs uppercase tracking-wider opacity-80">Ventas hoy</div>
          <div className="text-3xl font-bold mt-1">
            {formatMoney(today?.total ?? 0, settings)}
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="opacity-90">{today?.count ?? 0} tickets · {today?.items ?? 0} items</span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-medium">
              <ShoppingCart className="h-3.5 w-3.5" /> Vender
            </span>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatCard icon={HandCoins} label={`Cartera (${ar?.count ?? 0})`} value={formatMoney(ar?.total ?? 0, settings)} accent={(ar?.total ?? 0) > 0 ? "text-warning" : undefined} to="/receivables" />
          <StatCard icon={ShoppingBag} label={`Por pagar (${ap?.count ?? 0})`} value={formatMoney(ap?.total ?? 0, settings)} accent={(ap?.total ?? 0) > 0 ? "text-warning" : undefined} to="/purchases" />
          <StatCard icon={Landmark} label="Utilidad acumulada" value={formatMoney(pnl?.profit ?? 0, settings)} accent={(pnl?.profit ?? 0) >= 0 ? "text-success" : "text-destructive"} to="/accounting" />
          <StatCard icon={Boxes} label="Inventario" value="Ver" to="/inventory" />
          <StatCard icon={Wallet} label="Caja" value={openSession ? "Abierta" : "Cerrada"} accent={openSession ? "text-success" : "text-muted-foreground"} to="/cash" />
          <StatCard icon={Package} label="Productos" value={String(productCount ?? 0)} to="/products" />
          <StatCard icon={ReceiptText} label="Tickets hoy" value={String(today?.count ?? 0)} to="/sales" />
          <StatCard icon={TrendingUp} label="Reportes" value="Ver" to="/reports" />
        </div>


        {lowStock && lowStock.length > 0 && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-center gap-2 text-warning font-medium text-sm">
              <AlertTriangle className="h-4 w-4" /> Stock bajo ({lowStock.length})
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {lowStock.slice(0, 5).map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.stock} u.</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, to }: { icon: any; label: string; value: string; accent?: string; to: string }) {
  return (
    <Link to={to} className="rounded-xl bg-card border border-border p-4 active:scale-[0.98] transition-transform">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="text-xs text-muted-foreground mt-2">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accent ?? ""}`}>{value}</div>
    </Link>
  );
}
