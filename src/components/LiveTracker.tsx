import type { SlimProp } from "../../shared/api";
import { liveStatus, type LiveOutcome } from "../../shared/live";
import { useLive } from "../hooks/useApi";
import { timeAgo } from "../utils/format";

export const propHasStarted = (p: Pick<SlimProp, "kickoff" | "frozen">) => !!p.frozen || Date.parse(p.kickoff) <= Date.now();

const TONE: Record<LiveOutcome, string> = {
  alive: "border-over/40 bg-over/10 text-ink",
  hit: "border-strong/40 bg-strong/10 text-strong",
  miss: "border-negative/40 bg-negative/10 text-negative",
  push: "border-line bg-surface-3 text-ink-2",
  void: "border-line bg-surface-3 text-ink-2",
};
const ICON: Record<LiveOutcome, string> = { alive: "●", hit: "✓", miss: "✕", push: "=", void: "–" };

/** In-game (or final) status of a pregame pick, from ESPN's live box score. */
export function LiveTracker({ p, compact = false }: { p: SlimProp; compact?: boolean }) {
  const started = propHasStarted(p);
  const q = useLive(started);
  if (!started) return null;
  const game = q.data?.data.games[p.gameId];
  const s = liveStatus(p, game);
  if (!game || !s) {
    return (
      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
        {q.isLoading ? "Loading live stats…" : "Game started. Live stats not available yet."}
      </div>
    );
  }
  const score = game.homeScore !== null && game.awayScore !== null ? `${game.awayScore}-${game.homeScore}` : "";
  return (
    <div className={`rounded-lg border px-3 py-2 ${TONE[s.outcome]}`} aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide">
        <span className="inline-flex items-center gap-1.5">
          {s.final ? "Final" : <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-negative" aria-hidden />Live · {game.detail}</>}
          {score && <span className="num font-medium text-ink-3 normal-case">{score}</span>}
        </span>
        {!compact && <span className="font-normal normal-case text-ink-3">updated {timeAgo(game.fetchedAt)}</span>}
      </div>
      <div className="mt-0.5 text-sm font-semibold"><span aria-hidden>{ICON[s.outcome]} </span>{s.text}</div>
    </div>
  );
}
