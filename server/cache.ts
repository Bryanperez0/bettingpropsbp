import { getStore } from "@netlify/blobs";

/**
 * Persistent cache + storage on Netlify Blobs. When Blobs isn't available
 * (plain local Node, tests) it falls back to process memory so the app still
 * runs — data just won't survive a restart.
 */

interface Envelope<T> {
  savedAt: string;
  value: T;
}

type Store = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
};

const memory = new Map<string, unknown>();
const memoryStore: Store = {
  async get(k) { return memory.get(k) ?? null; },
  async set(k, v) { memory.set(k, v); },
  async del(k) { memory.delete(k); },
};

let store: Store | null = null;
let backend: "blobs" | "memory" = "memory";

function getBackend(): Store {
  if (store) return store;
  try {
    const s = getStore({ name: "nfl-analytics", consistency: "strong" });
    store = {
      async get(k) { return s.get(k, { type: "json" }); },
      async set(k, v) { await s.setJSON(k, v); },
      async del(k) { await s.delete(k); },
    };
    backend = "blobs";
  } catch {
    store = memoryStore;
    backend = "memory";
  }
  return store;
}

export function storageBackend() {
  getBackend();
  return backend;
}

/** Test hook: force the in-memory store. */
export function useMemoryStore() {
  store = memoryStore;
  backend = "memory";
  memory.clear();
}

export async function readJSON<T>(key: string): Promise<Envelope<T> | null> {
  try {
    const v = (await getBackend().get(key)) as Envelope<T> | null;
    return v && typeof v === "object" && "savedAt" in v ? v : null;
  } catch (e) {
    // Blobs misconfigured at runtime: degrade to memory for the rest of this invocation.
    if (backend === "blobs") { store = memoryStore; backend = "memory"; }
    console.warn("cache read failed", key, e);
    return null;
  }
}

export async function writeJSON<T>(key: string, value: T): Promise<string> {
  const savedAt = new Date().toISOString();
  try {
    await getBackend().set(key, { savedAt, value } satisfies Envelope<T>);
  } catch (e) {
    console.warn("cache write failed", key, e);
    memory.set(key, { savedAt, value });
  }
  return savedAt;
}

export interface CachedResult<T> {
  data: T;
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
}

/**
 * Return cached data if younger than ttlMs, otherwise call loader. If the
 * loader fails and an older copy exists, return it marked stale.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<CachedResult<T>> {
  const hit = await readJSON<T>(key);
  if (hit && Date.now() - Date.parse(hit.savedAt) < ttlMs) {
    return { data: hit.value, fetchedAt: hit.savedAt, fromCache: true, stale: false };
  }
  try {
    const data = await loader();
    const fetchedAt = await writeJSON(key, data);
    return { data, fetchedAt, fromCache: false, stale: false };
  } catch (e) {
    if (hit) return { data: hit.value, fetchedAt: hit.savedAt, fromCache: true, stale: true };
    throw e;
  }
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
