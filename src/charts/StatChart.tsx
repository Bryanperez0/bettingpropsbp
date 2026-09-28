import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BAR = "#3987e5";
const GRID = "#223040";
const AXIS = "#74808e";

export interface StatPoint { label: string; value: number; opponent: string; home: boolean }

/** Single-series game log chart with the season average as a reference line. */
export function StatChart({ title, data, average }: { title: string; data: StatPoint[]; average: number | null }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {average !== null && <span className="num text-xs text-ink-3">avg {average.toFixed(1)} (dashed)</span>}
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 14, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
            <YAxis tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as StatPoint;
                return <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs"><div className="font-semibold">{p.label} {p.home ? "vs" : "@"} {p.opponent}</div><div className="num">{p.value} {title.toLowerCase()}</div></div>;
              }}
            />
            {average !== null && <ReferenceLine y={average} stroke="#a9b4c0" strokeDasharray="4 4" strokeWidth={1.5} />}
            <Bar dataKey="value" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} label={{ position: "top", fill: AXIS, fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
