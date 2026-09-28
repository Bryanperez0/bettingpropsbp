import type { BookLine, Game, PropLineGroup, PropMarket, SeasonDataset, SourceMeta, RosterPlayer } from "../../shared/types";
import { fetchEventProps, fetchOddsEvents, type OddsEvent, type Quota, type RawPropQuote } from "../providers/oddsApi";
import { cached, readJSON, writeJSON, MIN } from "../cache";
import { mapLimit } from "../http";
import type { AppConfig } from "../config";
import { buildPlayerLogs } from "../../shared/model/league";
import { MARKETS, positionGroup } from "../../shared/model/markets";
import { median, sum } from "../../shared/model/stats";

export interface PropLinesResult {
  groups: PropLineGroup[];
  meta: SourceMeta;
  quota: Quota | null;
  warnings: string[];
}

const matchEvent = (g: Game, events: OddsEvent[]) =>
  events.find((e) => e.home_team === g.home.displayName && e.away_team === g.away.displayName && Math.abs(Date.parse(e.commence_time) - Date.parse(g.date)) < 18 * 3600_000) ??
  events.find((e) => e.home_team === g.home.displayName && e.away_team === g.away.displayName);

/** Most common line across books (ties -> median). */
export function consensusLine(lines: number[]): number | null {
  if (!lines.length) return null;
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([l]) => l);
  if (top.length === 1) return top[0];
  const m = median(top)!;
  return top.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
}

/** Group raw book quotes into one entry per player+market. */
export function groupQuotes(gameId: string, quotes: RawPropQuote[], fetchedAt: string): PropLineGroup[] {
  const byKey = new Map<string, { playerName: string; market: PropMarket; books: BookLine[] }>();
  for (const q of quotes) {
    const key = `${q.playerName}|${q.market}`;
    const g = byKey.get(key) ?? { playerName: q.playerName, market: q.market, books: [] };
    g.books.push(q.book);
    byKey.set(key, g);
  }
  const out: PropLineGroup[] = [];
  for (const g of byKey.values()) {
    const isTd = g.market === "anytime_td";
    // Anytime TD has no point; for O/U markets drop alternate-style duplicates by using the consensus line.
    const line = isTd ? 0.5 : consensusLine(g.books.map((b) => b.line).filter((x): x is number => x !== null));
    if (line === null) continue;
    const atLine = isTd ? g.books : g.books.filter((b) => b.line === line);
    const med = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? Math.round(median(v)!) : null;
    };
    out.push({
      gameId, playerName: g.playerName, playerId: null, team: null, market: g.market, line,
      overPrice: med(atLine.map((b) => b.overPrice)),
      underPrice: med(atLine.map((b) => b.underPrice)),
      books: g.books.sort((a, b) => a.bookTitle.localeCompare(b.bookTitle)),
      source: "sportsbook", fetchedAt, firstSeen: null,
    });
  }
  return out;
}

type FirstSeenMap = Record<string, NonNullable<PropLineGroup["firstSeen"]>>;

/** Record the first line this app observed per player/market (not a true opener). */
async function applyFirstSeen(gameId: string, groups: PropLineGroup[]) {
  const key = `odds/firstseen/${gameId}`;
  const map: FirstSeenMap = (await readJSON<FirstSeenMap>(key))?.value ?? {};
  let changed = false;
  for (const g of groups) {
    const k = `${g.playerName}|${g.market}`;
    if (!map[k]) {
      map[k] = { line: g.line, overPrice: g.overPrice, underPrice: g.underPrice, at: g.fetchedAt };
      changed = true;
    }
    g.firstSeen = map[k];
  }
  if (changed) await writeJSON(key, map);
}

