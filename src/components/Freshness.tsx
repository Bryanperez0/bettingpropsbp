import type { SourceMeta } from "../../shared/types";
import { STATUS_META, timeAgo, fmtTime } from "../utils/format";

export function StatusDot({ status }: { status: SourceMeta["status"] }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.text}`}>
      <span className={`h-2 w-2 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  );
}

/** Shows every data source with its status and age. Stale data is never labeled live. */
export function Freshness({ sources, compact = false }: { sources: SourceMeta[]; compact?: boolean }) {
  if (!sources.length) return null;
  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        {sources.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5" title={s.note}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s.status].dot}`} aria-hidden />
            <span className="text-ink-2">{s.label}:</span>
            {s.status === "unavailable" ? "unavailable" : `${STATUS_META[s.status].label.toLowerCase()}, updated ${timeAgo(s.fetchedAt)}`}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="py-2 pr-4 font-medium">Data</th>
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Updated</th>
            <th className="py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.key} className="border-t border-line">
              <td className="py-2 pr-4 text-ink">{s.label}</td>
              <td className="py-2 pr-4 text-ink-2">{s.provider}</td>
              <td className="py-2 pr-4"><StatusDot status={s.status} /></td>
              <td className="num py-2 pr-4 text-ink-2" title={fmtTime(s.fetchedAt)}>{s.fetchedAt ? timeAgo(s.fetchedAt) : "—"}</td>
              <td className="py-2 text-xs text-ink-3">{s.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${/DEMO/.test(w) ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200" : "border-moderate/30 bg-moderate/5 text-ink-2"}`}>
          <span className="mr-1 font-semibold">{/DEMO/.test(w) ? "Demo data" : "Note"}:</span>{w}
        </div>
      ))}
    </div>
  );
}
