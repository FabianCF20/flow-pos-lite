import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FbUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ADMIN_EMAIL, authErrorMessage, fbAuth, fbDb } from "./firebase";
import { getInvite } from "./users";
import { db, ensureSeed, type User, type UserRole } from "./db";
import { toast } from "sonner";

interface Result {
  ok: boolean;
  error?: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
/** Perfil en la nube: rol y nombre del usuario. */
async function loadProfile(fb: FbUser): Promise<{ name: string; role: UserRole; active: boolean }> {
  const email = (fb.email ?? "").toLowerCase();
  const isAdmin = email === ADMIN_EMAIL.toLowerCase();
  const fallback = {
    name: fb.displayName || (isAdmin ? "Administrador" : email.split("@")[0] || "Usuario"),
    role: (isAdmin ? "admin" : "cashier") as UserRole,
    active: true,
  };
  try {
    const ref = doc(fbDb(), "users", fb.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() as { name?: string; role?: UserRole; active?: boolean };
      return {
        name: d.name || fallback.name,
        role: d.role || fallback.role,
        active: d.active !== false,
      };
    }
    // Primer ingreso: el rol viene de la invitación creada por un administrador.
    if (!isAdmin) {
      const invite = await getInvite(email);
      if (!invite) return { ...fallback, active: false };
      fallback.name = invite.name || fallback.name;
      fallback.role = invite.role;
      fallback.active = invite.active;
    }
    await setDoc(ref, { ...fallback, email, createdAt: serverTimestamp() });
  } catch {
    // Sin conexión o reglas restringidas: usamos el perfil por defecto.
  }
  return fallback;
}


/** Refleja el usuario de la nube en la base local para conservar los IDs del ERP. */
async function mirrorLocal(fb: FbUser, p: { name: string; role: UserRole; active: boolean }): Promise<User> {
  const email = (fb.email ?? "").toLowerCase();
  const all = await db.users.toArray();
  const existing = all.find((u) => u.uid === fb.uid) ?? all.find((u) => (u.email ?? "").toLowerCase() === email);
  if (existing?.id) {
    await db.users.update(existing.id, { name: p.name, role: p.role, active: p.active, email, uid: fb.uid });
    return { ...existing, name: p.name, role: p.role, active: p.active, email, uid: fb.uid };
  }
  const id = await db.users.add({
    name: p.name,
    pin: "",
    role: p.role,
    active: p.active,
    email,
    uid: fb.uid,
    createdAt: Date.now(),
  });
  return { id, name: p.name, pin: "", role: p.role, active: p.active, email, uid: fb.uid, createdAt: Date.now() };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsub = () => {};
    (async () => {
      await ensureSeed();
      unsub = onAuthStateChanged(fbAuth(), async (fb) => {
        if (!mounted) return;
        if (!fb) {
          setUser(null);
          setLoading(false);
          return;
        }
        const profile = await loadProfile(fb);
        if (!profile.active) {
          toast.error("Tu cuenta no está autorizada o fue desactivada");
          await signOut(fbAuth());
          return;
        }

        updateDoc(doc(fbDb(), "users", fb.uid), { lastLoginAt: serverTimestamp() }).catch(() => {});
        const local = await mirrorLocal(fb, profile);
        if (!mounted) return;
        setUser(local);
        setLoading(false);
      });
    })();
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  async function bootstrapAdmin(email: string, password: string): Promise<Result> {
    try {
      const cred = await createUserWithEmailAndPassword(fbAuth(), email, password);
      await updateProfile(cred.user, { displayName: "Administrador" });
      try {
        await setDoc(doc(fbDb(), "users", cred.user.uid), {
          name: "Administrador",
          email,
          role: "admin",
          active: true,
          createdAt: serverTimestamp(),
        });
      } catch {}
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      return { ok: false, error: authErrorMessage(code) };
    }
  }

  /** Primer ingreso de un usuario invitado: crea su contraseña. */
  async function registerInvited(email: string, password: string): Promise<Result> {
    try {
      const cred = await createUserWithEmailAndPassword(fbAuth(), email, password);
      const invite = await getInvite(email).catch(() => null);
      if (!invite || !invite.active) {
        await signOut(fbAuth()).catch(() => {});
        return { ok: false, error: "Este correo no está autorizado. Pide una invitación al administrador" };
      }
      if (invite.name) await updateProfile(cred.user, { displayName: invite.name }).catch(() => {});
      try {
        await setDoc(doc(fbDb(), "users", cred.user.uid), {
          name: invite.name || email.split("@")[0],
          email,
          role: invite.role,
          active: true,
          createdAt: serverTimestamp(),
        });
      } catch {}
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/email-already-in-use") return { ok: false, error: authErrorMessage("auth/wrong-password") };
      return { ok: false, error: authErrorMessage(code) };
    }
  }

  async function signIn(email: string, password: string): Promise<Result> {
    const clean = email.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(fbAuth(), clean, password);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      const missing = code === "auth/user-not-found" || code === "auth/invalid-credential";
      if (missing && clean === ADMIN_EMAIL.toLowerCase()) {
        return await bootstrapAdmin(clean, password);
      }
      if (missing) return await registerInvited(clean, password);
      return { ok: false, error: authErrorMessage(code) };
    }
  }


  async function logout() {
    setUser(null);
    await signOut(fbAuth()).catch(() => {});
  }

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        signIn,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
