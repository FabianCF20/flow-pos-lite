import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, getSettings } from "@/lib/db";
import { formatMoney, startOfDay, endOfDay, formatDateShort } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

function ReportsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const sales = useLiveQuery(async () => (await db.sales.toArray()).filter(s => s.status === "completed"), []);

  const { totalToday, total7, byDay, topProducts, byMethod } = useMemo(() => {
    const today = sales?.filter(s => s.createdAt >= startOfDay() && s.createdAt <= endOfDay()) ?? [];
    const totalToday = today.reduce((a, s) => a + s.total, 0);
    const since7 = Date.now() - 7 * 86400000;
    const last7 = sales?.filter(s => s.createdAt >= since7) ?? [];
    const total7 = last7.reduce((a, s) => a + s.total, 0);

    const byDay: { day: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const ts = Date.now() - i * 86400000;
      const from = startOfDay(ts), to = endOfDay(ts);
      const t = (sales ?? []).filter(s => s.createdAt >= from && s.createdAt <= to).reduce((a, s) => a + s.total, 0);
      byDay.push({ day: formatDateShort(ts), total: t });
    }

    const productMap = new Map<string, { qty: number; total: number }>();
    for (const s of sales ?? []) for (const it of s.items) {
      const cur = productMap.get(it.name) ?? { qty: 0, total: 0 };
      cur.qty += it.qty; cur.total += it.total;
      productMap.set(it.name, cur);
    }
    const topProducts = [...productMap.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

    const methodMap = new Map<string, number>();
    for (const s of sales ?? []) methodMap.set(s.paymentMethod, (methodMap.get(s.paymentMethod) ?? 0) + s.total);
    const byMethod = [...methodMap.entries()];

    return { totalToday, total7, byDay, topProducts, byMethod };
  }, [sales]);

  const max = Math.max(1, ...byDay.map(d => d.total));

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Resumen de ventas" />
      <div className="px-4 md:px-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-card border border-border p-4">
            <div className="text-xs text-muted-foreground">Hoy</div>
            <div className="text-xl font-bold mt-1">{formatMoney(totalToday, settings)}</div>
          </div>
          <div className="rounded-xl bg-card border border-border p-4">
            <div className="text-xs text-muted-foreground">Últimos 7 días</div>
            <div className="text-xl font-bold mt-1">{formatMoney(total7, settings)}</div>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-4">
          <div className="text-sm font-semibold mb-3">Ventas por día</div>
          <div className="flex items-end gap-2 h-32">
            {byDay.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary-glow" style={{ height: `${(d.total / max) * 100}%`, minHeight: 2 }} />
                <div className="text-[10px] text-muted-foreground">{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-4">
          <div className="text-sm font-semibold mb-3">Top productos</div>
          {topProducts.length === 0 && <div className="text-sm text-muted-foreground">Sin datos</div>}
          <ul className="space-y-2">
            {topProducts.map(([name, v]) => (
              <li key={name} className="flex justify-between text-sm">
                <span className="truncate">{name} <span className="text-muted-foreground">×{v.qty}</span></span>
                <span className="font-medium">{formatMoney(v.total, settings)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-card border border-border p-4">
          <div className="text-sm font-semibold mb-3">Por método de pago</div>
          {byMethod.length === 0 && <div className="text-sm text-muted-foreground">Sin datos</div>}
          <ul className="space-y-1.5 text-sm">
            {byMethod.map(([m, t]) => (
              <li key={m} className="flex justify-between"><span className="capitalize">{m}</span><span className="font-medium">{formatMoney(t, settings)}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}