import type { AnalyzedProp, Game, GameBox, InjuryItem, RosterPlayer, SeasonDataset, SourceMeta } from "../../shared/types";
import { analyzeProp, isActionable } from "../../shared/model/engine";
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
import { recordHistory } from "./history";

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
  stats: { linesFound: number; analyzed: number; unmatched: number; teamBets?: number; excludedInjured: number; insufficientData: number; datasetPending: number };
  /** Completeness of this build's inputs; an incomplete build never replaces a complete one.
   *  rosterTeamsMissing counts only teams in games not yet played. */
  quality: SnapshotQuality;
}

export interface SnapshotQuality {
  datasetPending: number;
  rosterTeamsMissing: number;
  injuriesOk: boolean;
}

export const isComplete = (q: SnapshotQuality | undefined) => !!q && q.datasetPending === 0 && q.rosterTeamsMissing === 0 && q.injuriesOk;

const SNAPSHOT_KEY = "analysis/current";
const ATTEMPT_KEY = "analysis/last-attempt";
const frozenKey = (gameId: string) => `frozen/${gameId}`;
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

/**
 * Team-defense bets ("Chicago Bears D/ST", "Philadelphia Eagles Defense") are
 * listed like players by some books. They aren't player props, so they're
 * skipped without counting as unmatched names.
 */
export function isTeamBet(name: string, game: Game): boolean {
  if (/\b(d\/st|dst|defen[cs]e|special teams)\b/i.test(name)) return true;
  const n = name.trim().toLowerCase();
  return [game.home, game.away].some((t) => n === t.displayName.toLowerCase() || n === t.name.toLowerCase());
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
  return { cfg, slate, cur, prior, rosters, inputs, pending, injuriesOk: iMeta.status !== "unavailable" };
}

