import { describe, expect, it } from "vitest";
import { analyzeProp, outcomeProbs } from "../shared/model/engine";
import { project } from "../shared/model/projection";
import { scoreConfidence, tierFor } from "../shared/model/confidence";
import type { LeagueContext, TeamProfile } from "../shared/model/league";
import type { AnalyzeInput } from "../shared/model/engine";
import { lineGroup, makeLogs } from "./helpers";

const pos = (o: Partial<TeamProfile["pos"]["RB"]> = {}) => ({ targets: 0, rec: 0, recYds: 0, recTD: 0, rushAtt: 0, rushYds: 0, rushTD: 0, ...o });
function profile(o: Partial<TeamProfile> = {}): TeamProfile {
  return {
    games: 4, points: 22, passAtt: 34, passCmp: 22, passYds: 220, passTD: 1.5, rushAtt: 26, rushYds: 110, rushTD: 0.8, sacks: 2.5,
    totalYards: 330, redZoneTrips: 3, redZoneTDs: 1.8, posCoverage: 1,
    pos: {
      QB: pos({ rushAtt: 4, rushYds: 20 }),
      RB: pos({ targets: 6, rec: 4.8, recYds: 38, rushAtt: 21, rushYds: 90, rushTD: 0.7, recTD: 0.1 }),
      WR: pos({ targets: 20, rec: 13, recYds: 150, recTD: 0.9 }),
      TE: pos({ targets: 7, rec: 5, recYds: 50, recTD: 0.3 }),
    },
    ...o,
  };
}
const league = (oppOverrides: Partial<TeamProfile> = {}): LeagueContext => ({
  season: 2026, gamesCounted: 64,
  league: profile(),
  offense: { AAA: profile() },
  defense: { OPP: profile(oppOverrides), EASY: profile({ rushYds: 150 }), HARD: profile({ rushYds: 70 }) },
});

const rbLogs = makeLogs(Array.from({ length: 6 }, (_, i) => ({ rushAtt: 18, rushYds: 80 + (i % 2 ? 6 : -6), targets: 3, rec: 2, recYds: 15 })));

function input(p: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    line: lineGroup({ market: "rush_yds", line: 68.5 }),
    player: { id: "p1", name: "Test Back", team: "AAA", position: "RB", headshot: null, injuryStatus: null },
    logs: rbLogs, season: 2026, week: 7, kickoff: "2026-10-20T17:00:00Z", opponent: "OPP", isHome: true,
    league: league(), teamSpread: -3, gameTotal: 45, weather: null, teammatesOut: [], now: "2026-10-18T12:00:00Z",
    ...p,
  };
}

