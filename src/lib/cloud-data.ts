import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { fbAuth, fbDb } from "./firebase";

/**
 * Repositorio cloud-first.
 *
 * Los métodos de lectura puntual/listado fuerzan lectura desde el servidor.
 * Las escrituras esperan confirmación de Firestore y nunca guardan primero en Dexie.
 * Esta capa se irá adoptando módulo por módulo antes de retirar el repositorio local.
 */
export const CLOUD_COMPANY_ID = "default";

export interface CloudRecord {
  id: string;
  companyId: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  revision: number;
  deleted?: boolean;
}

export interface CloudSnapshot<T extends CloudRecord> {
  records: T[];
  fromCache: boolean;
}

function requireAuthenticatedUser() {
  const user = fbAuth().currentUser;
  if (!user) throw new Error("Debes iniciar sesión para consultar o guardar información.");
  return user;
}

function requireOnline() {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    throw new Error("No hay conexión. Conéctate a internet para consultar o guardar información.");
  }
}

function collectionRef(collectionName: string) {
  if (!/^[a-z][a-zA-Z0-9_]{1,63}$/.test(collectionName)) {
    throw new Error("Nombre de colección no válido.");
  }
  return collection(fbDb(), "erp", CLOUD_COMPANY_ID, collectionName);
}

function assertPatchIsSafe(patch: Record<string, unknown>) {
  const reserved = new Set(["id", "companyId", "createdAt", "createdBy", "revision", "deleted"]);
  for (const key of Object.keys(patch)) {
    if (reserved.has(key)) throw new Error(`El campo "${key}" no se puede modificar directamente.`);
  }
}

/** Lee un documento directamente desde el servidor; no acepta una copia de caché como resultado. */
export async function getCloudRecord<T extends CloudRecord>(
  collectionName: string,
  id: string,
): Promise<T | null> {
  requireAuthenticatedUser();
  requireOnline();
  const snapshot = await getDocFromServer(doc(collectionRef(collectionName), id));
  if (!snapshot.exists() || snapshot.data().deleted === true) return null;
  return { ...snapshot.data(), id: snapshot.id } as T;
}

/** Lista documentos desde el servidor. Añade filtros/paginación según cada módulo. */
export async function listCloudRecords<T extends CloudRecord>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
): Promise<T[]> {
  requireAuthenticatedUser();
  requireOnline();
  const snapshot = await getDocsFromServer(query(collectionRef(collectionName), ...constraints));
  return snapshot.docs
    .filter((item) => item.data().deleted !== true)
    .map((item) => ({ ...item.data(), id: item.id }) as T);
}

/** Crea un documento con UUID global. La promesa solo finaliza al confirmar Firestore. */
export async function createCloudRecord<T extends Record<string, unknown>>(
  collectionName: string,
  input: T,
): Promise<string> {
  const user = requireAuthenticatedUser();
  requireOnline();
  const id = crypto.randomUUID();
  const now = Date.now();
  const record: DocumentData = {
    ...input,
    id,
    companyId: CLOUD_COMPANY_ID,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
    updatedBy: user.uid,
    revision: 1,
    deleted: false,
  };
  await setDoc(doc(collectionRef(collectionName), id), record);
  return id;
}

/**
 * Actualiza con transacción y control de revisión para evitar sobrescrituras silenciosas.
 * Devuelve la nueva revisión confirmada por Firestore.
 */
export async function updateCloudRecord(
  collectionName: string,
  id: string,
  patch: Record<string, unknown>,
  expectedRevision?: number,
): Promise<number> {
  const user = requireAuthenticatedUser();
  requireOnline();
  assertPatchIsSafe(patch);
  const reference = doc(collectionRef(collectionName), id);

  return runTransaction(fbDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().deleted === true) {
      throw new Error("El registro ya no existe o fue eliminado.");
    }

    const currentRevision = Number(snapshot.data().revision ?? 1);
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      throw new Error("Este registro fue modificado por otro usuario. Actualiza la información antes de guardar.");
    }

    const nextRevision = currentRevision + 1;
    transaction.update(reference, {
      ...patch,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: nextRevision,
    });
    return nextRevision;
  });
}

/** Eliminación lógica: conserva trazabilidad y evita borrar físicamente el historial. */
export async function softDeleteCloudRecord(collectionName: string, id: string): Promise<void> {
  const user = requireAuthenticatedUser();
  requireOnline();
  const reference = doc(collectionRef(collectionName), id);

  await runTransaction(fbDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().deleted === true) return;
    transaction.update(reference, {
      deleted: true,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      revision: Number(snapshot.data().revision ?? 1) + 1,
    });
  });
}

/**
 * Escucha cambios en tiempo real. fromCache permite a la pantalla distinguir
 * una instantánea local temporal de datos confirmados por el servidor.
 */
export function subscribeCloudRecords<T extends CloudRecord>(
  collectionName: string,
  onChange: (snapshot: CloudSnapshot<T>) => void,
  onError: (error: Error) => void,
  constraints: QueryConstraint[] = [],
): Unsubscribe {
  requireAuthenticatedUser();
  return onSnapshot(
    query(collectionRef(collectionName), ...constraints),
    { includeMetadataChanges: true },
    (snapshot) => {
      onChange({
        records: snapshot.docs
          .filter((item) => item.data().deleted !== true)
          .map((item) => ({ ...item.data(), id: item.id }) as T),
        fromCache: snapshot.metadata.fromCache,
      });
    },
    (error) => onError(error),
  );
}
