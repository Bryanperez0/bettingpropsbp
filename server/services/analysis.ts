import type { AnalyzedProp, Game, GameBox, InjuryItem, RosterPlayer, SeasonDataset, SourceMeta } from "../../shared/types";
import { analyzeProp } from "../../shared/model/engine";
import { buildLeagueContext, buildPlayerLogs, type LeagueContext } from "../../shared/model/league";
import type { TeammateOut } from "../../shared/model/projection";
import { MARKETS, positionGroup } from "../../shared/model/markets";
import { normName, shortKey } from "../../shared/names";
import { sum } from "../../shared/model/stats";
import { getConfig } from "../config";
import { readJSON, writeJSON, MIN } from "../cache";
import { getCurrentSlate } from "./schedule";
import { getDataset, datasetMeta } from "./dataset";
import { getRosters, positionMap } from "./rosters";
import { getInjuries, isOut, isDoubtful } from "./injuries";
import { getGameWeather } from "./weather";
import { getPropLines } from "./props";
import { recordPicks, gradePicks } from "./tracking";

export interface AnalysisSnapshot {
  generatedAt: string;
  season: number;
  seasonType: number;
  week: number;
  games: Game[];
  props: AnalyzedProp[];
  injuries: InjuryItem[];
  sources: SourceMeta[];
  warnings: string[];
  stats: { linesFound: number; analyzed: number; unmatched: number; excludedInjured: number; insufficientData: number; datasetPending: number };
}

const SNAPSHOT_KEY = "analysis/current";
export const ANALYSIS_TTL = 15 * MIN;

/** Everything the model needs, loaded once per build. */
export interface ModelInputs {
  season: number;
  games: GameBox[];
  league: LeagueContext;
  roster: RosterPlayer[];
  injuries: InjuryItem[];
}

export function teamSpreadFor(game: Game, team: string): number | null {
  const hs = game.lines.homeSpread;
  if (hs === null) return null;
  return team === game.home.abbr ? hs : -hs;
}

/** Find the ESPN player for a sportsbook name among the two teams in a game. */
export function resolvePlayer(name: string, game: Game, roster: RosterPlayer[]): RosterPlayer | null {
  const teams = new Set([game.home.abbr, game.away.abbr]);
  const pool = roster.filter((p) => teams.has(p.team));
  const n = normName(name);
  const exact = pool.filter((p) => normName(p.name) === n);
  if (exact.length === 1) return exact[0];
  const sk = shortKey(name);
  const loose = pool.filter((p) => shortKey(p.name) === sk);
  return loose.length === 1 ? loose[0] : null;
}

export function findInjury(injuries: InjuryItem[], p: { id: string | null; name: string; team: string }): InjuryItem | null {
  return (
    injuries.find((i) => p.id && i.playerId === p.id) ??
    injuries.find((i) => i.team === p.team && normName(i.name) === normName(p.name)) ??
    null
  );
}

/** Teammates currently out/doubtful who held a meaningful share of team volume. */
export function teammatesOutFor(playerId: string, team: string, inputs: ModelInputs): TeammateOut[] {
  const outs = inputs.injuries.filter((i) => i.team === team && i.playerId !== playerId && (isOut(i.status) || isDoubtful(i.status)));
  if (!outs.length) return [];
  const teamGames = inputs.games.filter((g) => g.season === inputs.season && (g.home.abbr === team || g.away.abbr === team));
  const teamTargets = sum(teamGames.map((g) => (g.home.abbr === team ? g.home : g.away).stats.targets));
  const teamCarries = sum(teamGames.map((g) => (g.home.abbr === team ? g.home : g.away).stats.rushAtt));
  const result: TeammateOut[] = [];
  for (const o of outs) {
    const lines = teamGames.flatMap((g) => g.players.filter((p) => p.id === o.playerId && p.team === team).map((p) => ({ g, p })));
    if (!lines.length) continue;
    const tg = sum(lines.map((x) => x.p.stats.targets));
    const car = sum(lines.map((x) => x.p.stats.rushAtt));
    const allGameIds = inputs.games.filter((g) => g.players.some((p) => p.id === o.playerId)).map((g) => g.gameId);
    const base = { id: o.playerId, name: o.name, position: o.position ?? "", status: o.status, gameIds: allGameIds };
    if (teamTargets > 0 && tg / teamTargets >= 0.12) result.push({ ...base, share: tg / teamTargets, volume: "targets" });
    if (teamCarries > 0 && car / teamCarries >= 0.12) result.push({ ...base, share: car / teamCarries, volume: "carries" });
  }
  return result;
}

/**
 * Situations the model does not quantify (e.g. the starting QB is out, so
 * pass-catcher history was built with a different passer). Flag + penalize.
 */
