import { doc, getDocFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { ADMIN_EMAIL, fbAuth, fbDb } from "./firebase";
import { PRESET_ROLES } from "./permissions";
import { type AccessRole, type AccessAssignment, type AccessSession, canAccess, type ModuleId } from "./permissions";

let current: AccessSession | null = null;
const adminRole = PRESET_ROLES.find(role => role.id === "admin");
export function setAccessSession(value: AccessSession | null) { current = value; }
export function getAccessSession() { return current; }
export function assertAccess(module: ModuleId, action: "read" | "write" = "write") {
  if (!canAccess(current, module, action)) throw new Error(`No tienes permiso para ${action === "write" ? "modificar" : "consultar"} estos datos`);
}

async function bootstrapAdmin(email: string, uid: string) {
  if (email !== ADMIN_EMAIL.toLowerCase()) return;
  if (!adminRole) throw new Error("No se encontró la configuración del rol administrador");

  const firestore = fbDb();
  const assignmentRef = doc(firestore, "userAccess", email);
  const roleRefs = PRESET_ROLES.map(role => doc(firestore, "accessRoles", role.id));
  const profileRef = doc(firestore, "users", uid);
  await runTransaction(firestore, async transaction => {
    const assignmentSnap = await transaction.get(assignmentRef);
    if (assignmentSnap.exists()) {
      const assignment = assignmentSnap.data();
      if (assignment.uid !== uid || assignment.roleId !== "admin" || assignment.active !== true) return;
    }
    const roleSnaps = await Promise.all(roleRefs.map(roleRef => transaction.get(roleRef)));
    const profileSnap = await transaction.get(profileRef);
    PRESET_ROLES.forEach((role, index) => {
      const roleSnapshot = roleSnaps[index];
      if (!roleSnapshot?.exists()) {
        transaction.set(roleRefs[index], { name: role.name, permissions: role.permissions, updatedAt: serverTimestamp() });
      } else {
        const storedPermissions = roleSnapshot.data().permissions ?? {};
        const missingPermissions: Record<string, string> = {};
        for (const moduleId of ["orders", "dispatch"] as const) {
          if (!(moduleId in storedPermissions)) {
            missingPermissions[moduleId] = role.permissions[moduleId] ?? "none";
          }
        }
        if (Object.keys(missingPermissions).length > 0) {
          transaction.update(roleRefs[index], {
            permissions: { ...storedPermissions, ...missingPermissions },
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
    if (!assignmentSnap.exists()) {
      transaction.set(assignmentRef, {
        email, uid, roleId: "admin", active: true, overrides: {}, updatedAt: serverTimestamp(),
      });
    }
    if (!profileSnap.exists()) {
      transaction.set(profileRef, {
        name: fbAuth().currentUser?.displayName ?? email, email, createdAt: serverTimestamp(),
      });
    }
  });
}

export async function fetchAccessSession(): Promise<AccessSession | null> {
  await fbAuth().authStateReady();
  const fb = fbAuth().currentUser;
  if (!fb?.email) { current = null; return null; }
  const email = fb.email.toLowerCase();
  let snap = await getDocFromServer(doc(fbDb(), "userAccess", email));
  if (email === ADMIN_EMAIL.toLowerCase()) {
    await bootstrapAdmin(email, fb.uid);
    snap = await getDocFromServer(doc(fbDb(), "userAccess", email));
  }
  if (!snap.exists()) { current = null; return null; }
  const assignment = { ...snap.data(), email: fb.email.toLowerCase() } as AccessAssignment;
  if (!assignment.active) { current = null; return null; }
  const roleSnap = await getDocFromServer(doc(fbDb(), "accessRoles", assignment.roleId));
  if (!roleSnap.exists()) { current = null; return null; }
  current = { assignment, role: { ...roleSnap.data(), id: roleSnap.id } as AccessRole };
  return current;
}