import type { AnalyzedProp, LiveGame } from "./types";
import { MARKETS } from "./model/markets";

export type LiveOutcome = "alive" | "hit" | "miss" | "push" | "void";

export interface LiveStatus {
  final: boolean;
  /** Stat so far (null before the player's first recorded stat is known). */
  current: number;
  outcome: LiveOutcome;
  /** Plain-English status, e.g. "Needs 2 more", "Under alive: 2 more would lose it". */
  text: string;
}

type PropLike = Pick<AnalyzedProp, "market" | "line" | "side"> & { player: { id: string | null } };

/**
 * Where a pregame pick stands during or after the game, from ESPN's live box
 * score. Players missing from the box score have 0 so far; if still missing
 * when the game is final, the pick is void (did not record a stat).
 */
export function liveStatus(p: PropLike, g: LiveGame | undefined): LiveStatus | null {
  if (!g || g.state === "pre") return null;
  const final = g.state === "post";
  const stats = p.player.id ? g.players[p.player.id] : undefined;
  const cfg = MARKETS[p.market];
  const current = stats ? cfg.stat(stats) : 0;
  const isTd = p.market === "anytime_td";
  const line = isTd ? 0.5 : p.line;
  const unit = isTd ? "TD" : cfg.short.toLowerCase();

  if (final) {
    if (!stats) return { final, current, outcome: "void", text: "Did not record a stat (void)" };
    if (current === line) return { final, current, outcome: "push", text: `Push at ${current}` };
    const won = (current > line) === (p.side === "over");
    return { final, current, outcome: won ? "hit" : "miss", text: `${won ? "Hit" : "Missed"}: finished with ${current} ${unit}` };
  }

  if (current > line) {
    return p.side === "over"
      ? { final, current, outcome: "hit", text: isTd ? "Scored a TD" : `Over already hit (${current})` }
      : { final, current, outcome: "miss", text: isTd ? "Scored a TD: No lost" : `Under lost (${current})` };
  }
  // Still below the line.
  const toCross = Math.floor(line) + 1 - current;
  if (isTd) return { final, current, outcome: "alive", text: p.side === "over" ? "No TD yet" : "No TD so far: alive" };
  return p.side === "over"
    ? { final, current, outcome: "alive", text: `${current} so far, needs ${toCross} more` }
    : { final, current, outcome: "alive", text: `${current} so far, alive (${toCross} more would lose it)` };
}