export function contextFlagsFor(playerId: string, team: string, market: string, inputs: ModelInputs): { risk: string; penalty: number }[] {
  const flags: { risk: string; penalty: number }[] = [];
  const teamGames = inputs.games.filter((g) => g.season === inputs.season && (g.home.abbr === team || g.away.abbr === team));
  const teamAtt = sum(teamGames.map((g) => (g.home.abbr === team ? g.home : g.away).stats.passAtt));
  if (!teamAtt) return flags;
  for (const i of inputs.injuries.filter((x) => x.team === team && x.playerId !== playerId && (isOut(x.status) || isDoubtful(x.status)))) {
    const att = sum(teamGames.flatMap((g) => g.players.filter((p) => p.id === i.playerId && p.team === team).map((p) => p.stats.passAtt)));
    if (att / teamAtt >= 0.5 && !market.startsWith("pass")) {
      flags.push({ risk: `Primary QB ${i.name} is ${i.status}; history was built with him under center (QB change not modeled)`, penalty: 6 });
    }
  }
  return flags;
}

/** Load stats, rosters, injuries and league context. */
export async function loadModelInputs(datasetDeadline: number, deadline: number, warnings: string[], sources: SourceMeta[]) {
  const cfg = getConfig();
  const { slate, meta: schedMeta } = await getCurrentSlate();
  sources.push(schedMeta);
  const season = slate.season;
  const curWeeks = slate.seasonType === 1 ? [] : slate.regularSeasonWeeks.filter((w) => slate.seasonType === 3 || w <= slate.week);

  const cur = await getDataset(season, curWeeks, datasetDeadline);
  sources.push(datasetMeta(cur, `${season} player & team stats`));
  let prior: SeasonDataset | null = null;
  let pending = cur.pending;
  if (cfg.includePriorSeason && cur.pending === 0) {
    const p = await getDataset(season - 1, Array.from({ length: 18 }, (_, i) => i + 1), datasetDeadline);
    prior = p.dataset;
    pending += p.pending;
    sources.push(datasetMeta(p, `${season - 1} stats (prior, down-weighted)`));
    if (p.pending) warnings.push(`Last season's box scores still loading (${p.pending} games left). Early-season projections may lean on fewer games until complete.`);
  }
  if (cur.pending) warnings.push(`This season's box scores still loading (${cur.pending} games left). Refresh again shortly.`);

  const { rosters, meta: rMeta } = await getRosters(deadline);
  sources.push(rMeta);
  const { injuries, meta: iMeta } = await getInjuries(slate.games, rosters.teams, deadline).catch(() => ({
    injuries: [] as InjuryItem[],
    meta: { key: "injuries", label: "Injury reports", provider: "ESPN", status: "unavailable" as const, fetchedAt: null, note: "Injury feed failed" },
  }));
  sources.push(iMeta);
  if (iMeta.status === "unavailable") warnings.push("Injury data unavailable — injury adjustments and exclusions are OFF.");

  const games = [...(prior?.games ?? []), ...cur.dataset.games];
  const league = buildLeagueContext(season, cur.dataset.games, positionMap(rosters));
  const inputs: ModelInputs = { season, games, league, roster: rosters.players, injuries };
  return { cfg, slate, cur, prior, rosters, inputs, pending };
}

