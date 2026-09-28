import type { PlayerGameLog, PropLineGroup, StatLine, TeamStatLine } from "../shared/types";

export const line0 = (): StatLine => ({
  passCmp: 0, passAtt: 0, passYds: 0, passTD: 0, passInt: 0, sacks: 0,
  rushAtt: 0, rushYds: 0, rushTD: 0, rushLong: 0, rec: 0, recYds: 0, recTD: 0, recLong: 0, targets: 0,
});

const team0 = (): TeamStatLine => ({
  points: 24, passCmp: 22, passAtt: 34, passYds: 230, passTD: 2, passInt: 1, sacks: 2,
  rushAtt: 26, rushYds: 115, rushTD: 1, targets: 34, totalYards: 345, plays: 62, redZoneTrips: 3, redZoneTDs: 2,
});

/** Build newest-first logs. Each entry overrides stat fields. */
export function makeLogs(entries: Partial<StatLine>[], opts: { season?: number; team?: string; startWeek?: number; homeEvery?: number } = {}): PlayerGameLog[] {
  const season = opts.season ?? 2026;
  const n = entries.length;
  return entries.map((e, i) => {
    const week = (opts.startWeek ?? n) - i;
    return {
      gameId: `g${season}-${week}`, season, week, date: `${season}-09-${String(10 + week).padStart(2, "0")}T17:00Z`,
      team: opts.team ?? "AAA", opponent: `O${week}`, home: i % 2 === 0,
      stats: { ...line0(), ...e }, teamStats: team0(), teamPoints: 24, oppPoints: 20,
    };
  });
}

export function lineGroup(p: Partial<PropLineGroup>): PropLineGroup {
  return {
    gameId: "G1", playerName: "Test Player", playerId: "p1", team: "AAA", market: "rush_yds",
    line: 60.5, overPrice: -110, underPrice: -110, books: [], source: "sportsbook",
    fetchedAt: "2026-09-28T12:00:00Z", firstSeen: null, ...p,
  };
}
