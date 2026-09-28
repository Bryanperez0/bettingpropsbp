import type { AnalyzedProp, Game, InjuryItem, RosterPlayer, SeasonDataset, SourceMeta } from "../../shared/types";
import type { GameDetail, PlayerListItem, PlayerProfile, RankRow, SlimProp, StatSummary, StatusInfo, TeamSummary } from "../../shared/api";
import { buildLeagueContext, buildPlayerLogs, defenseRank, offenseRank, posVal, type LeagueContext, type TeamProfile } from "../../shared/model/league";
import { positionGroup } from "../../shared/model/markets";
import { mean, median, round, sum } from "../../shared/model/stats";
import { readJSON } from "../cache";
import { getConfig } from "../config";
import { storageBackend } from "../cache";
import { getAnalysis, type AnalysisSnapshot, findInjury } from "./analysis";
import { readDataset } from "./dataset";
import type { Rosters } from "./rosters";

export function slim(p: AnalyzedProp): SlimProp {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { history, steps, matchup, ...rest } = p;
  return rest;
}

export function statusOf(s: AnalysisSnapshot): StatusInfo {
  const cfg = getConfig();
  return {
    generatedAt: s.generatedAt, season: s.season, seasonType: s.seasonType, week: s.week,
    oddsConfigured: !!cfg.oddsApiKey, demoLines: !cfg.oddsApiKey && cfg.demoPropLines,
    storage: storageBackend(), stats: s.stats,
  };
}

export interface Context {
  snapshot: AnalysisSnapshot;
  stale: boolean;
  datasets: SeasonDataset[];
  roster: RosterPlayer[];
  league: LeagueContext;
  sources: SourceMeta[];
  warnings: string[];
}

/** Snapshot + cached datasets/rosters for detail pages (no extra provider calls). */
export async function loadContext(): Promise<Context> {
  const { snapshot, stale } = await getAnalysis({ budgetMs: 8_000 });
  const cur = await readDataset(snapshot.season);
  const prior = await readDataset(snapshot.season - 1);
  const roster = (await readJSON<Rosters>("espn/rosters"))?.value?.players ?? [];
  const positions = Object.fromEntries(roster.map((p) => [p.id, p.position]));
  const league = buildLeagueContext(snapshot.season, cur?.games ?? [], positions);
  return {
    snapshot, stale, roster, league,
    datasets: [...(prior ? [prior] : []), ...(cur ? [cur] : [])],
    sources: snapshot.sources, warnings: snapshot.warnings,
  };
}

const r1 = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? null : round(x, d));

function defRanks(L: LeagueContext, team: string): RankRow[] {
  const d = L.defense[team];
  const row = (label: string, f: (p: TeamProfile) => number | null, digits = 1): RankRow => {
    const r = defenseRank(L, team, f);
    return { label, value: d ? r1(f(d), digits) : null, rank: r?.rank ?? null, of: r?.of ?? 32, digits };
  };
  return [
    row("Points allowed/g", (p) => p.points),
    row("Total yds allowed/g", (p) => p.totalYards),
    row("Pass yds allowed/g", (p) => p.passYds),
    row("Rush yds allowed/g", (p) => p.rushYds),
    row("YPC allowed", (p) => (p.rushAtt ? p.rushYds / p.rushAtt : null), 2),
    row("Yds/att allowed", (p) => (p.passAtt ? p.passYds / p.passAtt : null), 2),
    row("WR rec yds allowed/g", (p) => posVal(p, (x) => x.WR.recYds)),
    row("TE rec yds allowed/g", (p) => posVal(p, (x) => x.TE.recYds)),
    row("RB rush yds allowed/g", (p) => posVal(p, (x) => x.RB.rushYds)),
  ];
}

function offRanks(L: LeagueContext, team: string): RankRow[] {
  const o = L.offense[team];
  const row = (label: string, f: (p: TeamProfile) => number | null, digits = 1): RankRow => {
    const r = offenseRank(L, team, f);
    return { label, value: o ? r1(f(o), digits) : null, rank: r?.rank ?? null, of: r?.of ?? 32, digits };
  };
  return [
    row("Points/g", (p) => p.points),
    row("Total yds/g", (p) => p.totalYards),
    row("Pass yds/g", (p) => p.passYds),
    row("Rush yds/g", (p) => p.rushYds),
    row("Pass att/g", (p) => p.passAtt),
    row("Rush att/g", (p) => p.rushAtt),
    row("Red-zone trips/g", (p) => p.redZoneTrips),
  ];
}

