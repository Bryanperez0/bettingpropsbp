import { describe, expect, it } from "vitest";
import { calibrate, MODEL_WEIGHT } from "../shared/model/calibration";
import { americanToProb, isValidAmericanOdds, noVig } from "../shared/model/stats";

describe("calibration", () => {
  it("keeps only a small share of the model's disagreement with the market", () => {
    const p = calibrate(0.7, 0.5);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.53);
  });

  it("returns the market probability when the model agrees with it", () => {
    expect(calibrate(0.6, 0.6)).toBeCloseTo(0.6, 6);
  });

  it("keeps over and under summing to 1", () => {
    expect(calibrate(0.72, 0.45) + calibrate(0.28, 0.55)).toBeCloseTo(1, 6);
  });

  it("weight 1 returns the raw model, weight 0 the market", () => {
    expect(calibrate(0.8, 0.5, 1)).toBeCloseTo(0.8, 6);
    expect(calibrate(0.8, 0.5, 0)).toBeCloseTo(0.5, 6);
    expect(MODEL_WEIGHT).toBeGreaterThan(0);
    expect(MODEL_WEIGHT).toBeLessThan(1);
  });

  it("blends toward 50/50 when there is no market price", () => {
    expect(calibrate(0.9, null)).toBeLessThan(0.6);
  });
});

describe("odds validation", () => {
  it("rejects impossible American odds", () => {
    for (const bad of [-1, -2, -6, 0, 50, -99, NaN, null, undefined]) expect(isValidAmericanOdds(bad as number)).toBe(false);
    for (const ok of [-100, 100, -110, 150, -250]) expect(isValidAmericanOdds(ok)).toBe(true);
  });

  it("gives no implied probability for impossible odds", () => {
    expect(americanToProb(-1)).toBeNull();
    expect(noVig(-1, -110)).toBeNull();
    expect(americanToProb(-110)).toBeCloseTo(110 / 210, 6);
  });
});

describe("performance summary", () => {
  it("leaves out picks saved with impossible odds", async () => {
    const { summarize } = await import("../server/services/tracking");
    const base = { createdAt: "", gameId: "g", kickoff: "", season: 2026, week: 4, playerId: "p", playerName: "P", team: "A", opponent: "B", position: "WR", market: "receptions", marketLabel: "Receptions", category: "receiving", side: "over", line: 4.5, projection: 5, confidence: 60, tier: "moderate", modelProb: 0.6, actual: 6, gradedAt: "" } as const;
    const s = summarize([
      { ...base, id: "good", odds: -110, result: "win" },
      { ...base, id: "bad", odds: -1, result: "win" },
    ]);
    expect(s.total).toBe(1);
    expect(s.excludedInvalidOdds).toBe(1);
    expect(s.units).toBeCloseTo(100 / 110, 2);
  });
});
