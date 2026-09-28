import type { ScoreHistoryEntry } from "../../shared/types";
import { fmtOdds, fmtTime, TIER_CLASSES } from "../utils/format";

/** Every recalculation where the score, line, odds, lean or projection moved, newest first. */
export function ScoreHistory({ entries, unit }: { entries: ScoreHistoryEntry[]; unit: "yards" | "count" | "prob" }) {
  if (!entries.length) {
    return <p className="text-sm text-ink-3">No history yet. It starts recording on the next complete refresh.</p>;
  }
  const rows = [...entries].reverse();
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="py-1.5 pr-3 font-medium">Time</th>
            <th className="pr-3 font-medium">Conf</th>
            <th className="pr-3 font-medium">Lean</th>
            <th className="pr-3 font-medium">Odds</th>
            <th className="pr-3 font-medium">Proj</th>
            <th className="font-medium">What changed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.at + i} className="border-t border-line align-top">
              <td className="num whitespace-nowrap py-2 pr-3 text-xs text-ink-3">{fmtTime(e.at)}</td>
              <td className={`num py-2 pr-3 font-semibold ${TIER_CLASSES[e.tier].text}`}>{e.confidence}</td>
              <td className="num whitespace-nowrap py-2 pr-3">{unit === "prob" ? (e.side === "over" ? "YES" : "NO") : `${e.side === "over" ? "O" : "U"} ${e.line}`}</td>
              <td className="num py-2 pr-3">{fmtOdds(e.odds)}</td>
              <td className="num py-2 pr-3">{unit === "prob" ? `${(e.projection * 100).toFixed(1)}%` : e.projection}</td>
              <td className="py-2 text-xs text-ink-2">{e.changes.length ? e.changes.join(" · ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">A row is added only when the confidence, line, odds, lean or projection moves. Refreshes with incomplete data are not recorded.</p>
    </div>
  );
}
