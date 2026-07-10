// In-memory + IndexedDB LRU cache for Grok TTS audio blobs.
// Keyed by voice + speech text so replays skip the network across reloads.
// Evicts by entry count and total byte budget.

import type { GrokTtsVoice } from "./types";

export const TTS_CACHE_MAX_ENTRIES = 24;
/** Soft cap on cached audio retained in memory / IDB (~32 MiB). */
export const TTS_CACHE_MAX_BYTES = 32 * 1024 * 1024;

const DB_NAME = "openchat-tts";
const DB_VERSION = 1;
const STORE = "audio";

type CacheEntry = {
  blob: Blob;
  size: number;
};

type StoredEntry = {
  voice: GrokTtsVoice;
  text: string;
  blob: Blob;
  size: number;
  updatedAt: number;
};

const memory = new Map<string, CacheEntry>();
let memoryBytes = 0;

let dbPromise: Promise<IDBDatabase> | null = null;

function cacheKey(voice: GrokTtsVoice, text: string) {
  return `${voice}\0${text}`;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
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

function touchMemory(key: string, entry: CacheEntry) {
  memory.delete(key);
  memory.set(key, entry);
}

function evictMemory() {
  while (
    memory.size > TTS_CACHE_MAX_ENTRIES ||
    (memoryBytes > TTS_CACHE_MAX_BYTES && memory.size > 0)
  ) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    const entry = memory.get(oldest);
    memory.delete(oldest);
    if (entry) memoryBytes -= entry.size;
  }
}

function putMemory(key: string, blob: Blob) {
  const existing = memory.get(key);
  if (existing) {
    memoryBytes -= existing.size;
    memory.delete(key);
  }
  const entry: CacheEntry = { blob, size: blob.size };
  memory.set(key, entry);
  memoryBytes += entry.size;
  evictMemory();
}

async function readIdb(key: string): Promise<StoredEntry | null> {
  try {
    const result = await runTransaction<StoredEntry | undefined>("readonly", (store) =>
      store.get(key),
    );
    return result ?? null;
  } catch {
    return null;
  }
}

async function writeIdb(key: string, entry: StoredEntry): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => store.put(entry, key));
  } catch {
    /* quota / private mode — memory cache still works */
  }
}

async function deleteIdb(key: string): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => store.delete(key));
  } catch {
    /* ignore */
  }
}

async function evictIdbIfNeeded(): Promise<void> {
  try {
    const all = await runTransaction<StoredEntry[]>("readonly", (store) => store.getAll());
    const keys = await runTransaction<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    if (all.length !== keys.length) return;

    const rows = all
      .map((entry, i) => ({ key: String(keys[i]), entry }))
      .sort((a, b) => a.entry.updatedAt - b.entry.updatedAt);

    let total = rows.reduce((sum, row) => sum + (row.entry.size || row.entry.blob.size), 0);

    while (
      rows.length > TTS_CACHE_MAX_ENTRIES ||
      (total > TTS_CACHE_MAX_BYTES && rows.length > 0)
    ) {
      const oldest = rows.shift();
      if (!oldest) break;
      total -= oldest.entry.size || oldest.entry.blob.size;
      await deleteIdb(oldest.key);
    }
  } catch {
    /* ignore */
  }
}

/** @internal test helper — clears in-memory state only. */
export function __resetTtsCacheForTests() {
  memory.clear();
  memoryBytes = 0;
}

/** @internal test helper */
export function __ttsCacheMemoryStats() {
  return { entries: memory.size, bytes: memoryBytes };
}

export async function getTtsAudio(voice: GrokTtsVoice, text: string): Promise<Blob | null> {
  const key = cacheKey(voice, text);
  const hit = memory.get(key);
  if (hit) {
    touchMemory(key, hit);
    return hit.blob;
  }

  const stored = await readIdb(key);
  if (!stored?.blob) return null;

  putMemory(key, stored.blob);
  // Refresh LRU timestamp in IDB without awaiting callers.
  void writeIdb(key, {
    ...stored,
    size: stored.blob.size,
    updatedAt: Date.now(),
  });
  return stored.blob;
}

export async function putTtsAudio(voice: GrokTtsVoice, text: string, blob: Blob): Promise<void> {
  const key = cacheKey(voice, text);
  putMemory(key, blob);
  await writeIdb(key, {
    voice,
    text,
    blob,
    size: blob.size,
    updatedAt: Date.now(),
  });
  void evictIdbIfNeeded();
}
