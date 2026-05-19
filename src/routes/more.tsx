import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { BarChart3, Users, Settings, Receipt, LogOut, ChevronRight, UserCog } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/more")({ component: MorePage });

function MorePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const allItems = [
    { to: "/sales", icon: Receipt, label: "Ventas" },
    { to: "/customers", icon: Users, label: "Clientes" },
    { to: "/reports", icon: BarChart3, label: "Reportes" },
    { to: "/settings", icon: Settings, label: "Ajustes" },
  ] as const;
  const items = user?.role === "cashier"
    ? allItems.filter((i) => i.to === "/sales")
    : allItems;
  return (
    <div>
      <PageHeader title="Más" subtitle={user?.name} />
      <div className="px-4 space-y-2">
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
        <button onClick={() => { logout(); navigate({ to: "/login" }); }} className="w-full mt-4 h-12 rounded-xl border border-border font-medium inline-flex items-center justify-center gap-2">
          <UserCog className="h-4 w-4" /> Cambiar de usuario
        </button>
        <button onClick={() => { logout(); navigate({ to: "/login" }); }} className="w-full h-12 rounded-xl border border-border text-destructive font-medium inline-flex items-center justify-center gap-2">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}