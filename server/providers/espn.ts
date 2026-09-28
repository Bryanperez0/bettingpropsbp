/**
 * ESPN public site API adapter (no API key).
 *
 * Unofficial/undocumented endpoints used by espn.com. They are widely used
 * but can change without notice — every parser here is defensive, and all
 * ESPN-specific shapes stay inside this file so the provider can be swapped.
 */
import type {
  BoxPlayer, Game, GameBox, GameLines, GameState, InjuryItem, RosterPlayer, StatLine, TeamRef, TeamStatLine,
} from "../../shared/types";
import { fetchJson as rawFetchJson, HttpError, type FetchResult } from "../http";

/** Primary and backup hosts for the same ESPN site API. */
export const ESPN_HOSTS = ["https://site.api.espn.com", "https://site.web.api.espn.com"];
const SITE = `${ESPN_HOSTS[0]}/apis/site/v2/sports/football/nfl`;

/**
 * Fetch from ESPN, falling back to the backup host when the primary refuses
 * (403/429), errors (5xx) or can't be reached. 404s are real "not found".
 */
async function fetchJson<T>(url: string, opts?: { timeoutMs?: number; retries?: number }): Promise<FetchResult<T>> {
  let firstErr: unknown;
  for (const host of ESPN_HOSTS) {
    const u = url.replace(ESPN_HOSTS[0], host);
    try {
      return await rawFetchJson<T>(u, opts);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw e;
      firstErr ??= e;
    }
  }
  throw firstErr;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || v === "--") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const parseAmerican = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "EVEN" || s === "EV") return 100;
  return toNum(s);
};

// ---------------------------------------------------------------------------
// Scoreboard / schedule
// ---------------------------------------------------------------------------

export interface ScoreboardResult {
  season: number;
  seasonType: number;
  week: number;
  games: Game[];
  regularSeasonWeeks: number[];
}

export async function fetchScoreboard(params: { year?: number; seasonType?: number; week?: number } = {}): Promise<ScoreboardResult> {
  const q = new URLSearchParams();
  if (params.year) q.set("dates", String(params.year));
  if (params.seasonType) q.set("seasontype", String(params.seasonType));
  if (params.week) q.set("week", String(params.week));
  q.set("limit", "100");
  const { data } = await fetchJson<Any>(`${SITE}/scoreboard?${q}`);
  return parseScoreboard(data);
}

export function parseScoreboard(data: Any): ScoreboardResult {
  const cal: Any[] = data?.leagues?.[0]?.calendar ?? [];
  const reg = cal.find((c) => String(c.value) === "2");
  const regularSeasonWeeks: number[] = (reg?.entries ?? []).map((e: Any) => Number(e.value)).filter((n: number) => Number.isFinite(n));
  return {
    season: Number(data?.season?.year) || new Date().getFullYear(),
    seasonType: Number(data?.season?.type) || 2,
    week: Number(data?.week?.number) || 1,
    games: (data?.events ?? []).map(parseEvent).filter(Boolean) as Game[],
    regularSeasonWeeks: regularSeasonWeeks.length ? regularSeasonWeeks : Array.from({ length: 18 }, (_, i) => i + 1),
  };
}

function parseTeam(c: Any): TeamRef {
  const t = c?.team ?? {};
  const rec = (type: string) => (c?.records ?? []).find((r: Any) => r.type === type || r.name === type)?.summary ?? null;
  return {
    id: String(t.id ?? c?.id ?? ""),
    abbr: t.abbreviation ?? "",
    name: t.name ?? t.shortDisplayName ?? "",
    displayName: t.displayName ?? "",
    logo: t.logo ?? t.logos?.[0]?.href ?? (t.abbreviation ? `https://a.espncdn.com/i/teamlogos/nfl/500/${String(t.abbreviation).toLowerCase()}.png` : null),
    color: t.color ? `#${t.color}` : null,
    record: rec("total") ?? rec("overall") ?? (c?.record?.[0]?.summary ?? null),
    homeRecord: rec("home"),
    awayRecord: rec("road") ?? rec("away"),
  };
}

