import type { GameBox, PlayerGameLog, StatLine, TeamStatLine } from "../types";
import { positionGroup } from "./markets";

export type PosKey = "QB" | "RB" | "WR" | "TE";
export const POS_KEYS: PosKey[] = ["QB", "RB", "WR", "TE"];

export interface PosTotals {
  targets: number;
  rec: number;
  recYds: number;
  recTD: number;
  rushAtt: number;
  rushYds: number;
  rushTD: number;
}

/** Per-game averages for one team's offense, or what a defense allowed. */
export interface TeamProfile {
  games: number;
  points: number;
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTD: number;
  rushAtt: number;
  rushYds: number;
  rushTD: number;
  sacks: number;
  totalYards: number | null;
  redZoneTrips: number | null;
  redZoneTDs: number | null;
  pos: Record<PosKey, PosTotals>;
  /**
   * Share of targets+carries credited to players with a known roster
   * position. Below 0.8 the by-position numbers are incomplete and the model
   * treats them as unavailable instead of as zeros.
   */
  posCoverage: number | null;
  /** internal accumulators */
  _known?: number;
  _total?: number;
}

export const POS_COVERAGE_MIN = 0.8;

export interface LeagueContext {
  season: number;
  gamesCounted: number;
  /** What each defense ALLOWED per game, keyed by team abbreviation. */
  defense: Record<string, TeamProfile>;
  /** What each offense PRODUCED per game. */
  offense: Record<string, TeamProfile>;
  /** League average per team-game. */
  league: TeamProfile;
}

const emptyPos = (): PosTotals => ({ targets: 0, rec: 0, recYds: 0, recTD: 0, rushAtt: 0, rushYds: 0, rushTD: 0 });

function emptyProfile(): TeamProfile {
  return {
    games: 0, points: 0, passAtt: 0, passCmp: 0, passYds: 0, passTD: 0, rushAtt: 0, rushYds: 0, rushTD: 0, sacks: 0,
    totalYards: 0, redZoneTrips: 0, redZoneTDs: 0,
    pos: { QB: emptyPos(), RB: emptyPos(), WR: emptyPos(), TE: emptyPos() },
    posCoverage: null, _known: 0, _total: 0,
  };
}

function addTeamLine(p: TeamProfile, t: TeamStatLine) {
  p.games += 1;
  p.points += t.points;
  p.passAtt += t.passAtt;
  p.passCmp += t.passCmp;
  p.passYds += t.passYds;
  p.passTD += t.passTD;
  p.rushAtt += t.rushAtt;
  p.rushYds += t.rushYds;
  p.rushTD += t.rushTD;
  p.sacks += t.sacks;
  p._total = (p._total ?? 0) + t.targets + t.rushAtt;
  p.totalYards = p.totalYards === null || t.totalYards === null ? null : p.totalYards + t.totalYards;
  p.redZoneTrips = p.redZoneTrips === null || t.redZoneTrips === null ? null : p.redZoneTrips + t.redZoneTrips;
  p.redZoneTDs = p.redZoneTDs === null || t.redZoneTDs === null ? null : p.redZoneTDs + t.redZoneTDs;
}

function addPos(p: TeamProfile, pos: PosKey, s: StatLine) {
  const x = p.pos[pos];
  p._known = (p._known ?? 0) + s.targets + s.rushAtt;
  x.targets += s.targets;
  x.rec += s.rec;
  x.recYds += s.recYds;
  x.recTD += s.recTD;
  x.rushAtt += s.rushAtt;
  x.rushYds += s.rushYds;
  x.rushTD += s.rushTD;
}

function toPerGame(p: TeamProfile): TeamProfile {
  const g = p.games || 1;
  const div = (n: number) => n / g;
  const pos = {} as Record<PosKey, PosTotals>;
  for (const k of POS_KEYS) {
    const x = p.pos[k];
    pos[k] = {
      targets: div(x.targets), rec: div(x.rec), recYds: div(x.recYds), recTD: div(x.recTD),
      rushAtt: div(x.rushAtt), rushYds: div(x.rushYds), rushTD: div(x.rushTD),
    };
  }
  return {
    games: p.games,
    points: div(p.points), passAtt: div(p.passAtt), passCmp: div(p.passCmp), passYds: div(p.passYds),
    passTD: div(p.passTD), rushAtt: div(p.rushAtt), rushYds: div(p.rushYds), rushTD: div(p.rushTD), sacks: div(p.sacks),
    totalYards: p.totalYards === null ? null : div(p.totalYards),
    redZoneTrips: p.redZoneTrips === null ? null : div(p.redZoneTrips),
    redZoneTDs: p.redZoneTDs === null ? null : div(p.redZoneTDs),
    pos,
    posCoverage: p._total ? Math.min(1, (p._known ?? 0) / p._total) : null,
  };
}

