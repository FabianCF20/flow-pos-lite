import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type User } from "@/lib/db";
import { ArrowLeft, Delete, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const users = useLiveQuery(async () => (await db.users.toArray()).filter((u) => u.active), []);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  // Auto-select when there is only one user
  useEffect(() => {
    if (users && users.length === 1 && !selected) setSelected(users[0]);
  }, [users, selected]);

  async function tryLogin(value: string) {
    if (busy) return;
    setBusy(true);
    const u = await login(value, selected?.id);
    setBusy(false);
    if (u) {
      toast.success(`Hola, ${u.name}`);
      navigate({ to: "/" });
    } else {
      toast.error("PIN incorrecto");
      setPin("");
    }
  }

  function press(d: string) {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length >= 4) {
      setTimeout(() => { if ((document.activeElement as HTMLElement)?.dataset?.submit !== "no") tryLogin(next); }, 250);
    }
  }

  const keys = ["1","2","3","4","5","6","7","8","9"];

  // User picker screen (when multiple users and none selected yet)
  if (users && users.length > 1 && !selected) {
    return (
      <div className="min-h-screen px-5 py-8 bg-gradient-to-b from-background via-background to-[oklch(0.10_0.06_275)]">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center mb-8">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center mb-4 shadow-lg shadow-primary/30">
              <Lock className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Elige tu usuario</h1>
            <p className="text-sm text-muted-foreground mt-1">Selecciona una cuenta para continuar</p>
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent active:scale-[0.99] transition"
              >
                <div className="h-11 w-11 rounded-full bg-primary/15 grid place-items-center text-primary font-bold text-lg">
                  {u.name[0]?.toUpperCase()}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{u.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{u.role}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center px-5 py-8 bg-gradient-to-b from-background via-background to-[oklch(0.10_0.06_275)]">
      <div className="w-full max-w-sm">
        {users && users.length > 1 && (
          <button
            onClick={() => { setSelected(null); setPin(""); }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Cambiar usuario
          </button>
        )}
        <div className="text-center mb-8">
          {selected ? (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/15 grid place-items-center text-primary font-bold text-2xl mb-3">
                {selected.name[0]?.toUpperCase()}
              </div>
              <h1 className="text-2xl font-bold">{selected.name}</h1>
              <p className="text-sm text-muted-foreground mt-1 capitalize">{selected.role} · Ingresa tu PIN</p>
            </>
          ) : (
            <>
              <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center mb-4 shadow-lg shadow-primary/30">
                <Lock className="h-6 w-6 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold">POS Offline</h1>
              <p className="text-sm text-muted-foreground mt-1">Ingresa tu PIN para continuar</p>
            </>
          )}
        </div>

        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full border-2 ${
                pin.length > i ? "bg-primary border-primary" : "border-border"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-16 rounded-xl bg-card hover:bg-accent text-2xl font-semibold transition-colors border border-border active:scale-95"
            >
              {k}
            </button>
          ))}
          <button
            onClick={() => setPin("")}
            className="h-16 rounded-xl bg-card hover:bg-accent text-sm text-muted-foreground border border-border active:scale-95"
          >
            Limpiar
          </button>
          <button
            onClick={() => press("0")}
            className="h-16 rounded-xl bg-card hover:bg-accent text-2xl font-semibold border border-border active:scale-95"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="h-16 rounded-xl bg-card hover:bg-accent grid place-items-center border border-border active:scale-95"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        {(!users || users.length <= 1) && (
          <p className="text-center text-xs text-muted-foreground mt-6">
            PIN inicial: <span className="font-mono text-foreground">1234</span>
          </p>
        )}
      </div>
    </div>
  );
}