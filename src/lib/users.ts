import { initializeApp, deleteApp } from "firebase/app";
import { createUserWithEmailAndPassword, deleteUser, getAuth, inMemoryPersistence, sendPasswordResetEmail, setPersistence, signOut, updateProfile } from "firebase/auth";
import { collection, doc, getDocs, serverTimestamp, writeBatch, setDoc } from "firebase/firestore";
import { fbDb, fbAuth, firebaseConfig } from "./firebase";
import { assertAccess, fetchAccessSession } from "./access-session";
import { PRESET_ROLES, validPermissions, type AccessRole, type Permissions } from "./permissions";

export interface DirectoryUser {
  key: string; uid?: string; email: string; name: string;
  roleId: string; active: boolean; pending: boolean; overrides: Permissions;
  warehouseIds: string[]; allWarehouses: boolean;
}
async function requireAdministrator() {
  const session = await fetchAccessSession();
  if (!session?.assignment.active || session.assignment.roleId !== "admin") throw new Error("Solo un administrador puede gestionar usuarios y roles");
}
export async function listRoles(): Promise<AccessRole[]> {
  await requireAdministrator();
  const snapshot = await getDocs(collection(fbDb(), "accessRoles"));
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as AccessRole);
}
export async function saveRole(role: AccessRole) {
  await requireAdministrator();
  if (!role.name.trim() || !validPermissions(role.permissions)) throw new Error("Nombre o permisos no válidos");
  if (!/^[a-z0-9_-]+$/.test(role.id)) throw new Error("Identificador de rol no válido");
  if (role.id === "admin") throw new Error("El rol administrador se conserva para evitar bloqueos");
  await setDoc(doc(fbDb(), "accessRoles", role.id), { name: role.name.trim(), permissions: role.permissions, updatedAt: serverTimestamp() });
}
export async function initializeRoles() {
  await requireAdministrator();
  const existing = new Set((await getDocs(collection(fbDb(), "accessRoles"))).docs.map(d => d.id));
  const batch = writeBatch(fbDb());
  for (const role of PRESET_ROLES) if (!existing.has(role.id)) batch.set(doc(fbDb(), "accessRoles", role.id), { name: role.name, permissions: role.permissions });
  await batch.commit();
}
export async function listDirectory(): Promise<DirectoryUser[]> {
  await requireAdministrator();
  const [profiles, assignments] = await Promise.all([getDocs(collection(fbDb(), "users")), getDocs(collection(fbDb(), "userAccess"))]);
  const byEmail = new Map(assignments.docs.map(d => [d.id, d.data()]));
  return profiles.docs.map(d => {
    const profile = d.data(); const email = String(profile.email ?? "").toLowerCase(); const a = byEmail.get(email);
    return {
      key: d.id,
      uid: d.id,
      email,
      name: String(profile.name ?? email),
      roleId: String(a?.roleId ?? ""),
      active: a?.active === true,
      pending: !a,
      overrides: (a?.overrides ?? {}) as Permissions,
      warehouseIds: Array.isArray(a?.warehouseIds) ? a.warehouseIds as string[] : [],
      allWarehouses: a?.allWarehouses === true,
    };
  }).sort((a,b) => a.name.localeCompare(b.name));
}
export async function createDirectoryUser(input: { name: string; email: string; password: string; roleId: string; overrides: Permissions }) {
  await requireAdministrator();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !input.name.trim()) throw new Error("Completa nombre y correo válido");
  if (input.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
  if (!validPermissions(input.overrides)) throw new Error("Permisos no válidos");
  if (!(await listRoles()).some((role) => role.id === input.roleId)) throw new Error("Selecciona un rol existente.");
  const app = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
  const secondary = getAuth(app);
  await setPersistence(secondary, inMemoryPersistence);
  let created: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | undefined;
  try {
    created = await createUserWithEmailAndPassword(secondary, email, input.password);
    await updateProfile(created.user, { displayName: input.name.trim() });
    const batch = writeBatch(fbDb());
    batch.set(doc(fbDb(), "users", created.user.uid), { name: input.name.trim(), email, createdAt: serverTimestamp() });
    batch.set(doc(fbDb(), "userAccess", email), {
      uid: created.user.uid,
      email,
      roleId: input.roleId,
      active: true,
      overrides: input.overrides,
      warehouseIds: [],
      allWarehouses: false,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    if (created) await deleteUser(created.user).catch(() => {});
    throw error;
  } finally {
    await signOut(secondary).catch(() => {});
    await deleteApp(app);
  }
}
export async function updateDirectoryUser(user: DirectoryUser, patch: {
  name?: string;
  roleId?: string;
  active?: boolean;
  overrides?: Permissions;
  warehouseIds?: string[];
  allWarehouses?: boolean;
}) {
  await requireAdministrator();
  if (!user.uid) throw new Error("Cuenta no registrada");
  if (fbAuth().currentUser?.uid === user.uid && (patch.roleId !== undefined || patch.active !== undefined || patch.overrides !== undefined)) throw new Error("No puedes modificar tu propio acceso");
  if (patch.overrides && !validPermissions(patch.overrides)) throw new Error("Permisos no válidos");
  if (patch.roleId && !(await listRoles()).some((role) => role.id === patch.roleId)) {
    throw new Error("El rol seleccionado no existe.");
  }
  const batch = writeBatch(fbDb());
  if (patch.name !== undefined) batch.update(doc(fbDb(), "users", user.uid), { name: patch.name.trim() });
  batch.set(doc(fbDb(), "userAccess", user.email), {
    uid: user.uid,
    email: user.email,
    roleId: patch.roleId ?? user.roleId,
    active: patch.active ?? user.active,
    overrides: patch.overrides ?? user.overrides,
    warehouseIds: patch.warehouseIds ?? user.warehouseIds,
    allWarehouses: patch.allWarehouses ?? user.allWarehouses,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
export async function resetDirectoryPassword(email: string) {
  await requireAdministrator();
  await sendPasswordResetEmail(fbAuth(), email);
}
