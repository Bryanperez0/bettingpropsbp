import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoster, parseScoreboard, parseSummary, parseSummaryInjuries } from "../server/providers/espn";
import { buildLeagueContext, buildPlayerLogs } from "../shared/model/league";

const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", f), "utf8"));

describe("ESPN adapter (real response fixtures)", () => {
  it("parses a box score into per-player stat lines", () => {
    const { box, completed } = parseSummary("401872929", fx("summary-401872929.json"));
    expect(completed).toBe(true);
    expect(box).not.toBeNull();
    expect(box!.home.abbr).toBe("PHI");
    expect(box!.away.abbr).toBe("WSH");
    const barkley = box!.players.find((p) => p.name === "Saquon Barkley")!;
    expect(barkley.stats).toMatchObject({ rushAtt: 15, rushYds: 83, rushLong: 42, rec: 1, recYds: -3, targets: 2 });
    const hurts = box!.players.find((p) => p.name === "Jalen Hurts")!;
    expect(hurts.stats).toMatchObject({ passCmp: 14, passAtt: 25, passYds: 203, rushAtt: 7, rushYds: 46 });
    const goedert = box!.players.find((p) => p.name === "Dallas Goedert")!;
    expect(goedert.stats).toMatchObject({ rec: 4, recYds: 77, targets: 5 });
  });

  it("parses team totals including red-zone TDs-trips", () => {
    const { box } = parseSummary("401872929", fx("summary-401872929.json"));
    expect(box!.away.stats.redZoneTDs).toBe(3);
    expect(box!.away.stats.redZoneTrips).toBe(3);
    expect(box!.home.stats.points).toBe(24);
    expect(box!.home.stats.passAtt).toBe(25);
  });

  it("parses scoreboard games, venue and opening/current lines", () => {
    const sb = parseScoreboard(fx("scoreboard-week3.json"));
    expect(sb.season).toBe(2026);
    expect(sb.week).toBe(3);
    expect(sb.regularSeasonWeeks.length).toBe(18);
    const g = sb.games.find((x) => x.id === "401872963")!;
    expect(g.state).toBe("pre");
    expect(g.home.abbr).toBe("CHI");
    expect(g.venue).toMatchObject({ name: "Soldier Field", city: "Chicago", indoor: false });
    expect(g.lines).toMatchObject({ homeSpread: 3.5, homeSpreadOpen: -1.5, total: 41.5, homeMoneyline: 160, awayMoneyline: -192, homeMoneylineOpen: -118 });
  });

  it("reads pre-game injury reports from a game summary", () => {
    const inj = parseSummaryInjuries(fx("summary-401872963.json"));
    const cw = inj.find((i) => i.name === "Caleb Williams")!;
    expect(cw).toMatchObject({ team: "CHI", position: "QB", status: "Out", playerId: "4431611" });
    const { box } = parseSummary("401872963", fx("summary-401872963.json"));
    expect(box).toBeNull(); // game not played yet: no invented box score
  });

  it("parses rosters with positions and headshots", () => {
    const r = parseRoster(fx("roster-3.json"), "3", "CHI");
    const swift = r.find((p) => p.name === "D'Andre Swift")!;
    expect(swift.position).toBe("RB");
    expect(swift.headshot).toMatch(/^https:\/\/a\.espncdn\.com/);
  });

  it("builds player logs and league context from parsed games", () => {
    const boxes = ["401872929", "401872939", "401872661", "401872937", "401872948"].map((id) => parseSummary(id, fx(`summary-${id}.json`)).box!);
    const logs = buildPlayerLogs("4241478", boxes); // DeVonta Smith
    expect(logs.length).toBe(2);
    expect(logs[0].week).toBe(2); // newest first
    expect(logs[0].stats.recYds).toBe(117);
    const roster = [...parseRoster(fx("roster-21.json"), "21", "PHI"), ...parseRoster(fx("roster-3.json"), "3", "CHI")];
    const ctx = buildLeagueContext(2026, boxes, Object.fromEntries(roster.map((p) => [p.id, p.position])));
    expect(ctx.gamesCounted).toBe(5);
    expect(ctx.defense["WSH"].games).toBe(1);
    // WSH allowed Barkley's 83 + others on the ground in week 1
    expect(ctx.defense["WSH"].rushYds).toBe(136);
    expect(ctx.defense["WSH"].pos.RB.rushYds).toBeGreaterThan(80);
  });
});
