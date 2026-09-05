import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  updateProfile,
  type User as FbUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ADMIN_EMAIL, authErrorMessage, fbAuth, fbDb } from "./firebase";
import { db, ensureSeed, type User, type UserRole } from "./db";

interface Result {
  ok: boolean;
  error?: string;
  secondFactor?: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  /** Correo pendiente de confirmar el segundo factor. */
  pendingEmail: string | null;
  awaitingSecondFactor: boolean;
  signIn: (email: string, password: string) => Promise<Result>;
  sendSecondFactor: () => Promise<Result>;
  cancelSecondFactor: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const MFA_PREFIX = "erp.mfa.";
const PENDING_EMAIL = "erp.pendingEmail";

function mfaKey(uid: string) {
  return MFA_PREFIX + uid;
}

function isVerified(uid: string) {
  try {
    return sessionStorage.getItem(mfaKey(uid)) === "1";
  } catch {
    return false;
  }
}

function markVerified(uid: string) {
  try {
    sessionStorage.setItem(mfaKey(uid), "1");
  } catch {}
}

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
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(false);

  // Completar el segundo factor cuando el usuario abre el enlace del correo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = fbAuth();
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let email = "";
    try {
      email = localStorage.getItem(PENDING_EMAIL) ?? "";
    } catch {}
    if (!email) email = window.prompt("Confirma tu correo para completar la verificación") ?? "";
    if (!email) return;
    signInWithEmailLink(auth, email, window.location.href)
      .then((cred) => {
        markVerified(cred.user.uid);
        try {
          localStorage.removeItem(PENDING_EMAIL);
        } catch {}
        window.history.replaceState({}, "", window.location.pathname);
        window.location.replace("/");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsub = () => {};
    (async () => {
      await ensureSeed();
      unsub = onAuthStateChanged(fbAuth(), async (fb) => {
        if (!mounted) return;
        if (!fb) {
          setUser(null);
          setAwaiting(false);
          setPendingEmail(null);
          setLoading(false);
          return;
        }
        if (!isVerified(fb.uid)) {
          setUser(null);
          setAwaiting(true);
          setPendingEmail(fb.email ?? null);
          setLoading(false);
          return;
        }
        const profile = await loadProfile(fb);
        if (!profile.active) {
          await signOut(fbAuth());
          return;
        }
        const local = await mirrorLocal(fb, profile);
        if (!mounted) return;
        setUser(local);
        setAwaiting(false);
        setPendingEmail(null);
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
      setPendingEmail(email);
      setAwaiting(true);
      const sent = await sendSecondFactor(email);
      return sent.ok ? { ok: true, secondFactor: true } : sent;
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      return { ok: false, error: authErrorMessage(code) };
    }
  }

  async function sendSecondFactor(emailArg?: string): Promise<Result> {
    const email = emailArg ?? pendingEmail ?? fbAuth().currentUser?.email ?? "";
    if (!email) return { ok: false, error: "No hay un correo pendiente de verificar" };
    try {
      await sendSignInLinkToEmail(fbAuth(), email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      try {
        localStorage.setItem(PENDING_EMAIL, email);
      } catch {}
      return { ok: true, secondFactor: true };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      return { ok: false, error: authErrorMessage(code) };
    }
  }

  async function signIn(email: string, password: string): Promise<Result> {
    const clean = email.trim().toLowerCase();
    try {
      const cred = await signInWithEmailAndPassword(fbAuth(), clean, password);
      setPendingEmail(clean);
      if (isVerified(cred.user.uid)) return { ok: true };
      setAwaiting(true);
      return await sendSecondFactor(clean);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      const missing = code === "auth/user-not-found" || code === "auth/invalid-credential";
      if (missing && clean === ADMIN_EMAIL.toLowerCase()) {
        return await bootstrapAdmin(clean, password);
      }
      return { ok: false, error: authErrorMessage(code) };
    }
  }

  async function cancelSecondFactor() {
    setAwaiting(false);
    setPendingEmail(null);
    await signOut(fbAuth()).catch(() => {});
  }

  async function logout() {
    const uid = fbAuth().currentUser?.uid;
    if (uid) {
      try {
        sessionStorage.removeItem(mfaKey(uid));
      } catch {}
    }
    setUser(null);
    await signOut(fbAuth()).catch(() => {});
  }

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        pendingEmail,
        awaitingSecondFactor: awaiting,
        signIn,
        sendSecondFactor: () => sendSecondFactor(),
        cancelSecondFactor,
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
