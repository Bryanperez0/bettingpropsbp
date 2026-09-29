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
        { key: "player_anytime_td", outcomes: [o("Yes", "D'Andre Swift", 140), o("Yes", "Chicago Bears D/ST", 900), o("Yes", "Philadelphia Eagles Defense", 800)] },
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

// Synthetic SportsGameOdds event in its documented v2 shape (TEST DATA ONLY).
const sgoOdd = (stat: string, player: string, bet: string, side: string, books: Record<string, { odds: string; overUnder?: string; openOdds?: string; openOverUnder?: string }>) => ({
  oddID: `${stat}-${player}-game-${bet}-${side}`, statID: stat, statEntityID: player, playerID: player, periodID: "game", betTypeID: bet, sideID: side,
  byBookmaker: Object.fromEntries(Object.entries(books).map(([k, v]) => [k, { ...v, available: true, lastUpdatedAt: "2026-09-28T18:00:00Z" }])),
});
const SGO_EVENT = {
  eventID: "sgo-evt-1", leagueID: "NFL",
  status: { startsAt: "2026-09-29T00:15:00.000Z", started: false },
  teams: {
    home: { teamID: "CHICAGO_BEARS_NFL", names: { long: "Chicago Bears", medium: "Bears", short: "CHI" } },
    away: { teamID: "PHILADELPHIA_EAGLES_NFL", names: { short: "PHI" } },
  },
  players: {
    DEVONTA_SMITH_1_NFL: { playerID: "DEVONTA_SMITH_1_NFL", name: "DeVonta Smith", teamID: "PHILADELPHIA_EAGLES_NFL" },
    DANDRE_SWIFT_1_NFL: { playerID: "DANDRE_SWIFT_1_NFL", firstName: "D'Andre", lastName: "Swift" },
    JALEN_HURTS_1_NFL: { playerID: "JALEN_HURTS_1_NFL", name: "Jalen Hurts" },
  },
  odds: Object.fromEntries([
    sgoOdd("receiving_yards", "DEVONTA_SMITH_1_NFL", "ou", "over", { draftkings: { odds: "-110", overUnder: "58.5", openOdds: "-112", openOverUnder: "56.5" }, fanduel: { odds: "-115", overUnder: "58.5" }, prizepicks: { odds: "-119", overUnder: "64.5" } }),
    sgoOdd("receiving_yards", "DEVONTA_SMITH_1_NFL", "ou", "under", { draftkings: { odds: "-110", overUnder: "58.5", openOdds: "-108", openOverUnder: "56.5" }, fanduel: { odds: "-105", overUnder: "58.5" }, prizepicks: { odds: "-119", overUnder: "64.5" } }),
    sgoOdd("rushing_attempts", "DANDRE_SWIFT_1_NFL", "ou", "over", { betmgm: { odds: "+100", overUnder: "13.5" } }),
    sgoOdd("rushing_attempts", "DANDRE_SWIFT_1_NFL", "ou", "under", { betmgm: { odds: "-120", overUnder: "13.5" } }),
    sgoOdd("passing_completions", "JALEN_HURTS_1_NFL", "ou", "over", { caesars: { odds: "-110", overUnder: "19.5" } }),
    sgoOdd("passing_completions", "JALEN_HURTS_1_NFL", "ou", "under", { caesars: { odds: "-110", overUnder: "19.5" } }),
    sgoOdd("touchdowns", "DANDRE_SWIFT_1_NFL", "yn", "yes", { draftkings: { odds: "+140" }, kalshi: { odds: "+200" } }),
    sgoOdd("touchdowns", "DANDRE_SWIFT_1_NFL", "yn", "no", { draftkings: { odds: "-180" } }),
    sgoOdd("points", "home", "ml", "home", { draftkings: { odds: "-150" } }),
  ].map((o) => [o.oddID, o])),
};
const sgo = { fail: false, calls: 0, closeCalls: 0 };

function mockFetch(url: string, init?: RequestInit): Response {
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
  if (u.host === "api.sportsgameodds.com") {
    expect(u.searchParams.get("apiKey")).toBeNull(); // key only in the header
    expect(new Headers(init?.headers).get("x-api-key")).toBe("sgo-key");
    if (p === "/v2/events" && u.searchParams.get("eventIDs")) {
      // Finished game: the books' official closing prices. Every prop closes 2 points higher.
      sgo.closeCalls++;
      expect(u.searchParams.get("eventIDs")).toBe("sgo-evt-1");
      expect(u.searchParams.get("includeOpenCloseOdds")).toBe("true");
      const odds = Object.fromEntries(Object.entries(SGO_EVENT.odds).map(([k, o]) => [k, {
        ...o,
        byBookmaker: Object.fromEntries(Object.entries(o.byBookmaker).map(([b, v]) => [b, {
          ...v, odds: "+999", available: false, closeOdds: v.odds,
          ...((v as { overUnder?: string }).overUnder ? { overUnder: "1.5", closeOverUnder: String(Number((v as { overUnder: string }).overUnder) + 2) } : {}),
        }])),
      }]));
      return ok({ success: true, data: [{ ...SGO_EVENT, odds, status: { ...SGO_EVENT.status, started: true, finalized: true } }], nextCursor: null });
    }
    if (p === "/v2/events") {
      sgo.calls++;
      if (sgo.fail) return new Response("err", { status: 500 });
      expect(u.searchParams.get("leagueID")).toBe("NFL");
      expect(u.searchParams.get("oddID")).toContain("receiving_longestReception-PLAYER_ID-game-ou-over");
      return ok({ success: true, data: [SGO_EVENT], nextCursor: null });
    }
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
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => mockFetch(String(input), init)));
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
  delete process.env.SPORTSGAMEODDS_API_KEY;
  delete process.env.SGO_MONTHLY_LIMIT;
  sgo.fail = false;
  sgo.calls = 0;
  sgo.closeCalls = 0;
});

