import { describe, expect, it } from "vitest";
import { defaultLine, filterLogs, marketsForPosition, summarizeView } from "../shared/explorer";
import { makeLogs } from "./helpers";

// 3 games this season (newest first) + 4 last season.
const cur = makeLogs([{ rec: 1 }, { rec: 4 }, { rec: 2 }], { season: 2026, startWeek: 3 });
const prior = makeLogs([{ rec: 3 }, { rec: 0 }, { rec: 5 }, { rec: 2 }], { season: 2025, startWeek: 18 });
const logs = [...cur, ...prior];

describe("prop explorer", () => {
  it("filters by time range", () => {
    const base = { split: "all" as const, opponent: null, season: 2026 };
    expect(filterLogs(logs, { ...base, range: "l5" })).toHaveLength(5);
    expect(filterLogs(logs, { ...base, range: "season" })).toHaveLength(3);
    expect(filterLogs(logs, { ...base, range: "last_season" }).every((l) => l.season === 2025)).toBe(true);
    expect(filterLogs(logs, { ...base, range: "all" })).toHaveLength(7);
  });

  it("filters home/away and opponent before the range", () => {
    const home = filterLogs(logs, { range: "all", split: "home", opponent: null, season: 2026 });
    expect(home.every((l) => l.home)).toBe(true);
    const vsOpp = filterLogs(logs, { range: "all", split: "all", opponent: logs[1].opponent, season: 2026 });
    expect(vsOpp.every((l) => l.opponent === logs[1].opponent)).toBe(true);
  });

  it("regrades hit rates against a custom line", () => {
    const at25 = summarizeView(cur, "receptions", 2.5);
    expect(at25).toMatchObject({ games: 3, over: 1, under: 2, pushes: 0 });
    const at35 = summarizeView(cur, "receptions", 3.5);
    expect(at35.over).toBe(1);
    const at2 = summarizeView(cur, "receptions", 2);
    expect(at2.pushes).toBe(1); // exact 2 on a whole-number line
    expect(at2.overPct).toBeCloseTo(1 / 2, 6);
  });

  it("uses the recent median as the line when no sportsbook line exists", () => {
    expect(defaultLine(logs, "receptions")).toBe(2.5); // median of 1,4,2,3,0,5,2 = 2
    expect(defaultLine(logs, "anytime_td")).toBe(0.5);
  });

  it("offers position-appropriate prop types", () => {
    expect(marketsForPosition("QB")[0]).toBe("pass_yds");
    expect(marketsForPosition("RB")).toContain("receptions");
    expect(marketsForPosition("TE")).not.toContain("pass_yds");
  });
});