export async function buildAnalysis(budgetMs = 20_000): Promise<AnalysisSnapshot> {
  // Box-score ingestion gets half the budget; rosters/injuries/odds get the rest.
  const datasetDeadline = Date.now() + budgetMs * 0.5;
  const deadline = Date.now() + budgetMs;
  const warnings: string[] = [];
  const sources: SourceMeta[] = [];
  const now = new Date().toISOString();
  const { cfg, slate, cur, prior, rosters, inputs, pending, injuriesOk } = await loadModelInputs(datasetDeadline, deadline, warnings, sources);

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

  const stats = { linesFound: lines.groups.length, analyzed: 0, unmatched: 0, teamBets: 0, excludedInjured: 0, insufficientData: 0, datasetPending: pending };
  const props: AnalyzedProp[] = [];
  const unmatchedNames: string[] = [];
  const gameById = new Map(games.map((g) => [g.id, g]));

  for (const line of lines.groups) {
    const game = gameById.get(line.gameId);
    if (!game) continue;
    if (isTeamBet(line.playerName, game)) { stats.teamBets++; continue; }
    const rp = line.playerId ? rosters.players.find((p) => p.id === line.playerId) ?? null : resolvePlayer(line.playerName, game, rosters.players);
    if (!rp) { stats.unmatched++; if (!unmatchedNames.includes(line.playerName)) unmatchedNames.push(line.playerName); continue; }
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
  if (unmatchedNames.length) {
    warnings.push(`Skipped ${unmatchedNames.length} sportsbook player name${unmatchedNames.length === 1 ? "" : "s"} not found on either team's ESPN roster (usually practice-squad or inactive players): ${unmatchedNames.join(", ")}.`);
  }

  // Only games still to be played need rosters for this week's props.
  const slateTeams = new Set(games.filter((g) => g.state !== "post").flatMap((g) => [g.home.abbr, g.away.abbr]));
  const rosterTeams = new Set(rosters.players.map((p) => p.team));
  const quality: SnapshotQuality = {
    datasetPending: pending,
    rosterTeamsMissing: [...slateTeams].filter((t) => !rosterTeams.has(t)).length,
    injuriesOk,
  };

  // Freeze each upcoming game's pregame analysis (complete builds only), and
  // bring it back once the game has started so props don't vanish at kickoff.
  for (const g of games) {
    const gp = props.filter((p) => p.gameId === g.id);
    if (g.state === "pre" && gp.length && isComplete(quality)) await writeJSON(frozenKey(g.id), gp);
  }
  for (const g of games.filter((x) => x.state !== "pre")) {
    const f = await readJSON<AnalyzedProp[]>(frozenKey(g.id));
    if (f && !props.some((p) => p.gameId === g.id)) {
      props.push(...f.value.map((p) => ({ ...p, frozen: { state: g.state, frozenAt: f.savedAt } })));
    }
  }

  props.sort((a, b) => b.confidence.total - a.confidence.total || b.probEdge - a.probEdge);

  // After kickoff no new lines are fetched; say that plainly instead of "unavailable".
  const frozenProps = props.filter((p) => p.frozen);
  const propsMeta = sources.find((x) => x.key === "props");
  if (propsMeta && propsMeta.status === "unavailable" && frozenProps.length && !props.some((p) => !p.frozen)) {
    propsMeta.status = "cached";
    propsMeta.fetchedAt = frozenProps.map((p) => p.frozen!.frozenAt).sort()[0];
    propsMeta.note = `Games have started: showing ${frozenProps.length} pregame lines frozen at kickoff`;
  }

  const snapshot: AnalysisSnapshot = {
    generatedAt: now, season: slate.season, seasonType: slate.seasonType, week: slate.week,
    games, props, injuries: inputs.injuries, sources, warnings, stats, quality,
  };

  // Keep last good data: an incomplete build never replaces a complete
  // analysis of the same week that is less than 3 hours old.
  const saved = await readJSON<AnalysisSnapshot>(SNAPSHOT_KEY);
  if (!isComplete(quality) && saved && isComplete(saved.value.quality) && saved.value.week === snapshot.week &&
      saved.value.season === snapshot.season && Date.now() - Date.parse(saved.savedAt) < 3 * 60 * MIN) {
    const missing = [
      quality.datasetPending ? `${quality.datasetPending} box scores` : "",
      quality.rosterTeamsMissing ? `${quality.rosterTeamsMissing} team rosters` : "",
      quality.injuriesOk ? "" : "injury reports",
    ].filter(Boolean).join(", ");
    await gradeSafely([cur.dataset, ...(prior ? [prior] : [])]);
    return { ...saved.value, warnings: [`Latest refresh came back incomplete (missing ${missing}); showing the last complete analysis instead.`, ...saved.value.warnings] };
  }

  await writeJSON(SNAPSHOT_KEY, snapshot);

  // Only complete builds feed score history and the performance ledger.
  if (isComplete(quality)) {
    try {
      await recordHistory(props.filter((p) => !p.frozen), now);
      await recordPicks(props, now);
    } catch (e) {
      console.warn("history/tracking failed", e);
    }
  }
  await gradeSafely([cur.dataset, ...(prior ? [prior] : [])]);
  return snapshot;
}

async function gradeSafely(datasets: SeasonDataset[]) {
  try {
    await gradePicks(datasets);
  } catch (e) {
    console.warn("grading failed", e);
  }
}

/** Latest snapshot; rebuilds when older than ANALYSIS_TTL. Falls back to stale data on failure. */
export async function getAnalysis(opts: { force?: boolean; budgetMs?: number } = {}): Promise<{ snapshot: AnalysisSnapshot; stale: boolean }> {
  const saved = await readJSON<AnalysisSnapshot>(SNAPSHOT_KEY);
  // While box scores are still loading, re-check every minute instead of every 15.
  const ttl = saved && saved.value.stats.datasetPending > 0 ? MIN : ANALYSIS_TTL;
  const fresh = saved && Date.now() - Date.parse(saved.savedAt) < ttl;
  if (saved && fresh && !opts.force) return { snapshot: saved.value, stale: false };
  // Avoid rebuilding on every request while a refresh keeps coming back incomplete.
  const lastAttempt = await readJSON<string>(ATTEMPT_KEY);
  if (saved && !opts.force && lastAttempt && Date.now() - Date.parse(lastAttempt.savedAt) < MIN) {
    return { snapshot: saved.value, stale: false };
  }
  await writeJSON(ATTEMPT_KEY, "attempt");
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
export const hasStarted = (p: Pick<AnalyzedProp, "kickoff" | "frozen">, nowMs = Date.now()) =>
  !!p.frozen || Date.parse(p.kickoff) <= nowMs;

function rankTop(props: AnalyzedProp[], n: number): AnalyzedProp[] {
  const perPlayer = new Map<string, number>();
  const out: AnalyzedProp[] = [];
  for (const p of props) {
    if (p.tier === "negative" || p.probEdge <= 0) continue;
    if (!isActionable(p)) continue; // e.g. anytime-TD "No" that no book offers
    const k = p.player.id ?? p.player.name;
    const c = perPlayer.get(k) ?? 0;
    if (c >= 2) continue;
    perPlayer.set(k, c + 1);
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Top-ranked props: up to n on games that haven't started, followed by up to
 * n from games in progress or final (their frozen pregame analysis).
 * Positive edge only, max 2 per player.
 */
export function topProps(props: AnalyzedProp[], n = 20, nowMs = Date.now()): AnalyzedProp[] {
  const upcoming = rankTop(props.filter((p) => !hasStarted(p, nowMs)), n);
  const started = rankTop(props.filter((p) => hasStarted(p, nowMs)), n);
  return [...upcoming, ...started];
}
