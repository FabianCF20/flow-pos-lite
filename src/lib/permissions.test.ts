import { expect, test } from "vitest";
import { canAccess, PRESET_ROLES, landingPath, type AccessSession } from "./permissions";
const session = (id: string, overrides = {}): AccessSession => {
  const role = PRESET_ROLES.find(r => r.id === id);
  if (!role) throw new Error("Missing role");
  return { assignment: { email: "test@example.com", roleId: id, active: true, overrides }, role };
};
test("read permission allows consulting but denies modifying data", () => {
  const s = session("viewer");
  expect(canAccess(s, "products", "read")).toBe(true);
  expect(canAccess(s, "products", "write")).toBe(false);
});
test("cashier cannot access accounting or settings", () => {
  const s = session("cashier");
  expect(canAccess(s, "accounting")).toBe(false);
  expect(canAccess(s, "settings")).toBe(false);
  expect(landingPath(s)).toBe("/pos");
});
test("individual override can revoke a role permission", () => {
  expect(canAccess(session("warehouse", { production: "none" }), "production")).toBe(false);
});
test("deactivated and unknown sessions have no access", () => {
  const s = session("admin"); s.assignment.active = false;
  expect(canAccess(s, "settings", "write")).toBe(false);
  expect(canAccess(null, "products")).toBe(false);
});