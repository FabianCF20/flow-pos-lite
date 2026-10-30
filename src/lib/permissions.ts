export const MODULES = [
  { id: "dashboard", label: "Panel general", path: "/" },
  { id: "pos", label: "Punto de venta", path: "/pos" },
  { id: "sales", label: "Ventas", path: "/sales" },
  { id: "returns", label: "Devoluciones y notas", path: "/returns" },
  { id: "customers", label: "Clientes", path: "/customers" },
  { id: "products", label: "Productos", path: "/products" },
  { id: "categories", label: "Categorías", path: "/categories" },
  { id: "inventory", label: "Inventario", path: "/inventory" },
  { id: "production", label: "Producción", path: "/production" },
  { id: "production_formulas", label: "Fórmulas de producción", path: "/production/formulas" },
  { id: "production_approval", label: "Aprobación de fórmulas", path: "/production/approval" },
  { id: "purchases", label: "Compras", path: "/purchases" },
  { id: "suppliers", label: "Proveedores", path: "/suppliers" },
  { id: "receivables", label: "Cartera", path: "/receivables" },
  { id: "accounting", label: "Contabilidad", path: "/accounting" },
  { id: "cash", label: "Caja", path: "/cash" },
  { id: "reports", label: "Reportes", path: "/reports" },
  { id: "settings", label: "Ajustes y respaldos", path: "/settings" },
] as const;
export type ModuleId = typeof MODULES[number]["id"];
export type AccessLevel = "none" | "read" | "write";
export type Permissions = Partial<Record<ModuleId, AccessLevel>>;
export interface AccessRole { id: string; name: string; permissions: Permissions; }
export interface AccessAssignment {
  email: string;
  roleId: string;
  active: boolean;
  overrides?: Permissions;
  warehouseIds?: string[];
  allWarehouses?: boolean;
}
export interface AccessSession { assignment: AccessAssignment; role: AccessRole; }
const grants = (read: ModuleId[], write: ModuleId[]): Permissions => Object.fromEntries([...read.map(m => [m, "read"]), ...write.map(m => [m, "write"])]);
export const PRESET_ROLES: AccessRole[] = [
  { id: "admin", name: "Administrador", permissions: Object.fromEntries(MODULES.map(m => [m.id, "write"])) },
  { id: "cashier", name: "Cajero", permissions: grants(["products", "categories", "customers", "sales"], ["pos", "cash"]) },
  { id: "warehouse", name: "Inventario y producción", permissions: grants(["products", "categories", "suppliers"], ["inventory", "production"]) },
  { id: "production_manager", name: "Jefe de producción", permissions: grants(["products", "categories", "inventory", "production"], ["production", "production_formulas", "production_approval"]) },
  { id: "production_operator", name: "Supervisor / operario de producción", permissions: grants(["products", "categories", "inventory", "production"], ["production"]) },
  { id: "accountant", name: "Contabilidad", permissions: grants(["sales", "customers", "suppliers", "purchases", "reports"], ["accounting", "receivables"]) },
  { id: "viewer", name: "Consulta", permissions: grants(MODULES.filter(m => m.id !== "settings").map(m => m.id), []) },
];
export function canAccess(session: AccessSession | null, module: ModuleId, action: "read" | "write" = "read") {
  if (!session?.assignment.active) return false;
  const level = session.assignment.overrides?.[module] ?? session.role.permissions[module] ?? "none";
  return action === "write" ? level === "write" : level === "read" || level === "write";
}
export function moduleForPath(path: string) { return MODULES.find(m => m.path === path)?.id; }
export function landingPath(session: AccessSession | null) {
  if (session?.assignment.roleId === "admin" && canAccess(session, "dashboard")) return "/";
  if (session?.assignment.roleId === "cashier" && canAccess(session, "pos")) return "/pos";
  if (canAccess(session, "products") && canAccess(session, "categories")) return "/catalog";
  return MODULES.find((module) =>
    module.id !== "products" && module.id !== "categories" && canAccess(session, module.id)
  )?.path ?? "/more";
}
export function validPermissions(value: Permissions) {
  return Object.entries(value).every(([key, level]) => MODULES.some(m => m.id === key) && ["none", "read", "write"].includes(level));
}