import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { moduleForPath } from "@/lib/permissions";
import {
  BarChart3, Users, Settings, Receipt, LogOut, ChevronRight, Package, Truck,
  ShoppingBag, Boxes, HandCoins, Landmark, Factory, Building2, Wallet, Undo2,
  ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/more")({
  head: () => pageHead("Centro de módulos", "Accede a cada área funcional del sistema."),
  component: MorePage,
});

function MorePage() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();

  const allItems = [
    { to: "/sales", icon: Receipt, label: "Ventas y tickets", group: "Comercial" },
    { to: "/orders", icon: ClipboardList, label: "Pedidos", group: "Comercial" },
    { to: "/dispatch", icon: Truck, label: "Despachos", group: "Comercial" },
    { to: "/returns", icon: Undo2, label: "Devoluciones y notas", group: "Comercial" },
    { to: "/receivables", icon: HandCoins, label: "Cartera", group: "Comercial" },
    { to: "/customers", icon: Users, label: "Clientes", group: "Comercial" },
    { to: "/purchases", icon: ShoppingBag, label: "Compras e importaciones", group: "Abastecimiento" },
    { to: "/suppliers", icon: Truck, label: "Proveedores", group: "Abastecimiento" },
    { to: "/inventory", icon: Boxes, label: "Inventario y bodegas", group: "Operaciones" },
    { to: "/production", icon: Factory, label: "Producción", group: "Operaciones" },
    { to: "/catalog", icon: Package, label: "Productos y categorías", group: "Operaciones" },
    { to: "/cash", icon: Wallet, label: "Caja", group: "Finanzas y control" },
    { to: "/accounting", icon: Landmark, label: "Contabilidad", group: "Finanzas y control" },
    { to: "/reports", icon: BarChart3, label: "Reportes", group: "Finanzas y control" },
    { to: "/organization", icon: Building2, label: "Estructura organizacional", group: "Administración" },
    { to: "/settings", icon: Settings, label: "Ajustes y usuarios", group: "Administración" },
  ] as const;

  const items = allItems.filter((item) => {
    if (item.to === "/catalog") return can("products", "read") && can("categories", "read");
    if (item.to === "/organization") return can("settings", "write");
    const module = moduleForPath(item.to);
    return module ? can(module, "read") : false;
  });

  const groupNames = ["Comercial", "Abastecimiento", "Operaciones", "Finanzas y control", "Administración"] as const;

  return (
    <div>
      <PageHeader title="Centro de módulos" subtitle={user?.name ? "Áreas disponibles según tu perfil de acceso" : "Áreas funcionales"} />
      <div className="space-y-7 px-4 md:px-6">
        {groupNames.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return (
            <section key={group} aria-labelledby={"module-group-" + group.toLowerCase().replaceAll(" ", "-")}>
              <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
                <h2 id={"module-group-" + group.toLowerCase().replaceAll(" ", "-")} className="text-sm font-semibold tracking-tight">{group}</h2>
                <span className="text-xs text-muted-foreground">{groupItems.length} módulos</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.to} to={item.to}
                      className="group flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Abrir módulo</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
        <div className="border-t border-border pt-4">
          <button onClick={() => { logout(); navigate({ to: "/login" }); }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
