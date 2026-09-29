/**
 * SportsGameOdds adapter (https://sportsgameodds.com). Requires
 * SPORTSGAMEODDS_API_KEY. Usage is billed per event ("object") returned, not
 * per market, so one request returns every player prop for every game in the
 * window. The key is sent in the x-api-key header, never in a URL.
 */
import type { PropMarket } from "../../shared/types";
import { fetchJson } from "../http";
import type { RawPropQuote } from "./oddsApi";

const BASE = "https://api.sportsgameodds.com/v2";

/** SportsGameOdds statID -> this app's market. Anytime TD is the yes/no "touchdowns" market. */
export const SGO_STATS: Record<string, PropMarket> = {
  passing_yards: "pass_yds",
  passing_touchdowns: "pass_tds",
  passing_completions: "pass_completions",
  passing_attempts: "pass_attempts",
  rushing_yards: "rush_yds",
  rushing_attempts: "rush_attempts",
  receiving_yards: "rec_yds",
  receiving_receptions: "receptions",
  receiving_longestReception: "rec_longest",
  touchdowns: "anytime_td",
};

/**
 * Pick'em apps and prediction markets price props differently from
 * sportsbooks (fixed payouts, exchange prices), so they are left out of the
 * consensus line and price.
 */
export const EXCLUDED_BOOKS = new Set(["prizepicks", "underdog", "kalshi", "polymarket", "sleeper", "betr", "dabble", "parlayplay", "pick6", "unknown"]);

const BOOK_TITLES: Record<string, string> = {
  draftkings: "DraftKings", fanduel: "FanDuel", betmgm: "BetMGM", caesars: "Caesars", pinnacle: "Pinnacle",
  bet365: "bet365", espnbet: "ESPN BET", fanatics: "Fanatics", betrivers: "BetRivers", bovada: "Bovada",
  hardrockbet: "Hard Rock Bet", ballybet: "Bally Bet", betonline: "BetOnline", williamhill: "William Hill",
  fliff: "Fliff", unibet: "Unibet", circa: "Circa", mybookie: "MyBookie", betparx: "betPARX", lowvig: "LowVig",
};
const titleOf = (id: string) => BOOK_TITLES[id] ?? id.replace(/^./, (c) => c.toUpperCase());

interface SgoBookOdds { odds?: string; overUnder?: string; available?: boolean; lastUpdatedAt?: string; isMainLine?: boolean }
interface SgoOdd {
  oddID?: string; statID?: string; statEntityID?: string; playerID?: string; periodID?: string;
  betTypeID?: string; sideID?: string; byBookmaker?: Record<string, SgoBookOdds>;
}
interface SgoTeam { teamID?: string; names?: { long?: string; medium?: string; short?: string } }
export interface SgoEvent {
  eventID?: string;
  status?: { startsAt?: string; started?: boolean; finalized?: boolean };
  teams?: { home?: SgoTeam; away?: SgoTeam };
  players?: Record<string, { name?: string; firstName?: string; lastName?: string; teamID?: string }>;
  odds?: Record<string, SgoOdd>;
}
interface SgoPage { success?: boolean; data?: SgoEvent[]; nextCursor?: string | null; error?: string }

/** A game from SportsGameOdds with its quotes already in the app's format. */
export interface SgoGame {
  eventID: string;
  startsAt: string | null;
  home: string[];
  away: string[];
  quotes: RawPropQuote[];
}

/** Every oddID the app asks for (both sides; PLAYER_ID is SportsGameOdds' wildcard). */
export const SGO_ODD_IDS = Object.keys(SGO_STATS).flatMap((stat) =>
  stat === "touchdowns" ? [`${stat}-PLAYER_ID-game-yn-yes`, `${stat}-PLAYER_ID-game-yn-no`]
    : [`${stat}-PLAYER_ID-game-ou-over`, `${stat}-PLAYER_ID-game-ou-under`]);

