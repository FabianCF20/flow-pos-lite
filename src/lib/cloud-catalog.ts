import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  where,
  type DocumentData,
} from "firebase/firestore";
import { fbAuth, fbDb } from "./firebase";
import { CLOUD_COMPANY_ID, type CloudRecord } from "./cloud-data";

export type DairyProductType = "raw_material" | "finished_product" | "packaging" | "supply";

export interface CloudCategory extends CloudRecord {
  code: string;
  name: string;
  description: string;
  color: string;
  active: boolean;
}

export interface CloudProduct extends CloudRecord {
  code: string;
  name: string;
  description: string;
  categoryId: string;
  productType: DairyProductType;
  sku: string;
  barcode: string;
  baseUnit: string;
  salePrice: number;
  standardCost: number;
  trackInventory: boolean;
  active: boolean;
  imagePath?: string;
}

type CategoryInput = Pick<CloudCategory, "code" | "name"> & Partial<Pick<CloudCategory, "description" | "color">>;
type ProductInput = Pick<CloudProduct, "code" | "name" | "categoryId" | "productType" | "baseUnit"> &
  Partial<Pick<CloudProduct, "description" | "sku" | "barcode" | "salePrice" | "standardCost" | "trackInventory" | "active" | "imagePath">>;

function currentUser() {
  const user = fbAuth().currentUser;
  if (!user) throw new Error("Debes iniciar sesión para administrar el catálogo.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No hay conexión. El catálogo solo se guarda con confirmación del servidor.");
  }
  return user;
}

function text(value: string, label: string, max = 120) {
  const result = value.trim();
  if (!result) throw new Error(`El campo ${label} es obligatorio.`);
  if (result.length > max) throw new Error(`El campo ${label} supera ${max} caracteres.`);
  return result;
}

function normalizeCode(value: string) {
  return text(value, "código", 40).toUpperCase();
}

function recordRef(collectionName: string, id: string) {
  return doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, collectionName), id);
}

function indexRef(collectionName: string, value: string) {
  return doc(collection(fbDb(), "erp", CLOUD_COMPANY_ID, collectionName), value);
}

