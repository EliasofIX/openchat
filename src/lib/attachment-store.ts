// ─────────────────────────────────────────────────────────────────────────────
// attachment-store — IndexedDB blob storage for attachment payloads.
//
// Large dataUrl / textContent values live here instead of localStorage so
// conversation metadata stays small and quota-friendly.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = "openchat-blobs";
const DB_VERSION = 1;
const STORE = "attachments";

export type AttachmentBlob = {
  dataUrl?: string;
  textContent?: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }
  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

export async function putBlob(id: string, payload: AttachmentBlob): Promise<void> {
  if (!payload.dataUrl && !payload.textContent) return;
  await runTransaction("readwrite", (store) => store.put(payload, id));
}

export async function getBlob(id: string): Promise<AttachmentBlob | null> {
  try {
    const result = await runTransaction<AttachmentBlob | undefined>("readonly", (store) =>
      store.get(id),
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => store.delete(id));
  } catch {
    /* ignore */
  }
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteBlob(id)));
}

export async function putBlobsFromMessages(
  messages: Array<{ attachments?: Array<{ id: string; dataUrl?: string; textContent?: string }> }>,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const msg of messages) {
    for (const att of msg.attachments ?? []) {
      if (att.dataUrl || att.textContent) {
        tasks.push(putBlob(att.id, { dataUrl: att.dataUrl, textContent: att.textContent }));
      }
    }
  }
  await Promise.all(tasks);
}

export function collectAttachmentIds(
  messages: Array<{ attachments?: Array<{ id: string }> }>,
): string[] {
  const ids = new Set<string>();
  for (const msg of messages) {
    for (const att of msg.attachments ?? []) {
      ids.add(att.id);
    }
  }
  return [...ids];
}