export function parseLines(odds: Any | undefined): GameLines {
  const empty: GameLines = {
    provider: null, homeSpread: null, homeSpreadOpen: null, total: null, totalOpen: null,
    homeMoneyline: null, awayMoneyline: null, homeMoneylineOpen: null, awayMoneylineOpen: null, details: null,
  };
  if (!odds) return empty;
  const ps = odds.pointSpread ?? {};
  const ml = odds.moneyline ?? {};
  const tot = odds.total ?? {};
  const homeSpreadClose = toNum(ps.home?.close?.line);
  // `spread` on ESPN is from the home team's perspective in current feeds.
  const homeSpread = homeSpreadClose ?? (odds.homeTeamOdds?.favorite === true && toNum(odds.spread) !== null ? -Math.abs(toNum(odds.spread)!) : toNum(odds.spread));
  const tOpen = toNum(String(tot.over?.open?.line ?? "").replace(/^[ou]/i, ""));
  return {
    provider: odds.provider?.displayName ?? odds.provider?.name ?? null,
    homeSpread,
    homeSpreadOpen: toNum(ps.home?.open?.line),
    total: toNum(odds.overUnder),
    totalOpen: tOpen,
    homeMoneyline: parseAmerican(ml.home?.close?.odds ?? odds.homeTeamOdds?.moneyLine),
    awayMoneyline: parseAmerican(ml.away?.close?.odds ?? odds.awayTeamOdds?.moneyLine),
    homeMoneylineOpen: parseAmerican(ml.home?.open?.odds),
    awayMoneylineOpen: parseAmerican(ml.away?.open?.odds),
    details: odds.details ?? null,
  };
}