function teamSummary(ctx: Context, game: Game, side: "home" | "away"): TeamSummary {
  const t = game[side];
  const cur = ctx.datasets.find((d) => d.season === ctx.snapshot.season)?.games ?? [];
  const recent = cur
    .filter((g) => g.home.abbr === t.abbr || g.away.abbr === t.abbr)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((g) => {
      const home = g.home.abbr === t.abbr;
      const me = home ? g.home : g.away;
      const opp = home ? g.away : g.home;
      return {
        gameId: g.gameId, week: g.week, opponent: opp.abbr, home, pointsFor: me.score, pointsAgainst: opp.score,
        result: (me.score > opp.score ? "W" : me.score < opp.score ? "L" : "T") as "W" | "L" | "T",
      };
    });
  return {
    abbr: t.abbr, name: t.displayName, logo: t.logo, record: t.record,
    offense: ctx.league.offense[t.abbr] ?? null,
    defense: ctx.league.defense[t.abbr] ?? null,
    offenseRanks: offRanks(ctx.league, t.abbr),
    defenseRanks: defRanks(ctx.league, t.abbr),
    recent,
  };
}

export function gameDetail(ctx: Context, gameId: string): GameDetail | null {
  const game = ctx.snapshot.games.find((g) => g.id === gameId);
  if (!game) return null;
  const inj = (abbr: string) => ctx.snapshot.injuries.filter((i) => i.team === abbr);
  return {
    game,
    home: teamSummary(ctx, game, "home"),
    away: teamSummary(ctx, game, "away"),
    injuries: { home: inj(game.home.abbr), away: inj(game.away.abbr) },
    props: ctx.snapshot.props.filter((p) => p.gameId === gameId).map(slim),
  };
}

const STAT_KEYS: { key: string; label: string; f: (s: import("../../shared/types").StatLine) => number; pos: string[] }[] = [
  { key: "passYds", label: "Pass yds", f: (s) => s.passYds, pos: ["QB"] },
  { key: "passAtt", label: "Pass att", f: (s) => s.passAtt, pos: ["QB"] },
  { key: "passCmp", label: "Completions", f: (s) => s.passCmp, pos: ["QB"] },
  { key: "passTD", label: "Pass TD", f: (s) => s.passTD, pos: ["QB"] },
  { key: "rushAtt", label: "Carries", f: (s) => s.rushAtt, pos: ["QB", "RB"] },
  { key: "rushYds", label: "Rush yds", f: (s) => s.rushYds, pos: ["QB", "RB", "WR"] },
  { key: "targets", label: "Targets", f: (s) => s.targets, pos: ["RB", "WR", "TE"] },
  { key: "rec", label: "Receptions", f: (s) => s.rec, pos: ["RB", "WR", "TE"] },
  { key: "recYds", label: "Rec yds", f: (s) => s.recYds, pos: ["RB", "WR", "TE"] },
  { key: "recLong", label: "Long rec", f: (s) => s.recLong, pos: ["WR", "TE"] },
];

export function playerList(ctx: Context): PlayerListItem[] {
  const cur = ctx.datasets.find((d) => d.season === ctx.snapshot.season);
  if (!cur) return [];
  const rosterById = new Map(ctx.roster.map((p) => [p.id, p]));
  const agg = new Map<string, { name: string; team: string; headshot?: string; logs: import("../../shared/types").StatLine[] }>();
  for (const g of cur.games) {
    for (const p of g.players) {
      const a = agg.get(p.id) ?? { name: p.name, team: p.team, headshot: p.headshot, logs: [] };
      a.logs.push(p.stats);
      a.team = p.team;
      agg.set(p.id, a);
    }
  }
  const propCount = new Map<string, number>();
  for (const p of ctx.snapshot.props) if (p.player.id) propCount.set(p.player.id, (propCount.get(p.player.id) ?? 0) + 1);
  const out: PlayerListItem[] = [];
  for (const [id, a] of agg) {
    const r = rosterById.get(id);
    const pos = positionGroup(r?.position);
    if (!pos) continue;
    const avg = (f: (s: import("../../shared/types").StatLine) => number) => round(mean(a.logs.map(f)) ?? 0, 1);
    const volume = sum(a.logs.map((s) => s.passAtt + s.rushAtt + s.targets));
    if (volume < 3) continue;
    const headline =
      pos === "QB" ? [{ label: "Pass yds", value: avg((s) => s.passYds) }, { label: "Pass TD", value: avg((s) => s.passTD) }, { label: "Rush yds", value: avg((s) => s.rushYds) }]
      : pos === "RB" ? [{ label: "Rush yds", value: avg((s) => s.rushYds) }, { label: "Carries", value: avg((s) => s.rushAtt) }, { label: "Rec yds", value: avg((s) => s.recYds) }]
      : [{ label: "Rec yds", value: avg((s) => s.recYds) }, { label: "Rec", value: avg((s) => s.rec) }, { label: "Targets", value: avg((s) => s.targets) }];
    out.push({
      id, name: r?.name ?? a.name, team: r?.team ?? a.team, position: r?.position ?? pos, headshot: r?.headshot ?? a.headshot ?? null,
      games: a.logs.length, headline,
      injuryStatus: findInjury(ctx.snapshot.injuries, { id, name: a.name, team: a.team })?.status ?? null,
      propCount: propCount.get(id) ?? 0,
    });
  }
  return out.sort((x, y) => y.propCount - x.propCount || y.headline[0].value - x.headline[0].value);
}