async function indexId(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLocaleLowerCase("es"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function auditFields(userId: string, now: number) {
  return {
    companyId: CLOUD_COMPANY_ID,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
    revision: 1,
    deleted: false,
  };
}


export async function listCloudCategories(): Promise<CloudCategory[]> {
  currentUser();
  const snapshot = await getDocsFromServer(query(collection(fbDb(), "erp", CLOUD_COMPANY_ID, "categories")));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as CloudCategory)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function createCloudCategory(input: CategoryInput): Promise<string> {
  const user = currentUser();
  const code = normalizeCode(input.code);
  const name = text(input.name, "nombre");
  const codeKey = await indexId(code);
  const id = crypto.randomUUID();
  const now = Date.now();
  const data: DocumentData = {
    ...auditFields(user.uid, now),
    id,
    code,
    name,
    description: input.description?.trim() ?? "",
    color: input.color ?? "#64748b",
    active: true,
  };

  await runTransaction(fbDb(), async (transaction) => {
    const uniqueRef = indexRef("categoryCodeIndexes", codeKey);
    const existing = await transaction.get(uniqueRef);
    if (existing.exists()) throw new Error("Ya existe una categoría con ese código.");
    transaction.set(recordRef("categories", id), data);
    transaction.set(uniqueRef, { recordId: id, value: code, createdAt: now });
  });
  return id;
}

export async function updateCloudCategory(
  id: string,
  patch: Partial<Pick<CloudCategory, "name" | "description" | "color" | "active">>,
  expectedRevision: number,
): Promise<void> {
  const user = currentUser();
  const safePatch: Record<string, unknown> = {};
  if (patch.name !== undefined) safePatch.name = text(patch.name, "nombre");
  if (patch.description !== undefined) safePatch.description = patch.description.trim();
  if (patch.color !== undefined) safePatch.color = patch.color;
  if (patch.active !== undefined) safePatch.active = patch.active;
  if (Object.keys(safePatch).length === 0) return;

  await runTransaction(fbDb(), async (transaction) => {
    const reference = recordRef("categories", id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().deleted === true) throw new Error("La categoría ya no existe.");
    if (Number(snapshot.data().revision ?? 1) !== expectedRevision) {
      throw new Error("La categoría cambió en otro equipo. Actualiza antes de guardar.");
    }

    if (patch.active === false) {
      const productQuery = query(
        collection(fbDb(), "erp", CLOUD_COMPANY_ID, "products"),
        where("categoryId", "==", id),
      );
      const products = await transaction.get(productQuery);
      if (products.docs.some((product) => product.data().active === true && product.data().deleted !== true)) {
        throw new Error("No puedes desactivar una categoría que tiene productos activos.");
      }
    }

    transaction.update(reference, {
      ...safePatch,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: expectedRevision + 1,
    });
  });
}

export async function listCloudProducts(): Promise<CloudProduct[]> {
  currentUser();
  const snapshot = await getDocsFromServer(query(collection(fbDb(), "erp", CLOUD_COMPANY_ID, "products")));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as CloudProduct)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function validateProduct(input: ProductInput) {
  if (!["raw_material", "finished_product", "packaging", "supply"].includes(input.productType)) {
    throw new Error("El tipo de producto no es válido.");
  }
  const salePrice = input.salePrice ?? 0;
  const standardCost = input.standardCost ?? 0;
  if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("El precio de venta no puede ser negativo.");
  if (!Number.isFinite(standardCost) || standardCost < 0) throw new Error("El costo estándar no puede ser negativo.");
  return {
    code: normalizeCode(input.code),
    name: text(input.name, "nombre"),
    description: input.description?.trim() ?? "",
    categoryId: text(input.categoryId, "categoría", 128),
    productType: input.productType,
    sku: input.sku?.trim().toUpperCase() ?? "",
    barcode: input.barcode?.trim() ?? "",
    baseUnit: text(input.baseUnit, "unidad base", 16),
    salePrice,
    standardCost,
    trackInventory: input.trackInventory ?? true,
    active: input.active ?? true,
    imagePath: input.imagePath ?? "",
  };
}

async function readProductIndexRefs(data: ReturnType<typeof validateProduct>) {
  const refs: { collectionName: string; key: string }[] = [
    { collectionName: "productCodeIndexes", key: await indexId(data.code) },
  ];
  if (data.sku) refs.push({ collectionName: "productSkuIndexes", key: await indexId(data.sku) });
  if (data.barcode) refs.push({ collectionName: "productBarcodeIndexes", key: await indexId(data.barcode) });
  return refs;
}

export async function createCloudProduct(input: ProductInput): Promise<string> {
  const user = currentUser();
  const data = validateProduct(input);
  const indexes = await readProductIndexRefs(data);
  const id = crypto.randomUUID();
  const now = Date.now();

  await runTransaction(fbDb(), async (transaction) => {
    const categorySnapshot = await transaction.get(recordRef("categories", data.categoryId));
    if (!categorySnapshot.exists() || categorySnapshot.data().deleted === true || categorySnapshot.data().active === false) {
      throw new Error("La categoría seleccionada no existe o está inactiva.");
    }
    const indexSnapshots = await Promise.all(indexes.map((index) =>
      transaction.get(indexRef(index.collectionName, index.key)),
    ));
    if (indexSnapshots.some((snapshot) => snapshot.exists())) {
      throw new Error("El código, SKU o código de barras ya está registrado en otro producto.");
    }
    transaction.set(recordRef("products", id), {
      ...auditFields(user.uid, now),
      id,
      ...data,
    });
    indexes.forEach((index) => transaction.set(indexRef(index.collectionName, index.key), {
      recordId: id,
      createdAt: now,
    }));
  });
  return id;
}

export async function updateCloudProduct(
  id: string,
  patch: ProductInput,
  expectedRevision: number,
): Promise<void> {
  const user = currentUser();
  const data = validateProduct(patch);
  const nextIndexes = await readProductIndexRefs(data);
  const reference = recordRef("products", id);

  await runTransaction(fbDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().deleted === true) throw new Error("El producto ya no existe.");
    if (Number(snapshot.data().revision ?? 1) !== expectedRevision) {
      throw new Error("El producto cambió en otro equipo. Actualiza antes de guardar.");
    }

    const categorySnapshot = await transaction.get(recordRef("categories", data.categoryId));
    if (!categorySnapshot.exists() || categorySnapshot.data().deleted === true || categorySnapshot.data().active === false) {
      throw new Error("La categoría seleccionada no existe o está inactiva.");
    }

    const old = snapshot.data();
    if (String(old.code ?? "") !== data.code
      || String(old.sku ?? "") !== data.sku
      || String(old.barcode ?? "") !== data.barcode) {
      throw new Error("El código, SKU y código de barras no se pueden cambiar después de crear el producto. Crea otro producto si necesitas identificadores distintos.");
    }
    const oldIndexRefs = await readProductIndexRefs(validateProduct({
      code: String(old.code ?? ""),
      name: String(old.name ?? ""),
      categoryId: String(old.categoryId ?? ""),
      productType: old.productType as DairyProductType,
      baseUnit: String(old.baseUnit ?? "u"),
      sku: String(old.sku ?? ""),
      barcode: String(old.barcode ?? ""),
      salePrice: Number(old.salePrice ?? 0),
      standardCost: Number(old.standardCost ?? 0),
      trackInventory: old.trackInventory !== false,
      active: old.active !== false,
    }));
    const allRefs = [...new Map([...oldIndexRefs, ...nextIndexes].map((item) =>
      [item.collectionName + "/" + item.key, item],
    )).values()];
    const snapshots = await Promise.all(allRefs.map((item) =>
      transaction.get(indexRef(item.collectionName, item.key)),
    ));
    if (data.active === false && old.active !== false) {
      const balancesQuery = query(
        collection(fbDb(), "erp", CLOUD_COMPANY_ID, "inventoryBalances"),
        where("productId", "==", id),
      );
      const balances = await transaction.get(balancesQuery);
      if (balances.docs.some((balance) => Number(balance.data().quantity ?? 0) > 0)) {
        throw new Error("No puedes desactivar un producto que todavía tiene existencias.");
      }
    }

    for (let i = 0; i < allRefs.length; i++) {
      const current = snapshots[i];
      const belongsToThisProduct = current.exists() && current.data().recordId === id;
      const isNextIndex = nextIndexes.some((item) => item.collectionName === allRefs[i].collectionName && item.key === allRefs[i].key);
      if (isNextIndex && current.exists() && !belongsToThisProduct) {
        throw new Error("El código, SKU o código de barras ya está registrado en otro producto.");
      }
    }

    allRefs.forEach((item, index) => {
      const current = snapshots[index];
      const isNextIndex = nextIndexes.some((next) => next.collectionName === item.collectionName && next.key === item.key);
      if (isNextIndex) transaction.set(indexRef(item.collectionName, item.key), { recordId: id, createdAt: current.data()?.createdAt ?? Date.now() });
    });

    transaction.update(reference, {
      ...data,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: expectedRevision + 1,
    });
  });
}

export async function deactivateCloudProduct(id: string, expectedRevision: number): Promise<void> {
  const user = currentUser();
  await runTransaction(fbDb(), async (transaction) => {
    const reference = recordRef("products", id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().deleted === true) throw new Error("El producto ya no existe.");
    if (Number(snapshot.data().revision ?? 1) !== expectedRevision) {
      throw new Error("El producto cambió en otro equipo. Actualiza antes de guardar.");
    }
    const balancesQuery = query(
      collection(fbDb(), "erp", CLOUD_COMPANY_ID, "inventoryBalances"),
      where("productId", "==", id),
    );
    const balances = await transaction.get(balancesQuery);
    if (balances.docs.some((balance) => Number(balance.data().quantity ?? 0) > 0)) {
      throw new Error("No puedes desactivar un producto que todavía tiene existencias.");
    }
    transaction.update(reference, {
      active: false,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: expectedRevision + 1,
    });
  });
}
