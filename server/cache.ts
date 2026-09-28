import { getStore } from "@netlify/blobs";

/**
 * Persistent cache + storage on Netlify Blobs.
 *
 * Resilience rules:
 * - A failed read or write is retried once. It never switches Blobs off for
 *   the rest of the instance (a single hiccup used to leave a warm function
 *   running without storage, which made scores differ between instances).
 * - Every value read or written is mirrored in process memory, so a failed
 *   read can fall back to the last value this instance saw.
 * - When Blobs isn't available at all (plain local Node, tests) the memory
 *   store is used and the app reports "memory" storage.
 */

interface Envelope<T> {
  savedAt: string;
  value: T;
}

type Store = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

const memory = new Map<string, unknown>();
const memoryStore: Store = {
  async get(k) { return memory.get(k) ?? null; },
  async set(k, v) { memory.set(k, v); },
};

let store: Store | null = null;
let backend: "blobs" | "memory" = "memory";
const health = { readErrors: 0, writeErrors: 0, lastError: null as string | null, lastErrorAt: null as string | null };

function note(e: unknown) {
  health.lastError = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300);
  health.lastErrorAt = new Date().toISOString();
}

function getBackend(): Store {
  if (store) return store;
  try {
    const s = getStore({ name: "nfl-analytics", consistency: "strong" });
    store = {
      async get(k) { return s.get(k, { type: "json" }); },
      async set(k, v) { await s.setJSON(k, v); },
    };
    backend = "blobs";
  } catch (e) {
    store = memoryStore;
    backend = "memory";
    note(e);
  }
  return store;
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 250));
    return fn();
  }
}

export function storageBackend() {
  getBackend();
  return backend;
}

export function storageHealth() {
  return { backend: storageBackend(), ...health };
}

/** Test hook: force the in-memory store. */
export function useMemoryStore() {
  store = memoryStore;
  backend = "memory";
  memory.clear();
}

/** Test hook: use a custom backend (e.g. one that fails on purpose). */
export function useTestStore(s: Store) {
  store = s;
  backend = "blobs";
  memory.clear();
}

const isEnvelope = <T>(v: unknown): v is Envelope<T> => !!v && typeof v === "object" && "savedAt" in (v as object);

export async function readJSON<T>(key: string): Promise<Envelope<T> | null> {
  const s = getBackend();
  if (s === memoryStore) {
    const v = memory.get(key);
    return isEnvelope<T>(v) ? v : null;
  }
  try {
    const v = await retry(() => s.get(key));
    if (isEnvelope<T>(v)) {
      memory.set(key, v);
      return v;
    }
    return null;
  } catch (e) {
    health.readErrors++;
    note(e);
    console.warn("blobs read failed; using this instance's last copy", key, e);
    const v = memory.get(key);
    return isEnvelope<T>(v) ? v : null;
  }
}

export async function writeJSON<T>(key: string, value: T): Promise<string> {
  const savedAt = new Date().toISOString();
  const env: Envelope<T> = { savedAt, value };
  memory.set(key, env);
  const s = getBackend();
  if (s === memoryStore) return savedAt;
  try {
    await retry(() => s.set(key, env));
  } catch (e) {
    health.writeErrors++;
    note(e);
    console.warn("blobs write failed", key, e);
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
