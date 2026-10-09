/**
 * The Odds API adapter (https://the-odds-api.com). Requires ODDS_API_KEY.
 * Player props are only available one event at a time from the event-odds
 * endpoint; each call costs (markets returned x regions) credits.
 */
import { isValidAmericanOdds } from "../../shared/model/stats";
import type { BookLine, PropMarket } from "../../shared/types";
import { marketFromOddsKey } from "../../shared/model/markets";
import { fetchJson } from "../http";

const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";

export interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export interface Quota {
  remaining: number | null;
  used: number | null;
  last: number | null;
}

interface RawOutcome { name: string; description?: string; price: number; point?: number }
interface RawMarket { key: string; last_update?: string; outcomes: RawOutcome[] }
interface RawBook { key: string; title: string; last_update?: string; markets: RawMarket[] }
interface RawEventOdds extends OddsEvent { bookmakers: RawBook[] }

/** One raw quote before grouping: a player/market/book with over+under prices. */
export interface RawPropQuote {
  playerName: string;
  market: PropMarket;
  book: BookLine;
}

const quota = (h: Headers): Quota => ({
  remaining: h.get("x-requests-remaining") !== null ? Number(h.get("x-requests-remaining")) : null,
  used: h.get("x-requests-used") !== null ? Number(h.get("x-requests-used")) : null,
  last: h.get("x-requests-last") !== null ? Number(h.get("x-requests-last")) : null,
});

/** Lists upcoming NFL events (does not cost credits per The Odds API docs). */
export async function fetchOddsEvents(apiKey: string): Promise<{ events: OddsEvent[]; quota: Quota }> {
  const { data, headers } = await fetchJson<OddsEvent[]>(`${BASE}/events?apiKey=${encodeURIComponent(apiKey)}&dateFormat=iso`);
  return { events: data, quota: quota(headers) };
}

export async function fetchEventProps(
  apiKey: string,
  eventId: string,
  opts: { markets: string[]; regions: string; bookmakers: string[] },
): Promise<{ quotes: RawPropQuote[]; quota: Quota }> {
  const q = new URLSearchParams({
    apiKey,
    markets: opts.markets.join(","),
    oddsFormat: "american",
    dateFormat: "iso",
  });
  // `bookmakers` overrides `regions` in The Odds API; send one or the other.
  if (opts.bookmakers.length) q.set("bookmakers", opts.bookmakers.join(","));
  else q.set("regions", opts.regions);
  const { data, headers } = await fetchJson<RawEventOdds>(`${BASE}/events/${encodeURIComponent(eventId)}/odds?${q}`, { timeoutMs: 9000 });
  return { quotes: parseEventProps(data), quota: quota(headers) };
}

export function parseEventProps(data: RawEventOdds): RawPropQuote[] {
  const out: RawPropQuote[] = [];
  for (const b of data?.bookmakers ?? []) {
    for (const m of b.markets ?? []) {
      const market = marketFromOddsKey(m.key);
      if (!market) continue;
      // Group outcomes by player (+ point, since some books list multiple lines).
      const groups = new Map<string, { player: string; point: number | null; over: number | null; under: number | null }>();
      for (const o of m.outcomes ?? []) {
        const player = (o.description ?? "").trim();
        if (!player) continue;
        const point = typeof o.point === "number" ? o.point : null;
        const key = `${player}|${point ?? ""}`;
        const g = groups.get(key) ?? { player, point, over: null, under: null };
        const name = o.name.toLowerCase();
        const p = isValidAmericanOdds(o.price) ? o.price : null;
        if (name === "over" || name === "yes") g.over = p;
        else if (name === "under" || name === "no") g.under = p;
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        out.push({
          playerName: g.player,
          market,
          book: { book: b.key, bookTitle: b.title, line: g.point, overPrice: g.over, underPrice: g.under, lastUpdate: m.last_update ?? b.last_update ?? null },
        });
      }
    }
  }
  return out;
}
