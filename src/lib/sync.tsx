import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { fbDb } from "./firebase";
import {
  db,
  readTombstones,
  writeTombstones,
  withRemoteApply,
  SYNCED_TABLES,
  type SyncedTable,
} from "./db";
import { useAuth } from "./auth";

/** ERP de una sola empresa: todos los datos viven bajo este espacio. */
const COMPANY = "default";
const DEVICE_KEY = "erp.sync.deviceId";
const CURSOR_PREFIX = "erp.sync.cursor.";

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "local";
  }
}

function readCursor(table: SyncedTable): number {
  try {
    return Number(localStorage.getItem(CURSOR_PREFIX + table) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeCursor(table: SyncedTable, value: number) {
  try {
    if (value > readCursor(table)) localStorage.setItem(CURSOR_PREFIX + table, String(value));
  } catch {}
}

function tableRef(table: SyncedTable) {
  return collection(fbDb(), "erp", COMPANY, table);
}

function local(table: SyncedTable) {
  return (db as any)[table] as typeof db.products;
}

/** Quita campos internos y valores undefined (Firestore no los acepta). */
function toRemote(row: any) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (k === "id" || k === "syncedAt" || k === "remoteId") continue;
    out[k] = v;
  }
  out.deleted = false;
  return out;
}

/** Envía a la nube los cambios locales pendientes (updatedAt > syncedAt). */
async function pushTable(table: SyncedTable): Promise<number> {
  const rows: any[] = await local(table).toArray();
  const pending = rows.filter((r) => (r.updatedAt ?? 0) > (r.syncedAt ?? 0));
  let sent = 0;
  for (let i = 0; i < pending.length; i += 300) {
    const chunk = pending.slice(i, i + 300);
    const batch = writeBatch(fbDb());
    for (const row of chunk) {
      const remoteId = row.remoteId || `${deviceId()}-${row.id}`;
      batch.set(doc(tableRef(table), remoteId), { ...toRemote(row), remoteId }, { merge: true });
    }
    await batch.commit();
    await withRemoteApply(async () => {
      for (const row of chunk) {
        await local(table).update(row.id, {
          remoteId: row.remoteId || `${deviceId()}-${row.id}`,
          syncedAt: row.updatedAt ?? Date.now(),
          updatedAt: row.updatedAt,
        } as any);
      }
    });
    sent += chunk.length;
  }
  return sent;
}

/** Publica en la nube las eliminaciones hechas sin conexión. */
async function pushDeletions(): Promise<number> {
  const list = readTombstones();
  if (!list.length) return 0;
  const done: typeof list = [];
  for (const t of list) {
    try {
      await setDoc(
        doc(tableRef(t.table), `${deviceId()}-${t.id}`),
        { deleted: true, updatedAt: t.deletedAt },
        { merge: true },
      );
      done.push(t);
    } catch {
      break;
    }
  }
  if (done.length) writeTombstones(list.filter((t) => !done.includes(t)));
  return done.length;
}

/** Aplica un documento de la nube: gana el registro con updatedAt más reciente. */
async function applyRemoteDoc(table: SyncedTable, remoteId: string, data: any) {
  const remoteUpdated = Number(data.updatedAt ?? 0);
  const existing: any =
    (await local(table).where("remoteId").equals(remoteId).first()) ??
    (remoteId.startsWith(deviceId() + "-")
      ? await local(table).get(Number(remoteId.slice(deviceId().length + 1)))
      : undefined);

  if (data.deleted) {
    if (existing?.id && remoteUpdated >= (existing.updatedAt ?? 0)) {
      await withRemoteApply(() => local(table).delete(existing.id));
    }
    return;
  }

  const { id: _ignore, deleted: _d, ...fields } = data as Record<string, any>;
  if (existing?.id) {
    if (remoteUpdated <= (existing.updatedAt ?? 0)) return; // el local es más nuevo: gana y se enviará
    await withRemoteApply(() =>
      local(table).update(existing.id, {
        ...fields,
        remoteId,
        updatedAt: remoteUpdated,
        syncedAt: remoteUpdated,
      } as any),
    );
    return;
  }
  await withRemoteApply(() =>
    local(table).add({
      ...fields,
      remoteId,
      updatedAt: remoteUpdated,
      syncedAt: remoteUpdated,
      createdAt: Number(fields.createdAt ?? remoteUpdated) || Date.now(),
    } as any),
  );
}

/** Descarga los cambios de la nube posteriores al último cursor. */
async function pullTable(table: SyncedTable): Promise<number> {
  const since = readCursor(table);
  const snap = await getDocs(query(tableRef(table), where("updatedAt", ">", since)));
  let max = since;
  for (const d of snap.docs) {
    const data = d.data() as any;
    await applyRemoteDoc(table, d.id, data);
    max = Math.max(max, Number(data.updatedAt ?? 0));
  }
  writeCursor(table, max);
  return snap.size;
}

/** Sincronización completa (subir + bajar) de productos, clientes y proveedores. */
export async function syncNow(): Promise<{ pushed: number; pulled: number }> {
  let pushed = await pushDeletions();
  let pulled = 0;
  for (const table of SYNCED_TABLES) {
    pushed += await pushTable(table);
    pulled += await pullTable(table);
  }
  return { pushed, pulled };
}

export type SyncState = "idle" | "syncing" | "offline" | "error";

interface SyncCtx {
  state: SyncState;
  lastSync: number | null;
  pending: number;
  sync: () => Promise<void>;
}

const Ctx = createContext<SyncCtx | null>(null);
const LAST_SYNC_KEY = "erp.sync.lastSync";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SyncState>("idle");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LAST_SYNC_KEY) ?? 0);
      if (v) setLastSync(v);
    } catch {}
  }, []);

  const refreshPending = useCallback(async () => {
    let count = readTombstones().length;
    for (const table of SYNCED_TABLES) {
      const rows: any[] = await local(table).toArray();
      count += rows.filter((r) => (r.updatedAt ?? 0) > (r.syncedAt ?? 0)).length;
    }
    setPending(count);
  }, []);

  const sync = useCallback(async () => {
    if (!user || running.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState("offline");
      await refreshPending();
      return;
    }
    running.current = true;
    setState("syncing");
    try {
      await syncNow();
      const now = Date.now();
      setLastSync(now);
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(now));
      } catch {}
      setState("idle");
    } catch {
      setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    } finally {
      running.current = false;
      await refreshPending();
    }
  }, [user, refreshPending]);

  // Sincroniza al entrar, cada 60 s, al volver la conexión y al escribir en local.
  useEffect(() => {
    if (!user) return;
    void sync();
    const timer = setInterval(() => void sync(), 60_000);
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const unhooks = SYNCED_TABLES.map((t) => {
      const table = local(t);
      const handler = () => {
        void refreshPending();
      };
      table.hook("creating", handler);
      table.hook("updating", handler as any);
      table.hook("deleting", handler as any);
      return () => {
        table.hook("creating").unsubscribe(handler);
        table.hook("updating").unsubscribe(handler as any);
        table.hook("deleting").unsubscribe(handler as any);
      };
    });
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      unhooks.forEach((fn) => fn());
    };
  }, [user, sync, refreshPending]);

  // Escucha en tiempo real los cambios que hacen otros dispositivos.
  useEffect(() => {
    if (!user) return;
    const unsubs = SYNCED_TABLES.map((table) =>
      onSnapshot(
        query(tableRef(table), where("updatedAt", ">", readCursor(table))),
        async (snap) => {
          let max = readCursor(table);
          for (const change of snap.docChanges()) {
            const data = change.doc.data() as any;
            await applyRemoteDoc(table, change.doc.id, data);
            max = Math.max(max, Number(data.updatedAt ?? 0));
          }
          writeCursor(table, max);
        },
        () => {},
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [user]);

  return <Ctx.Provider value={{ state, lastSync, pending, sync }}>{children}</Ctx.Provider>;
}

export function useSync(): SyncCtx {
  return (
    useContext(Ctx) ?? { state: "idle", lastSync: null, pending: 0, sync: async () => {} }
  );
}
