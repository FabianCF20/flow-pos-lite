import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { landingPath, moduleForPath } from "@/lib/permissions";
import { useTheme } from "@/lib/theme";
import { SyncStatus } from "@/components/SyncStatus";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, LayoutDashboard, Package, Wallet, BarChart3, ClipboardList,
  Users, Settings, LogOut, MoreHorizontal, Truck, ShoppingBag,
  Boxes, HandCoins, Landmark, Sun, Moon, Ship, Undo2, Factory, Building2,
} from "lucide-react";

const primaryNavAdmin = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Vender", icon: ShoppingCart },
  { to: "/catalog", label: "Catálogo", icon: Package },
  { to: "/cash", label: "Caja", icon: Wallet },
  { to: "/more", label: "Más", icon: MoreHorizontal },
] as const;

const primaryNavCashier = [
  { to: "/pos", label: "Vender", icon: ShoppingCart },
  { to: "/cash", label: "Caja", icon: Wallet },
  { to: "/sales", label: "Tickets", icon: BarChart3 },
  { to: "/more", label: "Más", icon: MoreHorizontal },
] as const;

type NavGroup = { title: string; items: readonly { to: string; label: string; icon: any }[] };

const navGroupsAdmin: readonly NavGroup[] = [
  {
    title: "Operación",
    items: [
      { to: "/", label: "Inicio", icon: LayoutDashboard },
      { to: "/pos", label: "Vender", icon: ShoppingCart },
      { to: "/sales", label: "Ventas", icon: BarChart3 },
      { to: "/orders", label: "Pedidos", icon: ClipboardList },
      { to: "/dispatch", label: "Despachos", icon: Truck },
      { to: "/returns", label: "Devoluciones y notas", icon: Undo2 },
      { to: "/receivables", label: "Cartera", icon: HandCoins },
      { to: "/customers", label: "Clientes", icon: Users },
    ],
  },
  {
    title: "Importación y stock",
    items: [
      { to: "/purchases", label: "Compras / Importaciones", icon: ShoppingBag },
      { to: "/suppliers", label: "Proveedores", icon: Truck },
      { to: "/inventory", label: "Inventario", icon: Boxes },
      { to: "/production", label: "Producción", icon: Factory },
      { to: "/catalog", label: "Catálogo maestro", icon: Package },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { to: "/accounting", label: "Contabilidad", icon: Landmark },
      { to: "/cash", label: "Caja", icon: Wallet },
      { to: "/reports", label: "Reportes", icon: BarChart3 },
      { to: "/organization", label: "Estructura organizacional", icon: Building2 },
      { to: "/settings", label: "Ajustes", icon: Settings },
    ],
  },
];

