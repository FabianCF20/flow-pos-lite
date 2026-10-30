import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { fbAuth, fbDb, authErrorMessage, initializeAuthPersistence } from "./firebase";
import { db, ensureSeed, type User } from "./db";
import { fetchAccessSession, setAccessSession } from "./access-session";
import { canAccess, type AccessSession, type ModuleId } from "./permissions";

interface Result { ok: boolean; error?: string; }
interface AuthCtx {
  user: User | null; loading: boolean; access: AccessSession | null;
  can: (module: ModuleId, action?: "read" | "write") => boolean;
  signIn: (email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessSession | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    let stopAuth = () => {}; let stopAccess = () => {}; let stopRole = () => {};
    async function load() {
      const fb = fbAuth().currentUser;
      if (!fb?.email) { if (mounted) { setUser(null); setAccess(null); setAccessSession(null); setLoading(false); } return; }
      try {
        const session = await fetchAccessSession();
        if (!session) throw new Error("Acceso no asignado o desactivado");
        const snap = await getDocFromServer(doc(fbDb(), "users", fb.uid));
        const name = String(snap.data()?.name ?? fb.displayName ?? fb.email);
        const old = await db.users.where("uid").equals(fb.uid).first();
        const profile = { name, email: fb.email.toLowerCase(), uid: fb.uid, role: session.assignment.roleId, active: true, pin: "", createdAt: old?.createdAt ?? Date.now() };
        const id = old?.id ?? await db.users.add(profile);
        await db.users.update(id, profile);
        if (mounted) { setUser({ ...profile, id }); setAccess(session); }
      } catch {
        setAccessSession(null);
        if (mounted) { setUser(null); setAccess(null); }
      } finally { if (mounted) setLoading(false); }
    }
    ensureSeed().then(async () => {
      await initializeAuthPersistence();
      if (!mounted) return;
      stopAuth = onAuthStateChanged(fbAuth(), async fb => {
        stopAccess(); stopRole();
        await load();
        if (!fb?.email || !mounted) return;
        stopAccess = onSnapshot(doc(fbDb(), "userAccess", fb.email.toLowerCase()), snap => {
          stopRole();
          const roleId = snap.data()?.roleId;
          if (typeof roleId === "string") stopRole = onSnapshot(doc(fbDb(), "accessRoles", roleId), () => { void load(); }, () => { setAccessSession(null); setAccess(null); setUser(null); });
          void load();
        }, () => { setAccessSession(null); setAccess(null); setUser(null); setLoading(false); });
      });
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; stopAuth(); stopAccess(); stopRole(); };
  }, []);
  async function signIn(email: string, password: string): Promise<Result> {
    try {
      await initializeAuthPersistence();
      await signInWithEmailAndPassword(fbAuth(), email.trim().toLowerCase(), password);
      const session = await fetchAccessSession();
      if (!session) { await signOut(fbAuth()); return { ok: false, error: "Tu cuenta no tiene acceso asignado o fue desactivada" }; }
      return { ok: true };
    } catch (error) {
      await signOut(fbAuth()).catch(() => {});
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
      return { ok: false, error: authErrorMessage(code) };
    }
  }
  async function logout() { setAccessSession(null); setAccess(null); setUser(null); await signOut(fbAuth()); }
  return <Ctx.Provider value={{ user, access, loading, can: (module, action) => canAccess(access, module, action), signIn, logout }}>{children}</Ctx.Provider>;
}
export function useAuth() { const ctx = useContext(Ctx); if (!ctx) throw new Error("useAuth must be used within AuthProvider"); return ctx; }