export async function buildAnalysis(budgetMs = 20_000): Promise<AnalysisSnapshot> {
  // Box-score ingestion gets half the budget; rosters/injuries/odds get the rest.
  const datasetDeadline = Date.now() + budgetMs * 0.5;
  const deadline = Date.now() + budgetMs;
  const warnings: string[] = [];
  const sources: SourceMeta[] = [];
  const now = new Date().toISOString();
  const { cfg, slate, cur, prior, rosters, inputs, pending } = await loadModelInputs(datasetDeadline, deadline, warnings, sources);

  // Weather for every game on the slate.
  const games: Game[] = await Promise.all(
    slate.games.map(async (g) => ({ ...g, weather: await getGameWeather(g).catch(() => g.weather) })),
  );
  const wxLive = games.filter((g) => g.weather && g.weather.source === "Open-Meteo");
  sources.push({
    key: "weather", label: "Kickoff weather", provider: "Open-Meteo",
    status: wxLive.length ? "live" : games.some((g) => g.weather?.indoor) ? "live" : "unavailable",
    fetchedAt: wxLive.map((g) => g.weather!.fetchedAt).filter(Boolean).sort()[0] ?? null,
    note: `${wxLive.length} outdoor forecasts, ${games.filter((g) => g.weather?.indoor).length} indoor venues`,
  });

  const lines = await getPropLines(games, cfg, deadline, { datasets: [cur.dataset, ...(prior ? [prior] : [])], roster: rosters.players });
  sources.push(lines.meta);
  warnings.push(...lines.warnings);

  const stats = { linesFound: lines.groups.length, analyzed: 0, unmatched: 0, excludedInjured: 0, insufficientData: 0, datasetPending: pending };
  const props: AnalyzedProp[] = [];
  const gameById = new Map(games.map((g) => [g.id, g]));

  for (const line of lines.groups) {
    const game = gameById.get(line.gameId);
    if (!game) continue;
    const rp = line.playerId ? rosters.players.find((p) => p.id === line.playerId) ?? null : resolvePlayer(line.playerName, game, rosters.players);
    if (!rp) { stats.unmatched++; continue; }
    const pos = positionGroup(rp.position);
    if (!pos || !MARKETS[line.market].positions.includes(rp.position === "FB" ? "FB" : pos)) { stats.insufficientData++; continue; }
    const inj = findInjury(inputs.injuries, { id: rp.id, name: rp.name, team: rp.team });
    if (inj && isOut(inj.status)) { stats.excludedInjured++; continue; }

    const isHome = rp.team === game.home.abbr;
    const analyzed = analyzeProp({
      line: { ...line, playerId: rp.id, team: rp.team },
      player: { id: rp.id, name: rp.name, team: rp.team, position: rp.position, headshot: rp.headshot, injuryStatus: inj?.status ?? null },
      logs: buildPlayerLogs(rp.id, inputs.games),
      season: inputs.season,
      week: game.week,
      kickoff: game.date,
      opponent: isHome ? game.away.abbr : game.home.abbr,
      isHome,
      league: inputs.league.gamesCounted ? inputs.league : null,
      teamSpread: teamSpreadFor(game, rp.team),
      gameTotal: game.lines.total,
      weather: game.weather,
      teammatesOut: teammatesOutFor(rp.id, rp.team, inputs),
      contextFlags: contextFlagsFor(rp.id, rp.team, line.market, inputs),
      now,
    });
    if (!analyzed) { stats.insufficientData++; continue; }
    props.push(analyzed);
  }
  stats.analyzed = props.length;
  if (stats.unmatched) warnings.push(`${stats.unmatched} sportsbook player names could not be matched to ESPN rosters and were skipped.`);

  props.sort((a, b) => b.confidence.total - a.confidence.total || b.probEdge - a.probEdge);

  const snapshot: AnalysisSnapshot = {
    generatedAt: now, season: slate.season, seasonType: slate.seasonType, week: slate.week,
    games, props, injuries: inputs.injuries, sources, warnings, stats,
  };
  await writeJSON(SNAPSHOT_KEY, snapshot);

  // Model performance ledger: record new recommendations, grade finished ones.
  try {
    await recordPicks(props, now);
    await gradePicks([cur.dataset, ...(prior ? [prior] : [])]);
  } catch (e) {
    console.warn("tracking failed", e);
  }
  return snapshot;
}

/** Latest snapshot; rebuilds when older than ANALYSIS_TTL. Falls back to stale data on failure. */
export async function getAnalysis(opts: { force?: boolean; budgetMs?: number } = {}): Promise<{ snapshot: AnalysisSnapshot; stale: boolean }> {
  const saved = await readJSON<AnalysisSnapshot>(SNAPSHOT_KEY);
  // While box scores are still loading, re-check every minute instead of every 15.
  const ttl = saved && saved.value.stats.datasetPending > 0 ? MIN : ANALYSIS_TTL;
  const fresh = saved && Date.now() - Date.parse(saved.savedAt) < ttl;
  if (saved && fresh && !opts.force) return { snapshot: saved.value, stale: false };
  try {
    return { snapshot: await buildAnalysis(opts.budgetMs), stale: false };
  } catch (e) {
    if (saved) {
      const snap = { ...saved.value, warnings: [`Refresh failed (${(e as Error).message}); showing analysis from ${saved.savedAt}.`, ...saved.value.warnings] };
      return { snapshot: snap, stale: true };
    }
    throw e;
  }
}

/** Top-ranked props: upcoming games, not negative, max 2 per player. */
export function topProps(props: AnalyzedProp[], n = 20, nowMs = Date.now()): AnalyzedProp[] {
  const perPlayer = new Map<string, number>();
  const out: AnalyzedProp[] = [];
  for (const p of props) {
    if (Date.parse(p.kickoff) <= nowMs) continue;
    if (p.tier === "negative" || p.probEdge <= 0) continue;
    const k = p.player.id ?? p.player.name;
    const c = perPlayer.get(k) ?? 0;
    if (c >= 2) continue;
    perPlayer.set(k, c + 1);
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}