describe("projection model", () => {
  it("builds rushing yards as carries x YPC x matchup and shows the steps", () => {
    const r = project({ market: "rush_yds", position: "RB", logs: rbLogs, season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    expect(r.ok).toBe(true);
    // 18 carries, player YPC 4.44 regressed toward league 4.23 with 108 carries of evidence
    expect(r.mean).toBeGreaterThan(74);
    expect(r.mean).toBeLessThan(80);
    expect(r.steps.map((s) => s.label)).toContain("Yards per carry");
    expect(r.volume.projected).toBeCloseTo(18, 1);
  });

  it("a soft run defense raises the projection, a tough one lowers it", () => {
    const base = { market: "rush_yds" as const, position: "RB", logs: rbLogs, season: 2026, isHome: true, teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] };
    const easy = project({ ...base, opponent: "EASY", league: league() });
    const hard = project({ ...base, opponent: "HARD", league: league() });
    const neutral = project({ ...base, opponent: "OPP", league: league() });
    expect(easy.mean).toBeGreaterThan(neutral.mean);
    expect(hard.mean).toBeLessThan(neutral.mean);
    // Capped: ratio 150/110 would be +36%, the model caps efficiency at +15%.
    expect(easy.mean / neutral.mean).toBeLessThanOrEqual(1.15 * 1.001);
  });

  it("uses different models per market (receptions depend on catch rate, not YPC)", () => {
    const wrLogs = makeLogs(Array.from({ length: 5 }, () => ({ targets: 8, rec: 6, recYds: 70, recLong: 22 })));
    const rec = project({ market: "receptions", position: "WR", logs: wrLogs, season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    expect(rec.steps.map((s) => s.label)).toContain("Catch rate");
    expect(rec.mean).toBeGreaterThan(5);
    expect(rec.mean).toBeLessThan(6.5);
    const yds = project({ market: "rec_yds", position: "WR", logs: wrLogs, season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    expect(yds.steps.map((s) => s.label)).toContain("Yards per target");
  });

  it("strong wind cuts passing yards outdoors but not indoors", () => {
    const qb = makeLogs(Array.from({ length: 5 }, () => ({ passAtt: 35, passCmp: 23, passYds: 250, passTD: 2 })));
    const base = { market: "pass_yds" as const, position: "QB", logs: qb, season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, teammatesOut: [] };
    const wx = (indoor: boolean) => ({ status: "live" as const, indoor, source: "t", fetchedAt: null, tempF: 50, windMph: 22, windGustMph: 30, precipProb: 10, conditions: "Windy" });
    const calm = project({ ...base, weather: null });
    const windy = project({ ...base, weather: wx(false) });
    const dome = project({ ...base, weather: wx(true) });
    expect(windy.mean).toBeLessThan(calm.mean * 0.93);
    expect(dome.mean).toBeCloseTo(calm.mean, 6);
  });

  it("treats incomplete position data as unavailable, not zero", () => {
    const wrLogs = makeLogs(Array.from({ length: 5 }, () => ({ targets: 8, rec: 6, recYds: 70 })));
    const L = league();
    L.defense.OPP = { ...L.defense.OPP, posCoverage: 0.4, pos: { ...L.defense.OPP.pos, WR: { ...L.defense.OPP.pos.WR, targets: 0, recYds: 0 } } };
    const r = project({ market: "rec_yds", position: "WR", logs: wrLogs, season: 2026, opponent: "OPP", isHome: true, league: L, teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    expect(r.missing).toContain("Opponent by-position data (incomplete rosters)");
    expect(r.factors.matchup).toBe(1);
  });

  it("reports missing data instead of inventing it", () => {
    const r = project({ market: "rush_yds", position: "RB", logs: rbLogs, season: 2026, opponent: "OPP", isHome: true, league: null, teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    expect(r.ok).toBe(true);
    expect(r.missing).toContain("Opponent defensive data");
    expect(r.factors.matchup).toBe(1);
    const none = project({ market: "rush_yds", position: "RB", logs: [], season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    expect(none.ok).toBe(false);
  });

  it("blends last season only when the current sample is small", () => {
    const cur = makeLogs([{ rushAtt: 20, rushYds: 100 }], { season: 2026, startWeek: 1 });
    const prior = makeLogs(Array.from({ length: 8 }, () => ({ rushAtt: 10, rushYds: 40 })), { season: 2025, startWeek: 18 });
    const r = project({ market: "rush_attempts", position: "RB", logs: [...cur, ...prior], season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, weather: null, teammatesOut: [] });
    // 1 current game: prior weight = 3/4 * 0.6 = 45% -> 20*0.55 + 10*0.45 = 15.5
    expect(r.volume.projected).toBeCloseTo(15.5, 1);
  });

  it("only adjusts for an injured teammate when with/without games exist", () => {
    const logs = makeLogs([
      { targets: 10, rec: 7, recYds: 80 }, { targets: 10, rec: 7, recYds: 80 },
      { targets: 5, rec: 3, recYds: 40 }, { targets: 5, rec: 3, recYds: 40 },
    ]);
    const withIds = logs.slice(2).map((l) => l.gameId); // teammate played in the 2 oldest games
    const tm = { id: "t9", name: "Star WR", position: "WR", status: "Out", share: 0.3, volume: "targets" as const, gameIds: withIds };
    const base = { market: "receptions" as const, position: "WR", logs, season: 2026, opponent: "OPP", isHome: true, league: league(), teamSpread: null, gameTotal: null, weather: null };
    const adj = project({ ...base, teammatesOut: [tm] });
    expect(adj.factors.injury).toBeGreaterThan(1);
    const noEvidence = project({ ...base, teammatesOut: [{ ...tm, gameIds: logs.map((l) => l.gameId) }] });
    expect(noEvidence.factors.injury).toBe(1);
    expect(noEvidence.risks.join(" ")).toMatch(/not enough games without him/);
  });
});

describe("outcome probabilities", () => {
  it("normal markets are symmetric at the projection", () => {
    const p = outcomeProbs("rec_yds", 60.5, 20, 60.5);
    expect(p.over).toBeCloseTo(0.5, 6);
  });
  it("integer lines carry push probability", () => {
    const p = outcomeProbs("receptions", 5, 2, 5);
    expect(p.push).toBeGreaterThan(0.1);
    expect(p.over + p.under + p.push).toBeCloseTo(1, 6);
  });
  it("pass TDs use Poisson, anytime TD uses 1 - e^-lambda", () => {
    const p = outcomeProbs("pass_tds", 1.8, null, 1.5);
    expect(p.over).toBeCloseTo(1 - Math.exp(-1.8) * 2.8, 6);
    expect(outcomeProbs("anytime_td", 0.5, null, 0.5).over).toBeCloseTo(1 - Math.exp(-0.5), 6);
  });
});

describe("analyzeProp: Over and Under", () => {
  it("recommends the OVER when projection is above the line", () => {
    const a = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5 }) }))!;
    expect(a.side).toBe("over");
    expect(a.projection).toBeGreaterThan(60.5);
    expect(a.edge).toBeCloseTo(a.projection - 60.5, 1);
    expect(a.edgePct).toBeCloseTo((a.projection - 60.5) / 60.5, 2);
    expect(a.modelProb).toBeGreaterThan(0.5);
    expect(a.sideLabel).toBe("OVER 60.5");
  });

  it("recommends the UNDER when projection is below the line", () => {
    const a = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 95.5 }) }))!;
    expect(a.side).toBe("under");
    expect(a.projection).toBeLessThan(95.5);
    expect(a.edge).toBeLessThan(0);
    expect(a.hitRates.season.hits).toBe(6); // every game was under 95.5
    expect(a.sideLabel).toBe("UNDER 95.5");
  });

  it("returns null (never a fake pick) when there is no data", () => {
    expect(analyzeProp(input({ logs: [] }))).toBeNull();
    expect(analyzeProp(input({ line: lineGroup({ line: null }) }))).toBeNull();
  });

  it("lowers confidence when odds, opponent data or the player's status are problems", () => {
    const full = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5 }) }))!;
    const noOdds = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5, overPrice: null, underPrice: null }) }))!;
    const noLeague = analyzeProp(input({ league: null, line: lineGroup({ market: "rush_yds", line: 60.5 }) }))!;
    const q = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5 }), player: { id: "p1", name: "Test Back", team: "AAA", position: "RB", headshot: null, injuryStatus: "Questionable" } }))!;
    expect(noOdds.confidence.total).toBeLessThan(full.confidence.total);
    expect(noOdds.risks.join(" ")).toMatch(/assumed at -110/);
    expect(noLeague.confidence.total).toBeLessThan(full.confidence.total);
    expect(q.confidence.total).toBeLessThan(full.confidence.total);
    expect(q.confidence.penalties.map((p) => p.label)).toContain("Player listed Questionable");
  });

  it("confidence components add up to the total", () => {
    const a = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5 }) }))!;
    const sum = a.confidence.components.reduce((s, c) => s + c.score, 0) - a.confidence.penalties.reduce((s, p) => s + p.points, 0);
    expect(Math.round(Math.max(0, Math.min(100, sum)))).toBe(a.confidence.total);
    expect(a.confidence.components.reduce((s, c) => s + c.max, 0)).toBe(100);
  });

  it("anytime TD compares model probability to the price", () => {
    const logs = makeLogs(Array.from({ length: 6 }, (_, i) => ({ rushAtt: 18, rushYds: 80, targets: 3, rushTD: i % 2 })));
    const a = analyzeProp(input({ logs, line: lineGroup({ market: "anytime_td", line: null, overPrice: 250, underPrice: null }) }))!;
    expect(a.unit).toBe("prob");
    expect(a.projection).toBeGreaterThan(0);
    expect(a.projection).toBeLessThan(1);
    expect(a.side).toBe("over"); // ~40%+ model vs 28.6% implied at +250
    expect(a.impliedProb).toBeCloseTo(100 / 350, 3);
  });

  it("applies context flags as explicit penalties", () => {
    const base = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5 }) }))!;
    const flagged = analyzeProp(input({ line: lineGroup({ market: "rush_yds", line: 60.5 }), contextFlags: [{ risk: "QB out", penalty: 6 }] }))!;
    expect(base.confidence.total - flagged.confidence.total).toBe(6);
    expect(flagged.risks).toContain("QB out");
  });
});

