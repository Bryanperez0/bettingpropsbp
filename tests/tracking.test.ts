import { describe, expect, it } from "vitest";
import { gradePick, selectNewPicks, summarize } from "../server/services/tracking";
import type { AnalyzedProp, SeasonDataset, TrackedPick } from "../shared/types";
import { line0 } from "./helpers";

function prop(o: Partial<AnalyzedProp> & { conf?: number }): AnalyzedProp {
  return {
    id: "x", gameId: "G1", kickoff: "2026-10-04T17:00:00Z", week: 4, season: 2026, market: "rush_yds", marketLabel: "Rushing Yards",
    category: "rushing", player: { id: "p1", name: "Back One", team: "AAA", position: "RB", headshot: null, injuryStatus: null },
    opponent: "BBB", isHome: true, line: 60.5, lineSource: "sportsbook", side: "over", sideLabel: "OVER 60.5",
    odds: { over: -110, under: -110, side: -110 }, books: [], firstSeen: null, projection: 70, unit: "yards", edge: 9.5, edgePct: 0.157,
    modelProb: 0.62, impliedProb: 0.5, probEdge: 0.12,
    confidence: { total: o.conf ?? 75, components: [], penalties: [] }, tier: "strong",
    hitRates: {} as AnalyzedProp["hitRates"], history: [], averages: {} as AnalyzedProp["averages"], volume: {} as AnalyzedProp["volume"],
    matchup: [], steps: [], reasons: [], risks: [], explanation: "", dataQuality: { score: 1, missing: [] }, generatedAt: "", ...o,
  };
}

const NOW = "2026-10-01T12:00:00Z";

describe("recommendation ledger", () => {
  it("stores a pick once and never overwrites it when the line moves", () => {
    const first = selectNewPicks([], [prop({ line: 60.5 })], NOW);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ line: 60.5, odds: -110, projection: 70, confidence: 75, createdAt: NOW, result: "pending" });
    const again = selectNewPicks(first, [prop({ line: 66.5, confidence: { total: 90, components: [], penalties: [] } })], "2026-10-02T12:00:00Z");
    expect(again).toHaveLength(0); // same player/market/side already recorded
  });

  it("skips demo lines, low confidence, negative edges and started games", () => {
    const picks = selectNewPicks([], [
      prop({ lineSource: "demo" }),
      prop({ conf: 40, gameId: "G2" }),
      prop({ probEdge: -0.02, gameId: "G3" }),
      prop({ kickoff: "2026-09-30T17:00:00Z", gameId: "G4" }),
    ], NOW);
    expect(picks).toHaveLength(0);
  });

  const dataset = (rushYds: number | null): SeasonDataset => ({
    season: 2026, builtAt: NOW,
    games: [{
      gameId: "G1", season: 2026, seasonType: 2, week: 4, date: "2026-10-04T17:00Z",
      home: { teamId: "1", abbr: "AAA", score: 20, stats: {} as never }, away: { teamId: "2", abbr: "BBB", score: 17, stats: {} as never },
      players: rushYds === null ? [] : [{ id: "p1", name: "Back One", team: "AAA", stats: { ...line0(), rushYds } }],
    }],
  });

  it("grades wins, losses, pushes and DNPs from the final box score", () => {
    const [p] = selectNewPicks([], [prop({})], NOW);
    expect(gradePick(p, [dataset(75)], NOW)).toMatchObject({ result: "win", actual: 75 });
    expect(gradePick(p, [dataset(40)], NOW)).toMatchObject({ result: "loss", actual: 40 });
    expect(gradePick({ ...p, line: 60 }, [dataset(60)], NOW)).toMatchObject({ result: "push" });
    expect(gradePick(p, [dataset(null)], NOW)).toMatchObject({ result: "void" });
    const under = { ...p, side: "under" as const };
    expect(gradePick(under, [dataset(40)], NOW).result).toBe("win");
    expect(gradePick(p, [{ season: 2026, builtAt: NOW, games: [] }], NOW).result).toBe("pending");
  });

  it("summarizes by confidence range, category, position and week", () => {
    const mk = (conf: number, result: TrackedPick["result"], i: number): TrackedPick => ({
      ...selectNewPicks([], [prop({ conf, gameId: `G${i}` })], NOW)[0], result,
    });
    const ledger = [mk(92, "win", 1), mk(95, "win", 2), mk(72, "loss", 3), mk(71, "win", 4), mk(55, "pending", 5)];
    const s = summarize(ledger);
    expect(s.total).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.hitRate).toBeCloseTo(0.75, 6);
    const b90 = s.byConfidence.find((b) => b.key === "90-100")!;
    expect(b90).toMatchObject({ wins: 2, losses: 0, hitRate: 1 });
    const b70 = s.byConfidence.find((b) => b.key === "70-79")!;
    expect(b70.hitRate).toBeCloseTo(0.5, 6);
    expect(s.byCategory[0].label).toBe("Rushing Yards");
    expect(s.byWeek[0].label).toBe("2026 Wk 4");
    expect(b90.units).toBeCloseTo(2 * (100 / 110), 2);
  });
});