export function parseEvent(e: Any): Game | null {
  const c = e?.competitions?.[0];
  if (!c) return null;
  const home = c.competitors?.find((x: Any) => x.homeAway === "home");
  const away = c.competitors?.find((x: Any) => x.homeAway === "away");
  if (!home || !away) return null;
  const state = (e.status?.type?.state ?? c.status?.type?.state ?? "pre") as GameState;
  const w = e.weather;
  return {
    id: String(e.id),
    season: Number(e.season?.year) || 0,
    seasonType: Number(e.season?.type) || 2,
    week: Number(e.week?.number) || 0,
    date: e.date,
    state,
    statusDetail: e.status?.type?.shortDetail ?? e.status?.type?.detail ?? "",
    name: e.name ?? "",
    shortName: e.shortName ?? "",
    home: parseTeam(home),
    away: parseTeam(away),
    homeScore: state === "pre" ? null : toNum(home.score),
    awayScore: state === "pre" ? null : toNum(away.score),
    venue: {
      name: c.venue?.fullName ?? null,
      city: c.venue?.address?.city ?? null,
      state: c.venue?.address?.state ?? null,
      country: c.venue?.address?.country ?? null,
      indoor: typeof c.venue?.indoor === "boolean" ? c.venue.indoor : null,
    },
    neutralSite: !!c.neutralSite,
    lines: parseLines(c.odds?.[0]),
    // ESPN's own weather blurb (no wind). Open-Meteo fills in details later.
    weather: w
      ? {
          status: "live", indoor: typeof c.venue?.indoor === "boolean" ? c.venue.indoor : null, source: "ESPN",
          fetchedAt: null, tempF: toNum(w.temperature), windMph: null, windGustMph: null, precipProb: null,
          conditions: w.displayValue ?? null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Game summary -> compact box score + injuries
// ---------------------------------------------------------------------------

const emptyLine = (): StatLine => ({
  passCmp: 0, passAtt: 0, passYds: 0, passTD: 0, passInt: 0, sacks: 0,
  rushAtt: 0, rushYds: 0, rushTD: 0, rushLong: 0,
  rec: 0, recYds: 0, recTD: 0, recLong: 0, targets: 0,
});

function statByKey(cat: Any, stats: string[], key: string): string | undefined {
  const idx = (cat.keys ?? []).indexOf(key);
  return idx >= 0 ? stats[idx] : undefined;
}

export interface SummaryResult {
  box: GameBox | null;
  injuries: InjuryItem[];
  completed: boolean;
}

export async function fetchSummary(gameId: string): Promise<SummaryResult> {
  const { data } = await fetchJson<Any>(`${SITE}/summary?event=${encodeURIComponent(gameId)}`, { timeoutMs: 9000 });
  return parseSummary(gameId, data);
}

export function parseSummary(gameId: string, s: Any): SummaryResult {
  const comp = s?.header?.competitions?.[0];
  const completed = !!comp?.status?.type?.completed;
  const injuries = parseSummaryInjuries(s);
  if (!comp || !s?.boxscore?.players?.length) return { box: null, injuries, completed };

  const byTeamId: Record<string, { abbr: string; score: number; home: boolean }> = {};
  for (const c of comp.competitors ?? []) {
    byTeamId[String(c.team?.id ?? c.id)] = { abbr: c.team?.abbreviation, score: toNum(c.score) ?? 0, home: c.homeAway === "home" };
  }

  const players = new Map<string, BoxPlayer>();
  const teamTotals: Record<string, TeamStatLine> = {};
  for (const t of s.boxscore.players) {
    const abbr = t.team?.abbreviation;
    for (const cat of t.statistics ?? []) {
      for (const a of cat.athletes ?? []) {
        const id = String(a.athlete?.id ?? "");
        if (!id) continue;
        let p = players.get(id);
        if (!p) {
          p = { id, name: a.athlete.displayName, team: abbr, headshot: a.athlete.headshot?.href, stats: emptyLine() };
          players.set(id, p);
        }
        const st: string[] = a.stats ?? [];
        const g = (k: string) => toNum(statByKey(cat, st, k)) ?? 0;
        if (cat.name === "passing") {
          const ca = (statByKey(cat, st, "completions/passingAttempts") ?? "0/0").split("/");
          p.stats.passCmp = toNum(ca[0]) ?? 0;
          p.stats.passAtt = toNum(ca[1]) ?? 0;
          p.stats.passYds = g("passingYards");
          p.stats.passTD = g("passingTouchdowns");
          p.stats.passInt = g("interceptions");
          p.stats.sacks = toNum((statByKey(cat, st, "sacks-sackYardsLost") ?? "0-0").split("-")[0]) ?? 0;
        } else if (cat.name === "rushing") {
          p.stats.rushAtt = g("rushingAttempts");
          p.stats.rushYds = g("rushingYards");
          p.stats.rushTD = g("rushingTouchdowns");
          p.stats.rushLong = g("longRushing");
        } else if (cat.name === "receiving") {
          p.stats.rec = g("receptions");
          p.stats.recYds = g("receivingYards");
          p.stats.recTD = g("receivingTouchdowns");
          p.stats.recLong = g("longReception");
          p.stats.targets = g("receivingTargets");
        }
      }
    }
  }

  const teamStat = (teamAbbr: string): TeamStatLine => {
    const bt = (s.boxscore.teams ?? []).find((x: Any) => x.team?.abbreviation === teamAbbr);
    const get = (n: string) => bt?.statistics?.find((x: Any) => x.name === n)?.displayValue as string | undefined;
    const rz = (get("redZoneAttempts") ?? "").split("-");
    const sk = (get("sacksYardsLost") ?? "").split("-");
    const mine = [...players.values()].filter((p) => p.team === teamAbbr);
    const sumOf = (f: (x: StatLine) => number) => mine.reduce((a, p) => a + f(p.stats), 0);
    const score = Object.values(byTeamId).find((x) => x.abbr === teamAbbr)?.score ?? 0;
    return {
      points: score,
      passCmp: sumOf((x) => x.passCmp), passAtt: sumOf((x) => x.passAtt), passYds: sumOf((x) => x.passYds),
      passTD: sumOf((x) => x.passTD), passInt: sumOf((x) => x.passInt),
      sacks: toNum(sk[0]) ?? sumOf((x) => x.sacks),
      rushAtt: sumOf((x) => x.rushAtt), rushYds: sumOf((x) => x.rushYds), rushTD: sumOf((x) => x.rushTD),
      targets: sumOf((x) => x.targets),
      totalYards: toNum(get("totalYards")),
      plays: toNum(get("totalOffensivePlays")),
      redZoneTDs: rz.length === 2 ? toNum(rz[0]) : null,
      redZoneTrips: rz.length === 2 ? toNum(rz[1]) : null,
    };
  };

  const teams = Object.entries(byTeamId);
  const h = teams.find(([, v]) => v.home);
  const a = teams.find(([, v]) => !v.home);
  if (!h || !a) return { box: null, injuries, completed };
  for (const [, v] of teams) teamTotals[v.abbr] = teamStat(v.abbr);

  const box: GameBox = {
    gameId,
    season: Number(s.header?.season?.year) || 0,
    seasonType: Number(s.header?.season?.type) || 2,
    week: Number(s.header?.week) || 0,
    date: comp.date,
    home: { teamId: h[0], abbr: h[1].abbr, score: h[1].score, stats: teamTotals[h[1].abbr] },
    away: { teamId: a[0], abbr: a[1].abbr, score: a[1].score, stats: teamTotals[a[1].abbr] },
    players: [...players.values()],
  };
  return { box, injuries, completed };
}

function athleteId(a: Any): string {
  if (a?.id) return String(a.id);
  const href: string = a?.links?.[0]?.href ?? "";
  const m = href.match(/\/id\/(\d+)/) ?? String(a?.uid ?? "").match(/a:(\d+)/);
  return m ? m[1] : "";
}

function parseInjury(i: Any, team: string): InjuryItem | null {
  const a = i?.athlete;
  if (!a) return null;
  const d = i.details ?? {};
  return {
    playerId: athleteId(a),
    name: a.displayName ?? a.fullName ?? "Unknown",
    team: team || a.team?.abbreviation || "",
    position: a.position?.abbreviation ?? null,
    status: i.status ?? i.type?.description ?? "Unknown",
    injury: [d.side && d.side !== "Not Specified" ? d.side : null, d.type].filter(Boolean).join(" ") || null,
    detail: d.detail && d.detail !== "Not Specified" ? d.detail : null,
    returnDate: d.returnDate ?? null,
    updated: i.date ?? null,
    comment: i.shortComment ?? i.longComment ?? null,
    headshot: a.headshot?.href ?? null,
  };
}

export function parseSummaryInjuries(s: Any): InjuryItem[] {
  const out: InjuryItem[] = [];
  for (const t of s?.injuries ?? []) {
    const abbr = t.team?.abbreviation ?? "";
    for (const i of t.injuries ?? []) {
      const it = parseInjury(i, abbr);
      if (it) out.push(it);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// League-wide injuries (supplement; shape parsed defensively)
// ---------------------------------------------------------------------------

export async function fetchLeagueInjuries(teamAbbrByName: Record<string, string>): Promise<InjuryItem[]> {
  const { data } = await fetchJson<Any>(`${SITE}/injuries`);
  const out: InjuryItem[] = [];
  for (const group of data?.injuries ?? []) {
    const abbr = group.team?.abbreviation ?? teamAbbrByName[group.displayName] ?? "";
    for (const i of group.injuries ?? []) {
      const it = parseInjury(i, abbr || i.athlete?.team?.abbreviation || "");
      if (it) out.push(it);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Teams and rosters
// ---------------------------------------------------------------------------

export interface TeamListItem {
  id: string;
  abbr: string;
  displayName: string;
  logo: string | null;
  color: string | null;
}

export async function fetchTeams(): Promise<TeamListItem[]> {
  const { data } = await fetchJson<Any>(`${SITE}/teams`);
  const teams: Any[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map(({ team: t }) => ({
    id: String(t.id),
    abbr: t.abbreviation,
    displayName: t.displayName,
    logo: t.logos?.[0]?.href ?? null,
    color: t.color ? `#${t.color}` : null,
  }));
}

export async function fetchRoster(teamId: string, teamAbbr: string): Promise<RosterPlayer[]> {
  const { data } = await fetchJson<Any>(`${SITE}/teams/${teamId}/roster`);
  return parseRoster(data, teamId, teamAbbr);
}

export function parseRoster(data: Any, teamId: string, teamAbbr: string): RosterPlayer[] {
  const out: RosterPlayer[] = [];
  for (const g of data?.athletes ?? []) {
    for (const a of g.items ?? []) {
      out.push({
        id: String(a.id),
        name: a.fullName ?? a.displayName,
        team: teamAbbr,
        teamId,
        position: typeof a.position === "string" ? a.position : a.position?.abbreviation ?? "",
        jersey: a.jersey ?? null,
        headshot: a.headshot?.href ?? null,
        status: a.status?.name ?? null,
        group: g.position ?? "",
      });
    }
  }
  return out;
}
