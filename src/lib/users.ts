import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { fbDb, ADMIN_EMAIL } from "./firebase";
import type { UserRole } from "./db";

export interface DirectoryUser {
  /** Identificador del documento (uid si ya inició sesión, correo si está pendiente). */
  key: string;
  uid?: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  /** Aún no ha iniciado sesión por primera vez. */
  pending: boolean;
}

function inviteId(email: string) {
  return email.trim().toLowerCase();
}

/** Invitación pendiente para un correo (define el rol al registrarse). */
export async function getInvite(email: string) {
  const snap = await getDoc(doc(fbDb(), "invites", inviteId(email)));
  if (!snap.exists()) return null;
  const d = snap.data() as { name?: string; role?: UserRole; active?: boolean };
  return { name: d.name ?? "", role: (d.role ?? "cashier") as UserRole, active: d.active !== false };
}

/** Lista de usuarios: registrados en la nube + invitaciones pendientes. */
export async function listDirectory(): Promise<DirectoryUser[]> {
  const [usersSnap, invitesSnap] = await Promise.all([
    getDocs(collection(fbDb(), "users")),
    getDocs(collection(fbDb(), "invites")),
  ]);
  const registered: DirectoryUser[] = usersSnap.docs.map((d) => {
    const v = d.data() as { name?: string; email?: string; role?: UserRole; active?: boolean };
    const email = (v.email ?? "").toLowerCase();
    return {
      key: d.id,
      uid: d.id,
      email,
      name: v.name || email.split("@")[0] || "Usuario",
      role: (v.role ?? "cashier") as UserRole,
      active: v.active !== false,
      pending: false,
    };
  });
  const taken = new Set(registered.map((u) => u.email));
  const pending: DirectoryUser[] = invitesSnap.docs
    .filter((d) => !taken.has(d.id.toLowerCase()))
    .map((d) => {
      const v = d.data() as { name?: string; role?: UserRole; active?: boolean };
      return {
        key: d.id,
        email: d.id.toLowerCase(),
        name: v.name || d.id.split("@")[0],
        role: (v.role ?? "cashier") as UserRole,
        active: v.active !== false,
        pending: true,
      };
    });
  return [...registered, ...pending].sort((a, b) => a.name.localeCompare(b.name));
}

/** Invita a un usuario: podrá crear su contraseña al iniciar sesión por primera vez. */
export async function inviteUser(email: string, name: string, role: UserRole) {
  const id = inviteId(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) throw new Error("Correo no válido");
  await setDoc(doc(fbDb(), "invites", id), {
    name: name.trim() || id.split("@")[0],
    email: id,
    role,
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function updateDirectoryUser(
  u: DirectoryUser,
  patch: Partial<Pick<DirectoryUser, "name" | "role" | "active">>,
) {
  const col = u.pending ? "invites" : "users";
  await updateDoc(doc(fbDb(), col, u.key), patch);
  if (!u.pending && u.email) {
    // Mantenemos la invitación alineada por si se vuelve a registrar.
    const ref = doc(fbDb(), "invites", inviteId(u.email));
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, patch);
  }
}

export async function removeDirectoryUser(u: DirectoryUser) {
  if (u.email === ADMIN_EMAIL.toLowerCase()) throw new Error("No se puede quitar al administrador principal");
  await deleteDoc(doc(fbDb(), u.pending ? "invites" : "users", u.key));
  if (!u.pending && u.email) {
    await deleteDoc(doc(fbDb(), "invites", inviteId(u.email))).catch(() => {});
  }
}
