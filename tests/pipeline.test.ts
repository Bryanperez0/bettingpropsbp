/**
 * End-to-end test of the server pipeline using REAL ESPN response fixtures.
 * External calls are intercepted. The Odds API and Open-Meteo responses
 * below are synthetic TEST DATA ONLY (they never ship in the app).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useMemoryStore } from "../server/cache";
import { buildAnalysis, topProps } from "../server/services/analysis";
import { readLedger } from "../server/services/tracking";
import { readHistory } from "../server/services/history";
import { readJSON, writeJSON } from "../server/cache";
import type { AnalysisSnapshot } from "../server/services/analysis";

const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", f), "utf8"));
const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const notFound = () => new Response("not found", { status: 404 });

const TEST_ODDS_EVENT = { id: "evt-test", home_team: "Chicago Bears", away_team: "Philadelphia Eagles", commence_time: "2026-09-29T00:15:00Z" };
const o = (name: string, description: string, price: number, point?: number) => ({ name, description, price, point });
const TEST_ODDS = {
  ...TEST_ODDS_EVENT,
  bookmakers: [
    {
      key: "bookA", title: "Book A", markets: [
        { key: "player_rush_yds", outcomes: [o("Over", "D'Andre Swift", -115, 55.5), o("Under", "D'Andre Swift", -105, 55.5), o("Over", "Saquon Barkley", -110, 70.5), o("Under", "Saquon Barkley", -110, 70.5)] },
        { key: "player_reception_yds", outcomes: [o("Over", "DeVonta Smith", -110, 60.5), o("Under", "DeVonta Smith", -110, 60.5), o("Over", "Rome Odunze", -110, 40.5), o("Under", "Rome Odunze", -110, 40.5)] },
        { key: "player_pass_yds", outcomes: [o("Over", "Caleb Williams", -110, 210.5), o("Under", "Caleb Williams", -110, 210.5), o("Over", "Jalen Hurts", -110, 215.5), o("Under", "Jalen Hurts", -110, 215.5)] },
        { key: "player_receptions", outcomes: [o("Over", "Not A Real Player", -110, 3.5), o("Under", "Not A Real Player", -110, 3.5)] },
        { key: "player_anytime_td", outcomes: [o("Yes", "D'Andre Swift", 140)] },
      ],
    },
    {
      key: "bookB", title: "Book B", markets: [
        { key: "player_rush_yds", outcomes: [o("Over", "D'Andre Swift", -110, 55.5), o("Under", "D'Andre Swift", -110, 55.5)] },
        { key: "player_reception_yds", outcomes: [o("Over", "DeVonta Smith", -120, 61.5), o("Under", "DeVonta Smith", 100, 61.5)] },
      ],
    },
  ],
};

function mockFetch(url: string): Response {
  const u = new URL(url);
  const p = u.pathname;
  if (u.host === "site.api.espn.com") {
    if (p.endsWith("/scoreboard")) {
      const week = u.searchParams.get("week");
      const year = u.searchParams.get("dates");
      if (year && year !== "2026") return ok({ events: [] });
      return ok(fx(`scoreboard-week${week ?? "3"}.json`));
    }
    if (p.endsWith("/summary")) {
      const f = `summary-${u.searchParams.get("event")}.json`;
      return existsSync(join(__dirname, "fixtures", f)) ? ok(fx(f)) : notFound();
    }
    if (p.endsWith("/teams")) return ok(fx("teams.json"));
    const roster = p.match(/teams\/(\d+)\/roster/);
    if (roster) {
      const f = `roster-${roster[1]}.json`;
      return existsSync(join(__dirname, "fixtures", f)) ? ok(fx(f)) : notFound();
    }
    if (p.endsWith("/injuries")) return notFound(); // exercise the summary fallback
  }
  if (u.host === "api.the-odds-api.com") {
    expect(u.searchParams.get("apiKey")).toBe("test-key");
    if (p.endsWith("/events")) return ok([TEST_ODDS_EVENT]);
    if (p.includes("/events/evt-test/odds")) return ok(TEST_ODDS, { "x-requests-remaining": "480", "x-requests-used": "20", "x-requests-last": "5" });
  }
  if (u.host === "geocoding-api.open-meteo.com") return ok({ results: [{ latitude: 41.86, longitude: -87.62, name: "Chicago", admin1: "Illinois", country_code: "US" }] });
  if (u.host === "api.open-meteo.com") {
    const d = u.searchParams.get("start_date");
    return ok({ hourly: { time: Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`), temperature_2m: Array(24).fill(61), precipitation_probability: Array(24).fill(10), wind_speed_10m: Array(24).fill(9), wind_gusts_10m: Array(24).fill(15), weather_code: Array(24).fill(1) } });
  }
  return notFound();
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T19:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => mockFetch(String(input))));
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  useMemoryStore();
  process.env.INCLUDE_PRIOR_SEASON = "false";
  process.env.ODDS_API_BOOKMAKERS = "";
  delete process.env.DEMO_PROP_LINES;
});

describe("analysis pipeline", () => {
  it("without an API key: no invented lines, clear warning", async () => {
    delete process.env.ODDS_API_KEY;
    const s = await buildAnalysis(20_000);
    expect(s.props).toHaveLength(0);
    expect(s.sources.find((x) => x.key === "props")!.status).toBe("unavailable");
    expect(s.warnings.join(" ")).toMatch(/ODDS_API_KEY is not configured/);
    expect(s.games.length).toBe(16);
  });

  it("with demo mode: lines are labeled mock and never tracked", async () => {
    delete process.env.ODDS_API_KEY;
    process.env.DEMO_PROP_LINES = "true";
    const s = await buildAnalysis(20_000);
    expect(s.sources.find((x) => x.key === "props")!.status).toBe("mock");
    expect(s.props.length).toBeGreaterThan(0);
    expect(s.props.every((p) => p.lineSource === "demo")).toBe(true);
    expect(s.props.every((p) => p.risks.some((r) => r.includes("DEMO")))).toBe(true);
    expect(await readLedger()).toHaveLength(0);
  });

  it("with sportsbook lines: matches players, excludes OUT players, analyzes and tracks", async () => {
    process.env.ODDS_API_KEY = "test-key";
    // Fixture set lacks most box scores: they count as loading until they fail 3 times.
    const first = await buildAnalysis(20_000);
    expect(first.quality.datasetPending).toBeGreaterThan(0);
    expect(await readLedger()).toHaveLength(0); // incomplete builds are never tracked
    await buildAnalysis(20_000);
    const s = await buildAnalysis(20_000);
    expect(s.quality).toEqual({ datasetPending: 0, rosterTeamsMissing: 0, injuriesOk: true });
    const names = s.props.map((p) => `${p.player.name}:${p.market}`);
    expect(names).toContain("D'Andre Swift:rush_yds");
    expect(names).toContain("DeVonta Smith:rec_yds");
    expect(names).toContain("Jalen Hurts:pass_yds");
    expect(names).not.toContain("Caleb Williams:pass_yds"); // listed Out in the real injury report
    expect(s.stats.excludedInjured).toBe(1);
    expect(s.stats.unmatched).toBe(1); // "Not A Real Player"
    expect(s.warnings.join(" ")).toContain("Not A Real Player");

    const smith = s.props.find((p) => p.player.name === "DeVonta Smith")!;
    expect(smith.line).toBe(60.5); // consensus: most common line across books... tie -> nearest median
    expect(smith.books).toHaveLength(2);
    expect(smith.firstSeen).not.toBeNull();
    expect(smith.history.map((h) => h.value)).toEqual([117, 53]);
    expect(smith.hitRates.season.total).toBe(2);

    const swift = s.props.find((p) => p.player.name === "D'Andre Swift" && p.market === "rush_yds")!;
    expect(swift.risks.join(" ")).toMatch(/Primary QB Caleb Williams is Out/);
    expect(swift.confidence.penalties.map((x) => x.label).join(" ")).toMatch(/QB change not modeled/);
    expect(swift.confidence.penalties.map((x) => x.label).join(" ")).toMatch(/Small sample/);

    const game = s.games.find((g) => g.id === "401872963")!;
    expect(game.weather).toMatchObject({ source: "Open-Meteo", windMph: 9, indoor: false });

    const json = JSON.stringify(s);
    expect(json).not.toContain("test-key");

    const top = topProps(s.props, 20);
    expect(top.every((p) => p.probEdge > 0 && p.tier !== "negative")).toBe(true);
    const ledger = await readLedger();
    expect(ledger.every((p) => p.confidence >= 50)).toBe(true);
    expect(ledger.length).toBe(s.props.filter((p) => p.confidence.total >= 50 && p.probEdge > 0).length);
  });

  it("records score history only when something moves, with the reason", async () => {
    process.env.ODDS_API_KEY = "test-key";
    for (let i = 0; i < 3; i++) await buildAnalysis(20_000);
    const s = await buildAnalysis(20_000);
    const swift = s.props.find((p) => p.player.name === "D'Andre Swift" && p.market === "rush_yds")!;
    const hist = await readHistory(swift.gameId, swift.id);
    expect(hist).toHaveLength(1); // unchanged rebuilds add nothing
    expect(hist[0].changes).toEqual(["First calculation"]);
    expect(hist[0].confidence).toBe(swift.confidence.total);
  });

  it("never replaces a complete analysis with an incomplete one", async () => {
    process.env.ODDS_API_KEY = "test-key";
    for (let i = 0; i < 3; i++) await buildAnalysis(20_000);
    const good = (await readJSON<AnalysisSnapshot>("analysis/current"))!.value;
    // Next refresh: ESPN rosters fail for everyone and the old roster cache is gone.
    await writeJSON("espn/rosters", null as never);
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => (/roster|\/teams$/.test(String(input)) ? new Response("no", { status: 503 }) : realFetch(input))));
    process.env.ODDS_API_KEY = "test-key";
    const kept = await buildAnalysis(20_000).catch(() => null);
    vi.stubGlobal("fetch", realFetch);
    const saved = (await readJSON<AnalysisSnapshot>("analysis/current"))!.value;
    expect(saved.generatedAt).toBe(good.generatedAt);
    if (kept) expect(kept.props.length).toBe(good.props.length);
  });
});
