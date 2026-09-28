import type { AnalyzedProp, ConfidenceBreakdown, EdgeTier, HitRate, HitRates, PropSide } from "../../shared/types";
import { fmtFixed, fmtOdds, fmtPct, fmtSigned, fmtTime, TIER_CLASSES, TIER_LABEL, timeAgo } from "../utils/format";
import { Pill, Unavailable } from "./ui";

export function TierBadge({ tier }: { tier: EdgeTier }) {
  const c = TIER_CLASSES[tier];
  return <Pill className={`${c.bg} ${c.text} ring-1 ${c.ring}`}>{TIER_LABEL[tier]}</Pill>;
}

export function SideBadge({ side, label, large = false }: { side: PropSide; label: string; large?: boolean }) {
  const cls = side === "over" ? "bg-over/15 text-over ring-over/40" : "bg-under/15 text-under ring-under/40";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-bold ring-1 ${cls} ${large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs"}`}>
      <span aria-hidden>{side === "over" ? "▲" : "▼"}</span>
      {label}
    </span>
  );
}

export function ConfidenceMeter({ value, tier, size = "md" }: { value: number; tier: EdgeTier; size?: "md" | "lg" }) {
  const c = TIER_CLASSES[tier];
  if (size === "md") {
    return (
      <div className="w-16 shrink-0 text-right" title="Confidence score (0-100)">
        <div className={`num text-xl font-bold leading-none ${c.text}`}>{value}</div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${value}%` }} />
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">conf /100</div>
      </div>
    );
  }
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Confidence</span>
        <span className={`num text-2xl font-bold ${c.text}`}>
          {value}<span className="text-xs font-medium text-ink-3">/100</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ConfidenceTable({ c }: { c: ConfidenceBreakdown }) {
  return (
    <div>
      <ul className="space-y-2.5">
        {c.components.map((x) => (
          <li key={x.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{x.label}</span>
              <span className="num text-ink-2"><span className="font-semibold text-ink">{fmtFixed(x.score, 1)}</span> / {x.max}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-ink-2" style={{ width: `${(x.score / x.max) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-ink-3">{x.detail}</p>
          </li>
        ))}
      </ul>
      {c.penalties.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Data-quality penalties</p>
          <ul className="space-y-1 text-sm">
            {c.penalties.map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-ink-2">{p.label}</span>
                <span className="num font-semibold text-negative">−{p.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold">
        <span>Total</span>
        <span className="num">{c.total} / 100</span>
      </div>
    </div>
  );
}

function rateText(h: HitRate) {
  const decided = h.total - h.pushes;
  if (!h.total) return null;
  return `${h.hits}/${decided}`;
}

export function HitRateGrid({ rates, side, compact = false }: { rates: HitRates; side: PropSide; compact?: boolean }) {
  const cells: [string, HitRate][] = compact
    ? [["Season", rates.season], ["L5", rates.last5], ["L3", rates.last3]]
    : [["Season", rates.season], ["Last 10", rates.last10], ["Last 5", rates.last5], ["Last 3", rates.last3], ["Home", rates.home], ["Away", rates.away]];
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
      {cells.map(([label, h]) => (
        <div key={label} className="rounded-lg bg-surface-2 px-2 py-1.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
          {h.total ? (
            <>
              <div className="num text-sm font-semibold text-ink">{fmtPct(h.pct)}</div>
              <div className="num text-[11px] text-ink-3">{rateText(h)}{h.pushes ? ` · ${h.pushes}P` : ""}</div>
            </>
          ) : (
            <div className="py-1 text-[11px] text-ink-3">no games</div>
          )}
        </div>
      ))}
      {!compact && <p className="col-span-full text-xs text-ink-3">{side === "over" ? "Over" : "Under"} hits vs the current line. Pushes excluded from the %.</p>}
    </div>
  );
}

export function LineMovement({ prop }: { prop: Pick<AnalyzedProp, "firstSeen" | "line" | "odds" | "lineSource" | "unit"> }) {
  const f = prop.firstSeen;
  if (prop.lineSource === "demo") return <Unavailable what="Line movement (demo line)" />;
  if (!f) return <Unavailable what="Line movement" />;
  const move = prop.unit === "prob" || f.line === null ? null : prop.line - f.line;
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-lg bg-surface-2 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-ink-3">First seen</div>
        <div className="num font-semibold">{prop.unit === "prob" ? fmtOdds(f.overPrice) : f.line}</div>
        <div className="num text-xs text-ink-3">{prop.unit === "prob" ? "" : `${fmtOdds(f.overPrice)} / ${fmtOdds(f.underPrice)}`}</div>
      </div>
      <div className="rounded-lg bg-surface-2 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-ink-3">Current</div>
        <div className="num font-semibold">{prop.unit === "prob" ? fmtOdds(prop.odds.over) : prop.line}</div>
        <div className="num text-xs text-ink-3">{prop.unit === "prob" ? "" : `${fmtOdds(prop.odds.over)} / ${fmtOdds(prop.odds.under)}`}</div>
      </div>
      <div className="rounded-lg bg-surface-2 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-ink-3">Movement</div>
        <div className="num font-semibold">{move === null ? "—" : move === 0 ? "No change" : fmtSigned(move, 1)}</div>
        <div className="text-xs text-ink-3" title={fmtTime(f.at)}>since {timeAgo(f.at)}</div>
      </div>
      <p className="col-span-3 text-xs text-ink-3">
        "First seen" is the first line this app recorded, not necessarily the sportsbook's opening line (true openers need a paid historical-odds plan). Line movement does not by itself indicate "sharp money."
      </p>
    </div>
  );
}

export function BooksTable({ books, unit }: { books: AnalyzedProp["books"]; unit: AnalyzedProp["unit"] }) {
  if (!books.length) return <Unavailable what="Sportsbook quotes" />;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="py-1.5 pr-3 font-medium">Book</th>
            {unit !== "prob" && <th className="py-1.5 pr-3 font-medium">Line</th>}
            <th className="py-1.5 pr-3 font-medium">{unit === "prob" ? "Yes" : "Over"}</th>
            <th className="py-1.5 pr-3 font-medium">{unit === "prob" ? "No" : "Under"}</th>
            <th className="py-1.5 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="num">
          {books.map((b, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1.5 pr-3 font-sans text-ink">{b.bookTitle}</td>
              {unit !== "prob" && <td className="py-1.5 pr-3">{b.line ?? "—"}</td>}
              <td className="py-1.5 pr-3">{fmtOdds(b.overPrice)}</td>
              <td className="py-1.5 pr-3">{fmtOdds(b.underPrice)}</td>
              <td className="py-1.5 text-ink-3">{b.lastUpdate ? timeAgo(b.lastUpdate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
