// Logic for the interactive game-by-game chart (prop explorer).
// Changing these views never changes the model's projection or confidence.
import type { HistoryPoint, PlayerGameLog, PropMarket } from "./types";
import { MARKETS, positionGroup } from "./model/markets";
import { buildHistory } from "./model/hitRate";
import { mean, median } from "./model/stats";

export type RangeKey = "l5" | "l10" | "season" | "last_season" | "all";
export type SplitKey = "all" | "home" | "away";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "l5", label: "Last 5" },
  { key: "l10", label: "Last 10" },
  { key: "season", label: "This season" },
  { key: "last_season", label: "Last season" },
  { key: "all", label: "All" },
];

const BY_POSITION: Record<string, PropMarket[]> = {
  QB: ["pass_yds", "pass_completions", "pass_attempts", "pass_tds", "rush_yds", "rush_attempts", "anytime_td"],
  RB: ["rush_yds", "rush_attempts", "receptions", "rec_yds", "rec_longest", "anytime_td"],
  WR: ["rec_yds", "receptions", "rec_longest", "anytime_td", "rush_yds"],
  TE: ["rec_yds", "receptions", "rec_longest", "anytime_td"],
};

/** Prop types that make sense for a position, in display order. */
export function marketsForPosition(position: string): PropMarket[] {
  return BY_POSITION[positionGroup(position) ?? "WR"];
}

/**
 * Games for the chosen view, newest first. Filters apply in order:
 * home/away, opponent, then the time range.
 */
export function filterLogs(
  logs: PlayerGameLog[],
  opts: { range: RangeKey; split: SplitKey; opponent: string | null; season: number },
): PlayerGameLog[] {
  let out = logs;
  if (opts.split !== "all") out = out.filter((l) => l.home === (opts.split === "home"));
  if (opts.opponent) out = out.filter((l) => l.opponent === opts.opponent);
  switch (opts.range) {
    case "l5": return out.slice(0, 5);
    case "l10": return out.slice(0, 10);
    case "season": return out.filter((l) => l.season === opts.season);
    case "last_season": return out.filter((l) => l.season === opts.season - 1);
    default: return out;
  }
}

/**
 * Line to grade against when no sportsbook line exists for a market:
 * the player's median over recent games, rounded to the nearest .5 below.
 */
export function defaultLine(logs: PlayerGameLog[], market: PropMarket): number {
  if (market === "anytime_td") return 0.5;
  const vals = logs.slice(0, 10).map((l) => MARKETS[market].stat(l.stats));
  const m = median(vals);
  return m === null ? 0.5 : Math.floor(m) + 0.5;
}

export interface ViewSummary {
  history: HistoryPoint[];
  games: number;
  over: number;
  under: number;
  pushes: number;
  overPct: number | null;
  underPct: number | null;
  average: number | null;
  median: number | null;
}

/** Grade the selected games against the line and summarize. */
export function summarizeView(logs: PlayerGameLog[], market: PropMarket, line: number): ViewSummary {
  const history = buildHistory(logs, market, line);
  const over = history.filter((h) => h.result === "over").length;
  const under = history.filter((h) => h.result === "under").length;
  const pushes = history.length - over - under;
  const decided = over + under;
  const vals = history.map((h) => h.value);
  return {
    history,
    games: history.length,
    over, under, pushes,
    overPct: decided ? over / decided : null,
    underPct: decided ? under / decided : null,
    average: mean(vals),
    median: median(vals),
  };
}
