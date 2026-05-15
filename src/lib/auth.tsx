import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db, ensureSeed, type User } from "./db";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (pin: string) => Promise<User | null>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "pos.currentUserId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureSeed();
      const id = typeof window !== "undefined" ? Number(localStorage.getItem(STORAGE_KEY) || 0) : 0;
      if (id) {
        const u = await db.users.get(id);
        if (mounted && u && u.active) setUser(u);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  async function login(pin: string) {
    const u = await db.users.where("active").equals(1 as any).toArray()
      .catch(async () => (await db.users.toArray()).filter((x) => x.active));
    const found = (await db.users.toArray()).find((x) => x.active && x.pin === pin);
    if (found) {
      setUser(found);
      try { localStorage.setItem(STORAGE_KEY, String(found.id)); } catch {}
      return found;
    }
    return null;
    void u;
  }

  function logout() {
    setUser(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}