export function playerProfile(ctx: Context, playerId: string): PlayerProfile | null {
  const allGames = ctx.datasets.flatMap((d) => d.games);
  const logs = buildPlayerLogs(playerId, allGames);
  const r = ctx.roster.find((p) => p.id === playerId);
  if (!r && !logs.length) return null;
  const lastBox = allGames.flatMap((g) => g.players).find((p) => p.id === playerId);
  const player = {
    id: playerId,
    name: r?.name ?? lastBox?.name ?? "Unknown",
    team: r?.team ?? logs[0]?.team ?? "",
    position: r?.position ?? "",
    headshot: r?.headshot ?? lastBox?.headshot ?? null,
    jersey: r?.jersey ?? null,
  };
  const pos = positionGroup(player.position) ?? "WR";
  const season = ctx.snapshot.season;
  const cur = logs.filter((l) => l.season === season);
  const summaries: StatSummary[] = STAT_KEYS.filter((k) => k.pos.includes(pos)).map((k) => {
    const all = logs.map((l) => k.f(l.stats));
    const c = cur.map((l) => k.f(l.stats));
    const r1n = (x: number | null) => (x === null ? null : round(x, 1));
    return {
      key: k.key, label: k.label,
      season: r1n(mean(c)), median: r1n(median(c)),
      last3: r1n(mean(all.slice(0, 3))), last5: r1n(mean(all.slice(0, 5))), last10: r1n(mean(all.slice(0, 10))),
      home: r1n(mean(cur.filter((l) => l.home).map((l) => k.f(l.stats)))),
      away: r1n(mean(cur.filter((l) => !l.home).map((l) => k.f(l.stats)))),
    };
  });
  const tt = sum(cur.map((l) => l.teamStats.targets));
  const tc = sum(cur.map((l) => l.teamStats.rushAtt));
  const usage = [
    { label: "Target share", value: tt ? round(sum(cur.map((l) => l.stats.targets)) / tt, 3) : null },
    { label: "Rush share", value: tc ? round(sum(cur.map((l) => l.stats.rushAtt)) / tc, 3) : null },
    { label: "Catch rate", value: sum(cur.map((l) => l.stats.targets)) ? round(sum(cur.map((l) => l.stats.rec)) / sum(cur.map((l) => l.stats.targets)), 3) : null },
    { label: "Snap share", value: null, note: "Data unavailable (no snap-count provider configured)" },
    { label: "Route participation", value: null, note: "Data unavailable" },
    { label: "Red-zone touches", value: null, note: "Data unavailable (team red-zone trips only)" },
  ];
  const g = ctx.snapshot.games.find((x) => x.state === "pre" && (x.home.abbr === player.team || x.away.abbr === player.team)) ?? null;
  const upcoming = g
    ? (() => {
        const isHome = g.home.abbr === player.team;
        const opponent = isHome ? g.away.abbr : g.home.abbr;
        return { game: g, opponent, isHome, defenseRanks: defRanks(ctx.league, opponent) };
      })()
    : null;
  return {
    player,
    injury: findInjury(ctx.snapshot.injuries, { id: playerId, name: player.name, team: player.team }) as InjuryItem | null,
    season, logs, summaries, usage, upcoming,
    props: ctx.snapshot.props.filter((p) => p.player.id === playerId).map(slim),
  };
}