/**
 * Build offense/defense profiles for every team from completed box scores.
 * `positions` maps player id -> roster position; players without a known
 * position are left out of the by-position totals (never guessed).
 */
export function buildLeagueContext(season: number, games: GameBox[], positions: Record<string, string>): LeagueContext {
  const off: Record<string, TeamProfile> = {};
  const def: Record<string, TeamProfile> = {};
  const league = emptyProfile();
  const seasonGames = games.filter((g) => g.season === season && g.seasonType === 2);

  for (const g of seasonGames) {
    for (const [team, opp] of [[g.home, g.away], [g.away, g.home]] as const) {
      off[team.abbr] ??= emptyProfile();
      def[opp.abbr] ??= emptyProfile();
      addTeamLine(off[team.abbr], team.stats);
      addTeamLine(def[opp.abbr], team.stats);
      addTeamLine(league, team.stats);
    }
    for (const p of g.players) {
      const pos = positionGroup(positions[p.id]);
      if (!pos) continue;
      const opp = p.team === g.home.abbr ? g.away.abbr : g.home.abbr;
      addPos(off[p.team] ?? (off[p.team] = emptyProfile()), pos, p.stats);
      addPos(def[opp] ?? (def[opp] = emptyProfile()), pos, p.stats);
      addPos(league, pos, p.stats);
    }
  }

  const perGame = (m: Record<string, TeamProfile>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, toPerGame(v)]));

  return {
    season,
    gamesCounted: seasonGames.length,
    defense: perGame(def),
    offense: perGame(off),
    league: toPerGame(league),
  };
}

/**
 * Rank a defense on a per-game metric. Rank 1 = allows the LEAST (toughest).
 * Returns null if the team has no data.
 */
export function defenseRank(ctx: LeagueContext, team: string, metric: (p: TeamProfile) => number | null): { rank: number; of: number } | null {
  const rows = Object.entries(ctx.defense)
    .map(([abbr, p]) => ({ abbr, v: metric(p) }))
    .filter((r): r is { abbr: string; v: number } => r.v !== null && Number.isFinite(r.v));
  const me = rows.find((r) => r.abbr === team);
  if (!me) return null;
  rows.sort((a, b) => a.v - b.v);
  return { rank: rows.findIndex((r) => r.abbr === team) + 1, of: rows.length };
}

export function offenseRank(ctx: LeagueContext, team: string, metric: (p: TeamProfile) => number | null): { rank: number; of: number } | null {
  const rows = Object.entries(ctx.offense)
    .map(([abbr, p]) => ({ abbr, v: metric(p) }))
    .filter((r): r is { abbr: string; v: number } => r.v !== null && Number.isFinite(r.v));
  if (!rows.find((r) => r.abbr === team)) return null;
  rows.sort((a, b) => b.v - a.v);
  return { rank: rows.findIndex((r) => r.abbr === team) + 1, of: rows.length };
}

/** Build one player's game logs (newest first) from the dataset. */
export function buildPlayerLogs(playerId: string, games: GameBox[]): PlayerGameLog[] {
  const logs: PlayerGameLog[] = [];
  for (const g of games) {
    if (g.seasonType !== 2) continue;
    const p = g.players.find((x) => x.id === playerId);
    if (!p) continue;
    const isHome = p.team === g.home.abbr;
    const mine = isHome ? g.home : g.away;
    const opp = isHome ? g.away : g.home;
    logs.push({
      gameId: g.gameId,
      season: g.season,
      week: g.week,
      date: g.date,
      team: p.team,
      opponent: opp.abbr,
      home: isHome,
      stats: p.stats,
      teamStats: mine.stats,
      teamPoints: mine.score,
      oppPoints: opp.score,
    });
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}
