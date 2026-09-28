import type { HistoryPoint, HitRate, HitRates, PlayerGameLog, PropMarket, PropSide } from "../types";
import { MARKETS } from "./markets";

/** Every historical game graded against the CURRENT line (newest first). */
export function buildHistory(logs: PlayerGameLog[], market: PropMarket, line: number): HistoryPoint[] {
  const stat = MARKETS[market].stat;
  return logs.map((l) => {
    const value = stat(l.stats);
    const result: HistoryPoint["result"] = value > line ? "over" : value < line ? "under" : "push";
    return { gameId: l.gameId, season: l.season, week: l.week, date: l.date, opponent: l.opponent, home: l.home, value, result };
  });
}

export function hitRate(points: HistoryPoint[], side: PropSide): HitRate {
  const pushes = points.filter((p) => p.result === "push").length;
  const hits = points.filter((p) => p.result === side).length;
  const decided = points.length - pushes;
  return { hits, total: points.length, pushes, pct: decided > 0 ? hits / decided : null };
}

/**
 * Season/home/away use the current season only. Last-N windows use the most
 * recent N games and can reach back into last season when the current
 * season is short (each game in the list shows its season).
 */
export function computeHitRates(history: HistoryPoint[], side: PropSide, season: number): HitRates {
  const cur = history.filter((h) => h.season === season);
  return {
    season: hitRate(cur, side),
    last10: hitRate(history.slice(0, 10), side),
    last5: hitRate(history.slice(0, 5), side),
    last3: hitRate(history.slice(0, 3), side),
    home: hitRate(cur.filter((h) => h.home), side),
    away: hitRate(cur.filter((h) => !h.home), side),
  };
}
