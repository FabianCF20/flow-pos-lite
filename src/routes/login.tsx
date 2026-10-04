import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ADMIN_EMAIL } from "@/lib/firebase";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Ingreso · ERP Importaciones" },
      {
        name: "description",
        content: "Ingresa al ERP con tu correo y contraseña.",
      },
      { property: "og:title", content: "Ingreso · ERP Importaciones" },
      {
        property: "og:description",
        content: "Acceso seguro al ERP de importaciones con correo y contraseña.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.ok) {
      toast.success("Bienvenido");
    } else {
      toast.error(res.error ?? "No se pudo iniciar sesión");
      setPassword("");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-5 py-10 bg-surface">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center mb-4 shadow-lg shadow-primary/30">
            <Lock className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-display font-semibold">ERP Importaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Ingresa con tu correo y contraseña</p>
        </div>

        <label className="block text-xs font-medium text-muted-foreground mb-1">Correo</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={ADMIN_EMAIL}
          className="w-full h-12 px-3 rounded-xl bg-card border border-border text-sm mb-4"
          required
        />

        <label className="block text-xs font-medium text-muted-foreground mb-1">Contraseña</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full h-12 px-3 rounded-xl bg-card border border-border text-sm mb-6"
          required
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Continuar
        </button>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Cada persona ingresa con su propia cuenta. Varios usuarios pueden trabajar al mismo tiempo desde distintos dispositivos.
        </p>
      </form>
    </div>
  );
}
