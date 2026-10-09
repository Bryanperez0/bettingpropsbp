import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePerformance } from "../hooks/useApi";
import type { PerformanceBucket, TrackedPick } from "../../shared/types";
import { Warnings } from "../components/Freshness";
import { Card, Empty, ErrorState, PageHeader, Pill, Section, Spinner, Stat } from "../components/ui";
import { SideBadge } from "../components/PropParts";
import { fmtFixed, fmtOdds, fmtPct, fmtSigned, fmtTime } from "../utils/format";
import { useState } from "react";
import { authHeaders } from "../auth/supabase";

const BREAKEVEN = 110 / 210; // hit rate needed at -110

function BucketTable({ rows, label }: { rows: PerformanceBucket[]; label: string }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3">{[label, "Picks", "W", "L", "P", "Hit rate", "Units", "Beat close"].map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="num">
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-1.5 pr-3 font-sans text-ink">{r.label}</td>
              <td className="pr-3">{r.picks}</td><td className="pr-3">{r.wins}</td><td className="pr-3">{r.losses}</td><td className="pr-3">{r.pushes}</td>
              <td className="pr-3 font-semibold">{fmtPct(r.hitRate, 1)}</td>
              <td className={`pr-3 ${r.units > 0 ? "text-strong" : r.units < 0 ? "text-negative" : ""}`}>{fmtSigned(r.units, 2)}</td>
              <td className="pr-3 text-ink-2">{r.clvN ? `${r.clvBeat}/${r.clvN}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CloseCell({ p }: { p: TrackedPick }) {
  const c = p.close;
  if (!c) return <span className="text-ink-3">{p.result === "pending" ? "at kickoff" : "—"}</span>;
  const tone = c.beat === true ? "text-strong" : c.beat === false ? "text-negative" : "text-ink-2";
  const what = p.market === "anytime_td" ? fmtOdds(p.side === "over" ? c.over : c.under) : `${c.line} ${fmtOdds(p.side === "over" ? c.over : c.under)}`;
  const label = c.beat === true ? "Beat" : c.beat === false ? "Lost" : "Even";
  return (
    <span title={c.source === "sportsbook-close" ? "Sportsbooks' official closing line" : "Last pregame line this app fetched"}>
      {what} <span className={`font-sans text-xs font-semibold ${tone}`}>{label}</span>
      {c.source === "last-seen" && <span className="font-sans text-[10px] text-ink-3"> (last seen)</span>}
    </span>
  );
}

const resultTone: Record<TrackedPick["result"], string> = {
  win: "bg-strong/15 text-strong", loss: "bg-negative/15 text-negative", push: "bg-surface-3 text-ink-2", pending: "bg-moderate/10 text-moderate", void: "bg-surface-3 text-ink-3",
};

/** Downloads every tracked pick as a CSV file (same sign-in as the rest of the API). */
function DownloadPicks() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/picks-export", { headers: await authHeaders() });
      if (!res.ok) throw new Error(res.status === 401 ? "Your session ended. Sign in again." : `Download failed (HTTP ${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `prop-lab-picks-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={download} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-50">
        {busy ? "Preparing…" : "Download all picks (CSV)"}
      </button>
      {err && <span className="text-xs text-negative">{err}</span>}
    </div>
  );
}

export default function Performance() {
  const q = usePerformance();
  if (q.isLoading) return <Spinner label="Loading model performance" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { summary: s, trackMinConfidence } = q.data.data;
  const chart = [...s.byConfidence].reverse().map((b) => ({ label: b.label, hit: b.hitRate === null ? null : b.hitRate * 100, n: b.wins + b.losses }));

  return (
    <div>
      <PageHeader title="Model Performance" subtitle={`Every sportsbook-line recommendation with confidence ≥ ${trackMinConfidence} and a positive edge is saved the first time it appears, with its line, odds, projection and confidence at that moment. Stored picks are never edited when lines move. After games finish, results are graded from the final box score.`}>
        <DownloadPicks />
      </PageHeader>
      <Warnings warnings={q.data.warnings} />
      {!!s.excludedInvalidOdds && (
        <p className="mb-4 text-xs text-ink-3">
          {s.excludedInvalidOdds} saved pick{s.excludedInvalidOdds === 1 ? " is" : "s are"} left out of these numbers because the odds feed sent an impossible price (like -1) when it was saved. The CSV download still includes them.
        </p>
      )}
      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Tracked picks" value={s.total} />
        <Stat label="Graded" value={s.graded} />
        <Stat label="Pending" value={s.pending} />
        <Stat label="Wins" value={s.wins} />
        <Stat label="Losses" value={s.losses} />
        <Stat label="Hit rate" value={fmtPct(s.hitRate, 1)} sub={`break-even at -110: ${fmtPct(BREAKEVEN, 1)}`} />
        <Stat label="Units (1u flat)" value={fmtSigned(s.units, 2)} sub="at recorded odds" />
      </div>

      {s.total === 0 ? (
        <Empty>No picks tracked yet. Picks are recorded automatically once sportsbook lines are connected and the analysis runs. Demo lines are never tracked.</Empty>
      ) : (
        <>
          <Section title="Closing line value" subtitle="Did the market move toward the pick before kickoff? Beating the closing line consistently is the best early sign a model is sharp, long before win–loss records mean anything.">
            <Card className="p-4">
              {s.clv.tracked === 0 ? (
                <p className="text-sm text-ink-3">No closing lines yet. Each pick gets one at kickoff; after the game it's replaced with the sportsbooks' official close.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Beat the close" value={fmtPct(s.clv.beatRate, 1)} sub={`${s.clv.beat} beat · ${s.clv.lost} lost · ${s.clv.even} even`} />
                  <Stat label="Picks with a close" value={s.clv.tracked} />
                  <Stat label="Avg line move" value={s.clv.avgLineMove === null ? "—" : fmtSigned(s.clv.avgLineMove, 2)} sub="points in the pick's favor" />
                  <Stat label="Avg price CLV" value={s.clv.avgProbClv === null ? "—" : fmtSigned(s.clv.avgProbClv * 100, 1, " pts")} sub="implied probability, same line" />
                </div>
              )}
              <p className="mt-3 text-xs text-ink-3">A pick beats the close when the line moves toward its side (Over 58.5 closes at 60.5), or at the same line when its price gets more expensive. Above 50% over a large sample means the model tends to spot value before the market does. "Last seen" closes are the last line this app fetched before kickoff; they are upgraded to the official close after the game when SportsGameOdds has it.</p>
            </Card>
          </Section>

          <Section title="Does higher confidence win more often?" subtitle="Hit rate by confidence range (pushes and voids excluded). Small samples are noisy — judge after hundreds of graded picks, not dozens.">
            <Card className="p-4">
              <div className="h-64" role="img" aria-label="Hit rate by confidence range">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 16, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="#223040" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#74808e", fontSize: 11 }} axisLine={{ stroke: "#223040" }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#74808e", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const r = payload[0].payload as (typeof chart)[number];
                      return <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs"><b>Confidence {r.label}</b><div className="num">{r.hit === null ? "no graded picks" : `${r.hit.toFixed(1)}% over ${r.n} graded`}</div></div>;
                    }} />
                    <ReferenceLine y={BREAKEVEN * 100} stroke="#a9b4c0" strokeDasharray="4 4" label={{ value: "Break-even at -110", fill: "#a9b4c0", fontSize: 11, position: "insideTopLeft" }} />
                    <Bar dataKey="hit" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}
                      label={{ position: "top", fill: "#a9b4c0", fontSize: 11, formatter: (v: unknown) => (typeof v === "number" ? `${v.toFixed(0)}%` : "") }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4"><BucketTable rows={s.byConfidence} label="Confidence" /></div>
            </Card>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="By prop category"><Card className="p-4"><BucketTable rows={s.byCategory} label="Prop" /></Card></Section>
            <Section title="By position"><Card className="p-4"><BucketTable rows={s.byPosition} label="Position" /></Card></Section>
          </div>
          <Section title="By week"><Card className="p-4"><BucketTable rows={s.byWeek} label="Week" /></Card></Section>

          <Section title="Pick log" subtitle="As recorded at the time of the recommendation.">
            <Card className="overflow-x-auto p-4 scrollbar-thin">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3">{["Recorded", "Player", "Prop", "Pick", "Odds", "Close", "Proj", "Conf", "Actual", "Result"].map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody className="num">
                  {s.recent.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-xs text-ink-3">{fmtTime(p.createdAt)}</td>
                      <td className="pr-3 font-sans">{p.playerName} <span className="text-xs text-ink-3">{p.position} {p.team}</span></td>
                      <td className="pr-3 font-sans text-ink-2">{p.marketLabel}</td>
                      <td className="pr-3"><SideBadge side={p.side} label={p.market === "anytime_td" ? (p.side === "over" ? "YES" : "NO") : `${p.side === "over" ? "O" : "U"} ${p.line}`} /></td>
                      <td className="pr-3">{fmtOdds(p.odds)}</td>
                      <td className="pr-3 whitespace-nowrap"><CloseCell p={p} /></td>
                      <td className="pr-3">{p.market === "anytime_td" ? fmtPct(p.projection, 0) : fmtFixed(p.projection)}</td>
                      <td className="pr-3 font-semibold">{p.confidence}</td>
                      <td className="pr-3">{p.actual ?? "—"}</td>
                      <td className="pr-3"><Pill className={resultTone[p.result]}>{p.result.toUpperCase()}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
