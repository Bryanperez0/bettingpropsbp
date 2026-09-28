import { describe, expect, it } from "vitest";
import { americanToProb, cv, median, noVig, normalCdf, poissonCdf, shrinkRatio, shrinkTo } from "../shared/model/stats";

describe("stats helpers", () => {
  it("normal CDF matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
  it("poisson CDF", () => {
    expect(poissonCdf(0, 1)).toBeCloseTo(Math.exp(-1), 6);
    expect(poissonCdf(1, 1.5)).toBeCloseTo(Math.exp(-1.5) * (1 + 1.5), 6);
  });
  it("american odds to probability and no-vig", () => {
    expect(americanToProb(-110)).toBeCloseTo(0.5238, 4);
    expect(americanToProb(150)).toBeCloseTo(0.4, 6);
    expect(americanToProb(null)).toBeNull();
    const nv = noVig(-110, -110)!;
    expect(nv[0]).toBeCloseTo(0.5, 6);
    expect(nv[0] + nv[1]).toBeCloseTo(1, 9);
  });
  it("shrinks ratios toward 1 by sample size and caps them", () => {
    expect(shrinkRatio(1.4, 4, 4, 0.85, 1.15)).toBeCloseTo(1.15, 6); // 1.2 capped at 1.15
    expect(shrinkRatio(1.1, 4, 4, 0.8, 1.2)).toBeCloseTo(1.05, 6);
    expect(shrinkRatio(null, 10, 4, 0.8, 1.2)).toBe(1);
    expect(shrinkTo(6, 4, 60, 60)).toBeCloseTo(5, 6);
  });
  it("median and cv", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(cv([10])).toBeNull();
  });
});
