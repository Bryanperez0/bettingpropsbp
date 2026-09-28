import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryPoint } from "../../shared/types";

const OVER = "#3987e5";
const UNDER = "#d95926";
const PUSH = "#74808e";
const GRID = "#223040";
const AXIS = "#74808e";

interface Row extends HistoryPoint { label: string }

function TipBox({ active, payload, line, unitLabel }: { active?: boolean; payload?: { payload: Row }[]; line: number; unitLabel: string }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-ink">{r.season} Week {r.week} {r.home ? "vs" : "@"} {r.opponent}</div>
      <div className="num mt-1 text-ink">{r.value} {unitLabel}</div>
      <div className="mt-0.5 text-ink-2">
        {r.result === "push" ? "Push" : r.result === "over" ? "▲ Over" : "▼ Under"} vs current line {line}
      </div>
    </div>
  );
}

/**
 * Game-by-game results with the CURRENT line as a horizontal reference.
 * Bars are colored by result (Over blue / Under orange) and each bar also
 * gets a ▲/▼ marker so the result never depends on color alone.
 */
export function TrendChart({ history, line, unitLabel, height = 260 }: { history: HistoryPoint[]; line: number; unitLabel: string; height?: number }) {
  const latest = Math.max(...history.map((h) => h.season));
  const rows: Row[] = [...history].reverse().map((h) => ({ ...h, label: `${h.season === latest ? "" : `'${String(h.season).slice(2)} `}W${h.week}` }));
  if (!rows.length) return <p className="text-sm italic text-ink-3">No game history available.</p>;
  const colorOf = (r: Row) => (r.result === "over" ? OVER : r.result === "under" ? UNDER : PUSH);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OVER }} />▲ Over</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: UNDER }} />▼ Under</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-ink" />Current line {line}</span>
      </div>
      <div style={{ height }} role="img" aria-label={`Game-by-game ${unitLabel} versus current line ${line}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: -12 }} barCategoryGap="18%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<TipBox line={line} unitLabel={unitLabel} />} />
            <ReferenceLine y={line} stroke="#e6edf3" strokeDasharray="5 4" strokeWidth={2} ifOverflow="extendDomain"
              label={{ value: `Line ${line}`, position: "insideTopRight", fill: "#e6edf3", fontSize: 11 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}
              label={{ position: "top", fill: AXIS, fontSize: 10, formatter: (v: unknown) => String(v) }}>
              {rows.map((r) => <Cell key={r.gameId} fill={colorOf(r)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
