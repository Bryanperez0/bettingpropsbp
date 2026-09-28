import { beforeEach, describe, expect, it } from "vitest";
import { readJSON, storageHealth, useTestStore, writeJSON } from "../server/cache";

describe("storage resilience", () => {
  let data: Map<string, unknown>;
  let failNext = 0;
  beforeEach(() => {
    data = new Map();
    failNext = 0;
    useTestStore({
      async get(k) { if (failNext-- > 0) throw new Error("blob timeout"); return data.get(k) ?? null; },
      async set(k, v) { if (failNext-- > 0) throw new Error("blob timeout"); data.set(k, v); },
    });
  });

  it("retries a failed read and stays on persistent storage", async () => {
    await writeJSON("k", 1);
    failNext = 1;
    expect((await readJSON<number>("k"))?.value).toBe(1);
    expect(storageHealth().backend).toBe("blobs");
  });

  it("falls back to this instance's last copy when reads keep failing, without switching storage off", async () => {
    await writeJSON("k", 42);
    failNext = 2;
    expect((await readJSON<number>("k"))?.value).toBe(42);
    expect(storageHealth().backend).toBe("blobs");
    expect(storageHealth().readErrors).toBeGreaterThan(0);
    // Later reads use persistent storage again.
    data.set("k", { savedAt: new Date().toISOString(), value: 7 });
    expect((await readJSON<number>("k"))?.value).toBe(7);
  });

  it("retries a failed write", async () => {
    failNext = 1;
    await writeJSON("w", "x");
    expect(data.has("w")).toBe(true);
  });
});