/** "DEVONTA_SMITH_1_NFL" -> "Devonta Smith" (only used if the event has no player name). */
function nameFromId(id: string) {
  return id.replace(/_\d+_NFL$/, "").replace(/_NFL$/, "").split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

const price = (s: string | undefined) => {
  const n = Number(s);
  return s !== undefined && s !== "" && Number.isFinite(n) ? n : null;
};

/** Names a team can go by, used to match SportsGameOdds events to ESPN games. */
function teamNames(t: SgoTeam | undefined): string[] {
  if (!t) return [];
  const fromId = t.teamID ? t.teamID.replace(/_NFL$/, "").replace(/_/g, " ") : "";
  return [t.names?.long, t.names?.medium, t.names?.short, fromId].filter((x): x is string => !!x);
}

export function parseSgoEvent(ev: SgoEvent): SgoGame | null {
  if (!ev.eventID) return null;
  const books = new Map<string, { playerName: string; market: PropMarket; book: string; line: number | null; over: number | null; under: number | null; lastUpdate: string | null }>();
  for (const odd of Object.values(ev.odds ?? {})) {
    const market = odd.statID ? SGO_STATS[odd.statID] : undefined;
    if (!market || odd.periodID !== "game") continue;
    if (market === "anytime_td" ? odd.betTypeID !== "yn" : odd.betTypeID !== "ou") continue;
    const player = odd.playerID ?? odd.statEntityID;
    if (!player || ["all", "home", "away"].includes(player)) continue;
    const p = ev.players?.[player];
    const playerName = p?.name?.trim() || [p?.firstName, p?.lastName].filter(Boolean).join(" ").trim() || nameFromId(player);
    const isOver = odd.sideID === "over" || odd.sideID === "yes";
    const isUnder = odd.sideID === "under" || odd.sideID === "no";
    if (!isOver && !isUnder) continue;
    for (const [bookId, b] of Object.entries(odd.byBookmaker ?? {})) {
      if (EXCLUDED_BOOKS.has(bookId) || b.available === false || b.isMainLine === false) continue;
      const line = market === "anytime_td" ? null : price(b.overUnder);
      if (market !== "anytime_td" && line === null) continue;
      const key = `${player}|${market}|${bookId}|${line ?? ""}`;
      const g = books.get(key) ?? { playerName, market, book: bookId, line, over: null, under: null, lastUpdate: null };
      if (isOver) g.over = price(b.odds);
      else g.under = price(b.odds);
      if (b.lastUpdatedAt && (!g.lastUpdate || b.lastUpdatedAt > g.lastUpdate)) g.lastUpdate = b.lastUpdatedAt;
      books.set(key, g);
    }
  }
  const quotes: RawPropQuote[] = [...books.values()]
    .filter((g) => g.over !== null || g.under !== null)
    .map((g) => ({
      playerName: g.playerName,
      market: g.market,
      book: { book: g.book, bookTitle: titleOf(g.book), line: g.line, overPrice: g.over, underPrice: g.under, lastUpdate: g.lastUpdate },
    }));
  return {
    eventID: ev.eventID,
    startsAt: ev.status?.startsAt ?? null,
    home: teamNames(ev.teams?.home),
    away: teamNames(ev.teams?.away),
    quotes,
  };
}

/**
 * Fetches all upcoming NFL events with player props that start before
 * `startsBefore`. Returns the games and how many events (billed objects) came back.
 */
export async function fetchSgoSlate(apiKey: string, startsBefore: Date): Promise<{ games: SgoGame[]; objects: number }> {
  const games: SgoGame[] = [];
  let objects = 0;
  let cursor: string | null = null;
  // Free plan: 10 requests/minute. A normal NFL week fits in one page.
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      leagueID: "NFL",
      oddsAvailable: "true",
      startsAfter: new Date().toISOString(),
      startsBefore: startsBefore.toISOString(),
      oddID: SGO_ODD_IDS.join(","),
      limit: "50",
    });
    if (cursor) q.set("cursor", cursor);
    const { data } = await fetchJson<SgoPage>(`${BASE}/events?${q}`, { timeoutMs: 15000, headers: { "x-api-key": apiKey } });
    if (data.success === false) throw new Error(`SportsGameOdds: ${data.error ?? "request failed"}`);
    const events = data.data ?? [];
    objects += events.length;
    for (const ev of events) {
      const g = parseSgoEvent(ev);
      if (g) games.push(g);
    }
    cursor = data.nextCursor ?? null;
    if (!cursor || !events.length) break;
  }
  return { games, objects };
}

export interface SgoUsage { tier: string | null; active: boolean | null; monthUsed: number | null; monthMax: number | null }

/** Plan and monthly object usage from /account/usage. */
export async function fetchSgoUsage(apiKey: string): Promise<SgoUsage> {
  const { data } = await fetchJson<{ data?: { tier?: string; isActive?: boolean; rateLimits?: Record<string, { "current-entities"?: number; "max-entities"?: number | "unlimited" }> } }>(
    `${BASE}/account/usage`, { headers: { "x-api-key": apiKey } });
  const month = data.data?.rateLimits?.["per-month"];
  return {
    tier: data.data?.tier ?? null,
    active: data.data?.isActive ?? null,
    monthUsed: month?.["current-entities"] ?? null,
    monthMax: typeof month?.["max-entities"] === "number" ? month["max-entities"] : null,
  };
}
