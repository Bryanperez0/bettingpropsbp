import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchScoreboard, resetEspnHostPreference } from "../server/providers/espn";

const sb = JSON.parse(readFileSync(join(__dirname, "fixtures", "scoreboard-week3.json"), "utf8"));
afterEach(() => { vi.unstubAllGlobals(); resetEspnHostPreference(); });

describe("ESPN host fallback", () => {
  it("uses the backup host when the primary refuses with 403, sending browser headers", async () => {
    const calls: { host: string; ua: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      const u = new URL(input);
      calls.push({ host: u.host, ua: String((init?.headers as Record<string, string>)["user-agent"]) });
      if (u.host === "site.api.espn.com") return new Response("Forbidden", { status: 403 });
      return new Response(JSON.stringify(sb), { status: 200 });
    }));
    const r = await fetchScoreboard();
    expect(r.games.length).toBe(16);
    expect(calls.map((c) => c.host)).toEqual(["site.api.espn.com", "site.web.api.espn.com"]);
    expect(calls[0].ua).toMatch(/^Mozilla\/5\.0/);
    // Next request goes straight to the host that worked.
    await fetchScoreboard();
    expect(calls.slice(2).map((c) => c.host)).toEqual(["site.web.api.espn.com"]);
  });

  it("reports which provider refused when every host fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    await expect(fetchScoreboard()).rejects.toThrow(/site\.api\.espn\.com returned HTTP 403/);
  });
});
