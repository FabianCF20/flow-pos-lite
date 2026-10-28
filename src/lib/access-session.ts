import { doc, getDocFromServer } from "firebase/firestore";
import { fbAuth, fbDb } from "./firebase";
import { type AccessRole, type AccessAssignment, type AccessSession, canAccess, type ModuleId } from "./permissions";

let current: AccessSession | null = null;
export function setAccessSession(value: AccessSession | null) { current = value; }
export function getAccessSession() { return current; }
export function assertAccess(module: ModuleId, action: "read" | "write" = "write") {
  if (!canAccess(current, module, action)) throw new Error(`No tienes permiso para ${action === "write" ? "modificar" : "consultar"} estos datos`);
}
export async function fetchAccessSession(): Promise<AccessSession | null> {
  await fbAuth().authStateReady();
  const fb = fbAuth().currentUser;
  if (!fb?.email) { current = null; return null; }
  const snap = await getDocFromServer(doc(fbDb(), "userAccess", fb.email.toLowerCase()));
  if (!snap.exists()) { current = null; return null; }
  const assignment = { ...snap.data(), email: fb.email.toLowerCase() } as AccessAssignment;
  if (!assignment.active) { current = null; return null; }
  const roleSnap = await getDocFromServer(doc(fbDb(), "accessRoles", assignment.roleId));
  if (!roleSnap.exists()) { current = null; return null; }
  current = { assignment, role: { ...roleSnap.data(), id: roleSnap.id } as AccessRole };
  return current;
}