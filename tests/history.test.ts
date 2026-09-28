import { describe, expect, it } from "vitest";
import { describeChanges } from "../server/services/history";
import type { ScoreHistoryEntry } from "../shared/types";

const base: ScoreHistoryEntry = {
  at: "2026-09-28T20:00:00Z", confidence: 75, tier: "strong", side: "under", line: 2.5, odds: -180, projection: 1.6, modelProb: 0.868,
  components: { "Model edge": 30, Matchup: 8.9 }, penalties: { "Small sample (2 games)": 10 }, changes: [],
};

describe("score change explanations", () => {
  it("names each input that moved", () => {
    const cur: ScoreHistoryEntry = {
      ...base, confidence: 69, odds: -165, components: { "Model edge": 30, Matchup: 5.3 },
      penalties: { "Small sample (2 games)": 10, "Opponent data unavailable": 4 },
    };
    expect(describeChanges(base, cur)).toEqual([
      "Odds -180 → -165",
      "Matchup 8.9 → 5.3",
      "Penalty added: Opponent data unavailable (−4)",
    ]);
  });

  it("reports removed penalties and lean flips", () => {
    const cur: ScoreHistoryEntry = { ...base, side: "over", penalties: {} };
    expect(describeChanges(base, cur)).toEqual(["Lean flipped UNDER → OVER", "Penalty removed: Small sample (2 games) (+10)"]);
  });
});
