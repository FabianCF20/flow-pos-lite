import { collection, doc, query, runTransaction, where } from "firebase/firestore";
import { fbAuth, fbDb } from "./firebase";
import {
  CLOUD_COMPANY_ID,
  createCloudRecord,
  getCloudRecord,
  listCloudRecords,
  type CloudRecord,
} from "./cloud-data";

/**
 * Estructura organizacional de la operación láctea.
 * Todos los identificadores son UUID generados por Firestore repository.
 * Las unidades no se eliminan físicamente: se desactivan para conservar trazabilidad.
 */
export type OrganizationUnitType =
  | "company"
  | "site"
  | "area"
  | "warehouse"
  | "production_line";

export interface OrganizationUnit extends CloudRecord {
  code: string;
  name: string;
  type: OrganizationUnitType;
  parentId: string | null;
  active: boolean;
  description?: string;
  address?: string;
  timezone: string;
}

const ALLOWED_PARENT_TYPES: Record<OrganizationUnitType, OrganizationUnitType[]> = {
  company: [],
  site: ["company"],
  area: ["site"],
  warehouse: ["site", "area"],
  production_line: ["area"],
};

function normalizeText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`El campo ${field} es obligatorio.`);
  return normalized;
}

async function validateParent(
  type: OrganizationUnitType,
  parentId: string | null,
): Promise<void> {
  const allowed = ALLOWED_PARENT_TYPES[type];
  if (allowed.length === 0) {
    if (parentId) throw new Error("La empresa no puede tener una unidad superior.");
    const existing = await listCloudRecords<OrganizationUnit>("organizationUnits");
    if (existing.some((unit) => unit.type === "company" && unit.active)) {
      throw new Error("Ya existe una empresa principal configurada.");
    }
    return;
  }

  if (!parentId) throw new Error("Debes seleccionar la unidad superior.");
  const parent = await getCloudRecord<OrganizationUnit>("organizationUnits", parentId);
  if (!parent || !parent.active) throw new Error("La unidad superior no existe o está inactiva.");
  if (!allowed.includes(parent.type)) {
    throw new Error("La jerarquía seleccionada no es válida para este tipo de unidad.");
  }
}

export async function listOrganizationUnits(): Promise<OrganizationUnit[]> {
  const units = await listCloudRecords<OrganizationUnit>("organizationUnits");
  return units.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function createOrganizationUnit(input: {
  code: string;
  name: string;
  type: OrganizationUnitType;
  parentId?: string | null;
  description?: string;
  address?: string;
  timezone?: string;
}): Promise<string> {
  const code = normalizeText(input.code, "código").toUpperCase();
  const name = normalizeText(input.name, "nombre");
  const parentId = input.parentId ?? null;

  await validateParent(input.type, parentId);
  const existing = await listOrganizationUnits();
  if (existing.some((unit) => unit.code.toUpperCase() === code)) {
    throw new Error("Ya existe una unidad organizacional con ese código.");
  }

  return createCloudRecord("organizationUnits", {
    code,
    name,
    type: input.type,
    parentId,
    active: true,
    description: input.description?.trim() || "",
    address: input.address?.trim() || "",
    timezone: input.timezone || "America/Bogota",
  });
}

export async function updateOrganizationUnit(
  id: string,
  patch: Partial<Pick<OrganizationUnit, "name" | "description" | "address" | "active">>,
): Promise<void> {
  const user = fbAuth().currentUser;
  if (!user) throw new Error("Debes iniciar sesión para modificar la estructura organizacional.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No hay conexión. La estructura solo se modifica con confirmación del servidor.");
  }

  const safePatch: Record<string, unknown> = {};
  if (patch.name !== undefined) safePatch.name = normalizeText(patch.name, "nombre");
  if (patch.description !== undefined) safePatch.description = patch.description.trim();
  if (patch.address !== undefined) safePatch.address = patch.address.trim();
  if (patch.active !== undefined) safePatch.active = patch.active;
  if (Object.keys(safePatch).length === 0) return;

  const reference = doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, "organizationUnits"), id);
  await runTransaction(fbDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().deleted === true) {
      throw new Error("La unidad organizacional no existe.");
    }
    const current = { ...snapshot.data(), id: snapshot.id } as OrganizationUnit;
    const currentRevision = Number(current.revision ?? 1);
    if (patch.active === false) {
      const childrenQuery = query(
        collection(fbDb(), "erp", CLOUD_COMPANY_ID, "organizationUnits"),
        where("parentId", "==", id),
      );
      const children = await transaction.get(childrenQuery);
      if (children.docs.some((child) => child.data().active === true && child.data().deleted !== true)) {
        throw new Error("No puedes desactivar esta unidad mientras tenga unidades hijas activas.");
      }

      if (current.type === "warehouse") {
        const balancesQuery = query(
          collection(fbDb(), "erp", CLOUD_COMPANY_ID, "inventoryBalances"),
          where("warehouseId", "==", id),
        );
        const balances = await transaction.get(balancesQuery);
        if (balances.docs.some((balance) => Number(balance.data().quantity ?? 0) > 0)) {
          throw new Error("No puedes desactivar una bodega que todavía tiene existencias.");
        }
      }
    } else if (patch.active === true && current.parentId) {
      const parentRef = doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, "organizationUnits"), current.parentId);
      const parent = await transaction.get(parentRef);
      if (!parent.exists() || parent.data().active !== true || parent.data().deleted === true) {
        throw new Error("No puedes activar una unidad cuya unidad superior esté inactiva.");
      }
    }

    transaction.update(reference, {
      ...safePatch,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: currentRevision + 1,
    });
  });
}