describe("confidence scoring", () => {
  const baseHR = { hits: 0, total: 0, pushes: 0, pct: null };
  const hr = { season: baseHR, last10: baseHR, last5: baseHR, last3: baseHR, home: baseHR, away: baseHR };
  it("weights differ by market", () => {
    const common = { side: "over" as const, modelProb: 0.6, impliedProb: 0.5, matchupFactor: 1, matchupAvailable: true, environmentFactor: 1, injuryFactor: 1, volumeSeries: [10, 10, 10], statSeries: [5, 5, 5], hitRates: hr, sample: { current: 6, prior: 0 }, injuryStatus: null, oddsAvailable: true, missing: [] };
    const td = scoreConfidence({ ...common, market: "anytime_td" });
    const ra = scoreConfidence({ ...common, market: "rush_attempts" });
    expect(td.components.find((c) => c.key === "edge")!.max).toBe(35);
    expect(ra.components.find((c) => c.key === "volume")!.max).toBe(30);
  });
  it("tiers never exceed evidence", () => {
    expect(tierFor(90, 0.01)).toBe("neutral");
    expect(tierFor(80, 0.08)).toBe("strong");
    expect(tierFor(65, 0.04)).toBe("moderate");
    expect(tierFor(80, -0.01)).toBe("negative");
  });
});