export async function getPropLines(
  games: Game[],
  cfg: AppConfig,
  deadline: number,
  demoInputs?: { datasets: SeasonDataset[]; roster: RosterPlayer[] },
): Promise<PropLinesResult> {
  const warnings: string[] = [];
  const now = Date.now();
  const upcoming = games.filter((g) => g.state === "pre" && Date.parse(g.date) - now < cfg.oddsLookaheadHours * 3600_000);

  if (!cfg.oddsApiKey) {
    if (cfg.demoPropLines && demoInputs) {
      const groups = buildDemoLines(upcoming, demoInputs.datasets, demoInputs.roster);
      return {
        groups, quota: null,
        warnings: ["DEMO LINES: no sportsbook data. Lines are the player's recent median, not real odds, and are never tracked."],
        meta: { key: "props", label: "Player prop lines", provider: "Demo (player medians)", status: "mock", fetchedAt: new Date().toISOString(), note: "ODDS_API_KEY not set — DEMO_PROP_LINES=true" },
      };
    }
    return {
      groups: [], quota: null,
      warnings: ["Player prop lines unavailable: ODDS_API_KEY is not configured on the server."],
      meta: { key: "props", label: "Player prop lines", provider: "The Odds API", status: "unavailable", fetchedAt: null, note: "Add ODDS_API_KEY in Netlify environment variables" },
    };
  }

  let quota: Quota | null = null;
  let events: OddsEvent[] = [];
  try {
    const ev = await cached("odds/events", 60 * MIN, async () => {
      const r = await fetchOddsEvents(cfg.oddsApiKey);
      return r.events;
    });
    events = ev.data;
  } catch (e) {
    warnings.push(`The Odds API events request failed: ${(e as Error).message}`);
  }

  const groups: PropLineGroup[] = [];
  let oldest: string | null = null;
  let anyLive = false;
  let failed = 0;
  await mapLimit(upcoming, 4, async (g) => {
    const ev = matchEvent(g, events);
    if (!ev) return;
    try {
      const r = await cached(`odds/props/${g.id}`, cfg.oddsCacheMinutes * MIN, async () => {
        const res = await fetchEventProps(cfg.oddsApiKey, ev.id, { markets: cfg.oddsMarkets, regions: cfg.oddsRegions, bookmakers: cfg.oddsBookmakers });
        quota = res.quota;
        return res.quotes;
      });
      if (!r.fromCache) anyLive = true;
      if (!oldest || r.fetchedAt < oldest) oldest = r.fetchedAt;
      const gs = groupQuotes(g.id, r.data, r.fetchedAt);
      await applyFirstSeen(g.id, gs);
      groups.push(...gs);
    } catch (e) {
      failed++;
      warnings.push(`Props for ${g.shortName} unavailable: ${(e as Error).message}`);
    }
  }, deadline);

  if (upcoming.length && !events.length) warnings.push("No matching events returned by The Odds API.");
  return {
    groups,
    quota,
    warnings,
    meta: {
      key: "props", label: "Player prop lines", provider: "The Odds API",
      status: groups.length ? (anyLive ? "live" : "cached") : "unavailable",
      fetchedAt: oldest,
      note: `${groups.length} player lines across ${new Set(groups.map((x) => x.gameId)).size} games` +
        (failed ? `; ${failed} game(s) failed` : "") +
        (quota && (quota as Quota).remaining !== null ? `; ${(quota as Quota).remaining} API credits left` : ""),
    },
  };
}

/**
 * DEMO lines (only when DEMO_PROP_LINES=true and no API key): the player's
 * median over his last 5 games rounded to .5. They exist so the analysis
 * pages can be explored without a paid key; every screen labels them.
 */
export function buildDemoLines(games: Game[], datasets: SeasonDataset[], roster: RosterPlayer[]): PropLineGroup[] {
  const allGames = datasets.flatMap((d) => d.games);
  const byTeam = new Map<string, RosterPlayer[]>();
  for (const p of roster) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
  const out: PropLineGroup[] = [];
  const now = new Date().toISOString();
  for (const g of games) {
    for (const team of [g.home.abbr, g.away.abbr]) {
      const players = (byTeam.get(team) ?? []).filter((p) => positionGroup(p.position));
      const withLogs = players.map((p) => ({ p, logs: buildPlayerLogs(p.id, allGames).slice(0, 5) })).filter((x) => x.logs.length >= 2);
      const top = (pos: string, vol: (x: (typeof withLogs)[number]) => number, n: number) =>
        withLogs.filter((x) => positionGroup(x.p.position) === pos).sort((a, b) => vol(b) - vol(a)).slice(0, n);
      const vol = (f: (s: (typeof withLogs)[number]["logs"][number]["stats"]) => number) => (x: (typeof withLogs)[number]) => sum(x.logs.map((l) => f(l.stats)));
      const picks: [typeof withLogs, PropMarket[]][] = [
        [top("QB", vol((s) => s.passAtt), 1), ["pass_yds", "pass_completions", "pass_attempts"]],
        [top("RB", vol((s) => s.rushAtt), 2), ["rush_yds", "rush_attempts", "receptions"]],
        [top("WR", vol((s) => s.targets), 3), ["rec_yds", "receptions"]],
        [top("TE", vol((s) => s.targets), 1), ["rec_yds", "receptions"]],
      ];
      for (const [plist, markets] of picks) {
        for (const { p, logs } of plist) {
          for (const m of markets) {
            const vals = logs.map((l) => MARKETS[m].stat(l.stats));
            const med = median(vals);
            if (med === null || med < 1) continue;
            out.push({
              gameId: g.id, playerName: p.name, playerId: p.id, team: p.team, market: m,
              line: Math.floor(med) + 0.5, overPrice: null, underPrice: null, books: [],
              source: "demo", fetchedAt: now, firstSeen: null,
            });
          }
        }
      }
    }
  }
  return out;
}
