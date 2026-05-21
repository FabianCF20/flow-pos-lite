import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import {
  ShoppingCart, LayoutDashboard, Package, Wallet, BarChart3,
  Users, Settings, LogOut, MoreHorizontal, Tag,
} from "lucide-react";

const primaryNavAdmin = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Vender", icon: ShoppingCart },
  { to: "/products", label: "Productos", icon: Package },
  { to: "/cash", label: "Caja", icon: Wallet },
  { to: "/more", label: "Más", icon: MoreHorizontal },
] as const;

const primaryNavCashier = [
  { to: "/pos", label: "Vender", icon: ShoppingCart },
  { to: "/cash", label: "Caja", icon: Wallet },
  { to: "/sales", label: "Tickets", icon: BarChart3 },
  { to: "/more", label: "Más", icon: MoreHorizontal },
] as const;

const fullNavAdmin = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Vender", icon: ShoppingCart },
  { to: "/categories", label: "Categorías", icon: Tag },
  { to: "/products", label: "Productos", icon: Package },
  { to: "/cash", label: "Caja", icon: Wallet },
  { to: "/sales", label: "Ventas", icon: BarChart3 },
  { to: "/customers", label: "Clientes", icon: Users },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

const fullNavCashier = [
  { to: "/pos", label: "Vender", icon: ShoppingCart },
  { to: "/cash", label: "Caja", icon: Wallet },
  { to: "/sales", label: "Tickets", icon: BarChart3 },
] as const;

// Rutas permitidas para el rol cajero
export const CASHIER_ALLOWED = ["/pos", "/cash", "/sales", "/more", "/login"];

export function isRouteAllowed(role: string | undefined, pathname: string) {
  if (role !== "cashier") return true;
  return CASHIER_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user && location.pathname !== "/login") {
      navigate({ to: "/login" });
    }
  }, [loading, user, location.pathname, navigate]);

  useEffect(() => {
    if (!loading && user && user.role === "cashier" && !isRouteAllowed("cashier", location.pathname)) {
      navigate({ to: "/pos", replace: true });
    }
  }, [loading, user, location.pathname, navigate]);

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

  const primaryNav = user.role === "cashier" ? primaryNavCashier : primaryNavAdmin;
  const fullNav = user.role === "cashier" ? fullNavCashier : fullNavAdmin;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar (md+) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground font-bold">
              P
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">POS Offline</div>
              <div className="text-xs text-muted-foreground">{user.name} · {user.role === "cashier" ? "Cajero" : "Admin"}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {fullNav.map((n) => {
            const Icon = n.icon;
            const active = location.pathname === n.to ||
              (n.to !== "/" && location.pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => { logout(); navigate({ to: "/login" }); }}
          className="m-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-20 md:pb-6 safe-top">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border safe-bottom">
          <div className={primaryNav.length === 4 ? "grid grid-cols-4" : "grid grid-cols-5"}>
            {primaryNav.map((n) => {
              const Icon = n.icon;
              const active = location.pathname === n.to ||
                (n.to !== "/" && location.pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex flex-col items-center justify-center py-2.5 text-[10px] gap-0.5 ${
                    active ? "text-primary" : "text-muted-foreground"
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
    <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}