import type { AnalyzedProp, ClosingLine, Game, TrackedPick } from "../../shared/types";
import { normName, shortKey } from "../../shared/names";
import { fetchSgoClosing } from "../providers/sportsGameOdds";
import { readJSON, writeJSON, MIN } from "../cache";
import type { AppConfig } from "../config";
import { groupQuotes, sgoEventKey, sgoUsageKey } from "./props";
import { computeClose, LEDGER_KEY, readLedger } from "./tracking";

export const frozenKey = (gameId: string) => `frozen/${gameId}`;
const TRIED_KEY = "clv/sgo-tried";
const LAST_TRY_KEY = "clv/sgo-last";
/** Official closes are requested at most twice per game, and at most every 20 minutes. */
const MAX_TRIES = 2;
const RETRY_GAP = 20 * MIN;

const samePlayer = (a: string, b: string) => normName(a) === normName(b) || shortKey(a) === shortKey(b);

/**
 * Attach a closing line to each tracked pick once its game starts.
 * 1. At kickoff: the last pregame line this app fetched ("last-seen").
 * 2. After the game: the sportsbooks' official closing line from
 *    SportsGameOdds ("sportsbook-close"), which replaces the first one.
 * Returns how many picks changed.
 */
export async function recordClosingLines(games: Game[], cfg: AppConfig): Promise<{ changed: number; warnings: string[] }> {
  const warnings: string[] = [];
  const ledger = await readLedger();
  const started = new Map(games.filter((g) => g.state !== "pre").map((g) => [g.id, g]));
  const need = ledger.filter((p) => started.has(p.gameId) && p.close?.source !== "sportsbook-close");
  if (!need.length) return { changed: 0, warnings };
  const closes = new Map<string, ClosingLine>();

  // 1. Official close for finished games (SportsGameOdds only).
  if (cfg.sgoApiKey) {
    const tried = (await readJSON<Record<string, number>>(TRIED_KEY))?.value ?? {};
    const lastTry = (await readJSON<string>(LAST_TRY_KEY))?.value;
    const finished = [...new Set(need.map((p) => p.gameId))].filter((id) => started.get(id)!.state === "post" && (tried[id] ?? 0) < MAX_TRIES);
    const withEvent: [string, string][] = [];
    for (const id of finished) {
      const ev = (await readJSON<string>(sgoEventKey(id)))?.value;
      if (ev) withEvent.push([id, ev]);
    }
    let used = (await readJSON<number>(sgoUsageKey()))?.value ?? 0;
    const due = !lastTry || Date.now() - Date.parse(lastTry) >= RETRY_GAP;
    if (withEvent.length && due && used + withEvent.length <= cfg.sgoMonthlyLimit) {
      await writeJSON(LAST_TRY_KEY, new Date().toISOString());
      for (const [id] of withEvent) tried[id] = (tried[id] ?? 0) + 1;
      await writeJSON(TRIED_KEY, tried);
      try {
        const r = await fetchSgoClosing(cfg.sgoApiKey, withEvent.map(([, ev]) => ev));
        used += r.objects;
        await writeJSON(sgoUsageKey(), used);
        const at = new Date().toISOString();
        for (const [gameId, eventID] of withEvent) {
          const ev = r.games.find((g) => g.eventID === eventID);
          if (!ev) continue;
          const groups = groupQuotes(gameId, ev.quotes, at);
          for (const p of need.filter((x) => x.gameId === gameId)) {
            const g = groups.find((x) => x.market === p.market && samePlayer(x.playerName, p.playerName));
            if (!g || (g.line === null && p.market !== "anytime_td")) continue;
            closes.set(p.id, computeClose(p, { line: g.line ?? 0.5, over: g.overPrice, under: g.underPrice }, "sportsbook-close", at));
          }
        }
      } catch (e) {
        warnings.push(`Closing lines from SportsGameOdds unavailable: ${(e as Error).message}`);
      }
    }
  }

  // 2. Everything else: the last pregame line, frozen at kickoff.
  const frozenCache = new Map<string, { props: AnalyzedProp[]; savedAt: string } | null>();
  for (const p of need) {
    if (closes.has(p.id) || p.close) continue;
    if (!frozenCache.has(p.gameId)) {
      const f = await readJSON<AnalyzedProp[]>(frozenKey(p.gameId));
      frozenCache.set(p.gameId, f ? { props: f.value, savedAt: f.savedAt } : null);
    }
    const f = frozenCache.get(p.gameId);
    const prop = f?.props.find((x) => x.market === p.market && (p.playerId ? x.player.id === p.playerId : samePlayer(x.player.name, p.playerName)));
    if (!prop || prop.lineSource !== "sportsbook") continue;
    const updated = prop.books.map((b) => b.lastUpdate).filter((x): x is string => !!x).sort().pop();
    closes.set(p.id, computeClose(p, { line: prop.line, over: prop.odds.over, under: prop.odds.under }, "last-seen", updated ?? f!.savedAt));
  }

  if (!closes.size) return { changed: 0, warnings };
  // Re-read so picks recorded during this build are not lost.
  const latest = await readLedger();
  const next: TrackedPick[] = latest.map((p) => (closes.has(p.id) ? { ...p, close: closes.get(p.id)! } : p));
  await writeJSON(LEDGER_KEY, next);
  return { changed: closes.size, warnings };
}