describe("analysis pipeline", () => {
  it("without an API key: no invented lines, clear warning", async () => {
    delete process.env.ODDS_API_KEY;
    const s = await buildAnalysis(20_000);
    expect(s.props).toHaveLength(0);
    expect(s.sources.find((x) => x.key === "props")!.status).toBe("unavailable");
    expect(s.warnings.join(" ")).toMatch(/no odds API key is configured/);
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
    expect(s.stats.unmatched).toBe(1); // "Not A Real Player" (team-defense bets are not counted)
    expect(s.stats.teamBets).toBe(2);
    expect(s.warnings.join(" ")).not.toMatch(/D\/ST|Defense/);
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

  it("keeps the frozen pregame props after kickoff and serves live stats", async () => {
    process.env.ODDS_API_KEY = "test-key";
    for (let i = 0; i < 3; i++) await buildAnalysis(20_000);
    const before = (await readJSON<AnalysisSnapshot>("analysis/current"))!.value;
    const picksBefore = (await readLedger()).length;
    const swiftBefore = before.props.find((p) => p.player.name === "D'Andre Swift" && p.market === "rush_yds")!;

    // Kickoff: ESPN now reports PHI @ CHI in progress.
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const res = await realFetch(input);
      if (!/\/scoreboard/.test(String(input)) || /week=/.test(String(input))) return res;
      const body = await res.json();
      for (const e of body.events ?? []) if (e.id === "401872963") { e.status.type.state = "in"; e.status.type.shortDetail = "Q2 5:10"; }
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    await writeJSON("espn/scoreboard/current", null as never); // force a fresh schedule read
    await writeJSON("analysis/last-attempt", null as never);
    const after = await buildAnalysis(20_000);
    vi.stubGlobal("fetch", realFetch);

    const swift = after.props.find((p) => p.id === swiftBefore.id)!;
    expect(swift).toBeDefined();
    expect(swift.frozen?.state).toBe("in");
    expect(swift.confidence.total).toBe(swiftBefore.confidence.total); // frozen, not re-scored
    const top = topProps(after.props, 20, Date.parse("2026-09-28T19:00:00Z"));
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((p) => p.frozen)).toBe(true);
    expect(await readLedger()).toHaveLength(picksBefore); // frozen props never add picks
  });

  it("reads live box scores for started games", async () => {
    const { getLiveGames } = await import("../server/services/live");
    const s = (await buildAnalysis(20_000));
    const finished = s.games.find((g) => g.id === "401872948")!; // ATL @ GB, final
    const live = await getLiveGames([finished]);
    expect(live["401872948"].state).toBe("post");
    expect(live["401872948"].players["4430807"].rushYds).toBe(194); // Bijan Robinson's real line
  });

  it("rebuilds a started game's props from cached pregame lines when no frozen copy exists", async () => {
    process.env.ODDS_API_KEY = "test-key";
    const first = await buildAnalysis(20_000); // incomplete build: odds get cached, nothing frozen
    expect(first.quality.datasetPending).toBeGreaterThan(0);
    expect((await readJSON("frozen/401872963"))?.value ?? null).toBeNull();

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const res = await realFetch(input);
      if (!/\/scoreboard/.test(String(input)) || /week=/.test(String(input))) return res;
      const body = await res.json();
      for (const e of body.events ?? []) if (e.id === "401872963") e.status.type.state = "in";
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    await writeJSON("espn/scoreboard/current", null as never);
    const after = await buildAnalysis(20_000);
    vi.stubGlobal("fetch", realFetch);
    const swift = after.props.find((p) => p.player.name === "D'Andre Swift" && p.market === "rush_yds");
    expect(swift?.frozen?.state).toBe("in");
    expect(swift?.line).toBe(55.5);
  });
  it("uses SportsGameOdds as the main source: all prop types, sportsbooks only, one request per refresh", async () => {
    process.env.SPORTSGAMEODDS_API_KEY = "sgo-key";
    process.env.ODDS_API_KEY = "test-key";
    for (let i = 0; i < 3; i++) await buildAnalysis(20_000);
    const s = await buildAnalysis(20_000);
    const meta = s.sources.find((x) => x.key === "props")!;
    expect(meta.provider).toBe("SportsGameOdds");
    expect(sgo.calls).toBe(1); // later builds read the cached slate
    const names = s.props.map((p) => `${p.player.name}:${p.market}`);
    expect(names).toContain("DeVonta Smith:rec_yds");
    expect(names).toContain("D'Andre Swift:rush_attempts");
    expect(names).toContain("Jalen Hurts:pass_completions");
    const smith = s.props.find((p) => p.player.name === "DeVonta Smith")!;
    expect(smith.line).toBe(58.5); // PrizePicks' 64.5 is not a sportsbook line
    expect(smith.books.map((b) => b.bookTitle)).toEqual(["DraftKings", "FanDuel"]);
    expect(smith.odds.over).toBe(-112); // median of -110 and -115, rounded
    const td = s.props.find((p) => p.player.name === "D'Andre Swift" && p.market === "anytime_td")!;
    expect(td.odds.over).toBe(140); // Kalshi left out
    expect(td.side).toBe("over");
    expect((await readJSON<number>(`sgo/usage/2026-09`))!.value).toBe(1);
    expect(JSON.stringify(s)).not.toContain("sgo-key");
  });

  it("falls back to The Odds API when SportsGameOdds fails", async () => {
    process.env.SPORTSGAMEODDS_API_KEY = "sgo-key";
    process.env.ODDS_API_KEY = "test-key";
    sgo.fail = true;
    const s = await buildAnalysis(20_000);
    expect(s.sources.find((x) => x.key === "props")!.provider).toBe("The Odds API (backup)");
    expect(s.props.some((p) => p.player.name === "Jalen Hurts" && p.market === "pass_yds")).toBe(true);
    expect(s.warnings.join(" ")).toMatch(/SportsGameOdds unavailable/);
  });

  it("stops calling SportsGameOdds at the monthly limit", async () => {
    process.env.SPORTSGAMEODDS_API_KEY = "sgo-key";
    process.env.ODDS_API_KEY = "test-key";
    process.env.SGO_MONTHLY_LIMIT = "5";
    await writeJSON("sgo/usage/2026-09", 5);
    const s = await buildAnalysis(20_000);
    expect(sgo.calls).toBe(0);
    expect(s.sources.find((x) => x.key === "props")!.provider).toBe("The Odds API (backup)");
    expect(s.warnings.join(" ")).toMatch(/monthly limit/);
  });
  it("shops books, shows sportsbook opening lines, and records closing line value", async () => {
    process.env.SPORTSGAMEODDS_API_KEY = "sgo-key";
    for (let i = 0; i < 3; i++) await buildAnalysis(20_000);
    const pre = await buildAnalysis(20_000);
    const smith = pre.props.find((p) => p.player.name === "DeVonta Smith")!;
    expect(smith.opening).toEqual({ line: 56.5, overPrice: -112, underPrice: -108, books: 1 });
    expect(smith.shop!.map((o) => o.bookTitle).sort()).toEqual(["DraftKings", "FanDuel"]);
    expect(smith.shop![0].ev).toBeGreaterThanOrEqual(smith.shop![1].ev);

    const gamePicks = (await readLedger()).filter((p) => p.gameId === "401872963");
    expect(gamePicks.length).toBeGreaterThan(0);
    expect(gamePicks.every((p) => !p.close)).toBe(true);

    const setState = (state: string) => {
      const realFetch = globalThis.fetch;
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
        const res = await realFetch(input, init);
        if (!/\/scoreboard/.test(String(input)) || /week=/.test(String(input))) return res;
        const body = await res.json();
        for (const e of body.events ?? []) if (e.id === "401872963") e.status.type.state = state;
        return new Response(JSON.stringify(body), { status: 200 });
      }));
      return realFetch;
    };

    // Kickoff: every pick gets the last pregame line.
    let realFetch = setState("in");
    await writeJSON("espn/scoreboard/current", null as never);
    await writeJSON("analysis/last-attempt", null as never);
    await buildAnalysis(20_000);
    vi.stubGlobal("fetch", realFetch);
    let picks = (await readLedger()).filter((p) => p.gameId === "401872963");
    expect(picks.every((p) => p.close?.source === "last-seen")).toBe(true);
    expect(picks.every((p) => p.close!.lineMove === 0)).toBe(true);
    expect(sgo.closeCalls).toBe(0);

    // Final: replaced by the sportsbooks' official close, fetched once.
    realFetch = setState("post");
    await writeJSON("espn/scoreboard/current", null as never);
    await writeJSON("analysis/last-attempt", null as never);
    await buildAnalysis(20_000);
    await buildAnalysis(20_000);
    vi.stubGlobal("fetch", realFetch);
    expect(sgo.closeCalls).toBe(1);
    picks = (await readLedger()).filter((p) => p.gameId === "401872963");
    const official = picks.filter((p) => p.close?.source === "sportsbook-close");
    expect(official.length).toBeGreaterThan(0);
    for (const p of official) {
      if (p.market === "anytime_td") expect(p.close!.lineMove).toBe(0);
      else expect(p.close!.lineMove).toBe(p.side === "over" ? 2 : -2);
      expect(p.close!.beat).toBe(p.market === "anytime_td" ? p.close!.beat : p.side === "over");
    }
  });
});
