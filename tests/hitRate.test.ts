import { describe, expect, it } from "vitest";
import { buildHistory, computeHitRates } from "../shared/model/hitRate";
import { makeLogs } from "./helpers";

describe("hit rates against the CURRENT line", () => {
  // newest first: 80, 70, 60, 90, 50, 69
  const logs = makeLogs([80, 70, 60, 90, 50, 69].map((y) => ({ rushYds: y, rushAtt: 15 })));

  it("counts overs and unders at 68.5", () => {
    const h = buildHistory(logs, "rush_yds", 68.5);
    const over = computeHitRates(h, "over", 2026);
    expect(over.season).toMatchObject({ hits: 4, total: 6, pushes: 0 });
    expect(over.season.pct).toBeCloseTo(4 / 6, 6);
    expect(over.last5).toMatchObject({ hits: 3, total: 5 });
    expect(over.last3).toMatchObject({ hits: 2, total: 3 });
    const under = computeHitRates(h, "under", 2026);
    expect(under.season.hits).toBe(2);
    expect(under.last3.hits).toBe(1);
  });

  it("treats exact results on whole-number lines as pushes", () => {
    const h = buildHistory(logs, "rush_yds", 70);
    const r = computeHitRates(h, "over", 2026);
    expect(r.season.pushes).toBe(1);
    expect(r.season.pct).toBeCloseTo(2 / 5, 6); // overs: 80, 90; push: 70; unders: 60, 50, 69
  });

  it("splits home and away within the current season", () => {
    const h = buildHistory(logs, "rush_yds", 68.5);
    const r = computeHitRates(h, "over", 2026);
    expect(r.home.total + r.away.total).toBe(6);
  });

  it("season window excludes last season but last-N can reach back", () => {
    const cur = makeLogs([{ rushYds: 100 }, { rushYds: 100 }], { season: 2026, startWeek: 2 });
    const prior = makeLogs([{ rushYds: 10 }, { rushYds: 10 }, { rushYds: 10 }], { season: 2025, startWeek: 18 });
    const h = buildHistory([...cur, ...prior], "rush_yds", 50.5);
    const r = computeHitRates(h, "over", 2026);
    expect(r.season).toMatchObject({ hits: 2, total: 2 });
    expect(r.last5).toMatchObject({ hits: 2, total: 5 });
  });

  it("anytime TD history uses scored/not scored", () => {
    const tdLogs = makeLogs([{ rushTD: 1 }, { recTD: 0 }, { recTD: 2 }]);
    const h = buildHistory(tdLogs, "anytime_td", 0.5);
    expect(h.map((x) => x.result)).toEqual(["over", "under", "over"]);
  });
});