const navGroupsCashier: readonly NavGroup[] = [
  {
    title: "Operación",
    items: [
      { to: "/pos", label: "Vender", icon: ShoppingCart },
      { to: "/cash", label: "Caja", icon: Wallet },
      { to: "/sales", label: "Tickets", icon: BarChart3 },
      { to: "/orders", label: "Pedidos", icon: ClipboardList },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  "/": "Panel general",
  "/pos": "Punto de venta",
  "/sales": "Ventas",
  "/orders": "Pedidos",
  "/dispatch": "Despachos",
  "/returns": "Devoluciones y notas",
  "/receivables": "Cartera",
  "/customers": "Clientes",
  "/purchases": "Compras e importaciones",
  "/suppliers": "Proveedores",
  "/inventory": "Inventario",
  "/production": "Producción",
  "/products": "Productos (catálogo anterior)",
  "/catalog": "Catálogo maestro",
  "/categories": "Categorías",
  "/accounting": "Contabilidad",
  "/cash": "Caja",
  "/reports": "Reportes",
  "/settings": "Ajustes",
  "/organization": "Estructura organizacional",
  "/more": "Módulos",
};

// Rutas permitidas para el rol cajero
export const CASHIER_ALLOWED = ["/pos", "/cash", "/sales", "/orders", "/more", "/login"];

export function isRouteAllowed(role: string | undefined, pathname: string) {
  if (role !== "cashier") return true;
  return CASHIER_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isActive(pathname: string, to: string) {
  return pathname === to || (to !== "/" && pathname.startsWith(to));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, can, access } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (!loading && !user && location.pathname !== "/login") {
      navigate({ to: "/login" });
    }
  }, [loading, user, location.pathname, navigate]);

  useEffect(() => {
    if (loading || !user || location.pathname === "/login") return;
    const module = moduleForPath(location.pathname);
    const allowed = location.pathname === "/catalog"
      ? can("products", "read") && can("categories", "read")
      : location.pathname === "/products" || location.pathname === "/categories"
        ? user.role === "admin"
        : module
          ? can(module, "read")
          : location.pathname === "/organization"
            ? can("settings", "write")
            : true;
    if (!allowed) navigate({ to: landingPath(access) as any, replace: true });
  }, [loading, user, location.pathname, navigate, can, access]);

  const sectionTitle = useMemo(() => {
    const exact = ROUTE_TITLES[location.pathname];
    if (exact) return exact;
    const match = Object.keys(ROUTE_TITLES)
      .filter((k) => k !== "/" && location.pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    return match ? ROUTE_TITLES[match] : "ERP";
  }, [location.pathname]);

  if (location.pathname === "/login") {
    return <>{children}</>;
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const canOpen = (to: string) => {
    if (to === "/catalog") return can("products", "read") && can("categories", "read");
    if (to === "/products" || to === "/categories") return user.role === "admin";
    if (to === "/organization") return can("settings", "write");
    const module = moduleForPath(to);
    return module ? can(module, "read") : true;
  };
  const primaryNav = (user.role === "cashier" ? primaryNavCashier : primaryNavAdmin)
    .filter((item) => canOpen(item.to));
  const navGroups = (user.role === "cashier" ? navGroupsCashier : navGroupsAdmin)
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpen(item.to)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar (md+) */}
      <aside className="hidden md:flex sticky top-0 h-dvh w-56 xl:w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground">
              <Ship className="h-5 w-5" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-sm font-display font-semibold truncate">ERP Importaciones</div>
              <div className="text-[11px] text-sidebar-foreground/60 truncate">
                {user.name} · {access?.role.name ?? user.role}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navGroups.map((g) => (
            <div key={g.title}>
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {g.title}
              </div>
              <div className="space-y-0.5">
                {g.items.map((n) => {
                  const Icon = n.icon;
                  const active = isActive(location.pathname, n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gold" />
                      )}
                      <Icon className={`h-4 w-4 ${active ? "text-gold" : ""}`} />
                      <span className="truncate">{n.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <Button variant="ghost"
          onClick={() => { logout(); navigate({ to: "/login" }); }}
          className="m-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" /> Salir
        </Button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-border safe-top">
          <div className="h-14 px-4 md:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="md:hidden h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground">
                <Ship className="h-4 w-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground hidden md:inline">
                ERP
              </span>
              <span className="text-muted-foreground/50 hidden md:inline">/</span>
              <span className="text-sm font-display font-semibold truncate">{sectionTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <SyncStatus />
              <Button variant="outline" size="icon"
                onClick={toggle}
                aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
                className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-border">
                <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground grid place-items-center text-xs font-semibold">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="text-xs font-medium">{user.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {access?.role.name ?? user.role}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="erp-main flex-1 min-w-0 w-full pb-20 md:pb-8">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border safe-bottom">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(primaryNav.length, 1)}, minmax(0, 1fr))` }}>
            {primaryNav.map((n) => {
              const Icon = n.icon;
              const active = isActive(location.pathname, n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex flex-col items-center justify-center py-2.5 text-[10px] gap-0.5 ${
                    active ? "text-primary font-medium" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="px-4 md:px-6 pt-5 md:pt-7 pb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-display font-semibold break-words">{title}</h1>
        {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
