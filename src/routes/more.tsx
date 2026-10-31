import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { moduleForPath } from "@/lib/permissions";
import { BarChart3, Users, Settings, Receipt, LogOut, ChevronRight, UserCog, Package, Truck, ShoppingBag, Boxes, HandCoins, Landmark, Factory, Building2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/more")({ head: () => pageHead("Módulos", "Módulos de operación, producción y finanzas."), component: MorePage });

function MorePage() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const allItems = [
    { to: "/sales", icon: Receipt, label: "Ventas" },
    { to: "/orders", icon: Receipt, label: "Pedidos" },
    { to: "/dispatch", icon: Truck, label: "Despachos" },
    { to: "/receivables", icon: HandCoins, label: "Cartera" },
    { to: "/purchases", icon: ShoppingBag, label: "Compras" },
    { to: "/suppliers", icon: Truck, label: "Proveedores" },
    { to: "/inventory", icon: Boxes, label: "Inventario" },
    { to: "/production", icon: Factory, label: "Producción" },
    { to: "/accounting", icon: Landmark, label: "Contabilidad" },
    { to: "/catalog", icon: Package, label: "Catálogo maestro" },
    { to: "/customers", icon: Users, label: "Clientes" },
    { to: "/reports", icon: BarChart3, label: "Reportes" },
    { to: "/organization", icon: Building2, label: "Estructura organizacional" },
    { to: "/settings", icon: Settings, label: "Ajustes" },
  ] as const;
  const items = allItems.filter((item) => {
    const module = moduleForPath(item.to);
    if (module) return can(module, "read");
    if (item.to === "/organization") return can("settings", "write");
    if (item.to === "/catalog") return can("products", "read") && can("categories", "read");
    return true;
  });
  return (
    <div>
      <PageHeader title="Más" subtitle={user?.name} />
      <div className="px-4 md:px-6 desktop-items catalog-items">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link key={it.to} to={it.to} className="rounded-xl bg-card border border-border p-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary" />
              <span className="flex-1 font-medium">{it.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}
        <button onClick={() => { logout(); navigate({ to: "/login" }); }} className="list-toolbar w-full mt-4 h-12 rounded-xl border border-border font-medium inline-flex items-center justify-center gap-2">
          <UserCog className="h-4 w-4" /> Cambiar de usuario
        </button>
        <button onClick={() => { logout(); navigate({ to: "/login" }); }} className="list-toolbar w-full h-12 rounded-xl border border-border text-destructive font-medium inline-flex items-center justify-center gap-2">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}