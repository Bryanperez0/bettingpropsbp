import { Link, useParams } from "react-router-dom";
import { useGame } from "../hooks/useApi";
import type { RankRow, TeamSummary } from "../../shared/api";
import { InjuryTable, LinesTable, WeatherBadge, spreadText } from "../components/GameParts";
import { TeamLogo } from "../components/Media";
import { PropCard } from "../components/PropCard";
import { Freshness } from "../components/Freshness";
import { Card, Empty, ErrorState, Section, Spinner, Stat } from "../components/ui";
import { fmtKickoff, fmtOdds } from "../utils/format";
import { isActionable } from "../../shared/model/engine";

/** Top-8 ranks read as strengths, bottom-8 as weaknesses (label text carries the meaning). */
function rankTone(r: RankRow) {
  if (!r.rank) return "text-ink-3";
  return r.rank <= 8 ? "text-strong" : r.rank > r.of - 8 ? "text-negative" : "text-ink-2";
}

function RankTable({ rows, note }: { rows: RankRow[]; note: string }) {
  return (
    <div>
      <table className="w-full text-sm">
        <tbody className="num">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line first:border-0">
              <td className="py-1.5 pr-2 font-sans text-ink-2">{r.label}</td>
              <td className="py-1.5 pr-2 text-right font-semibold">{r.value === null ? "—" : r.value.toFixed(r.digits ?? 1)}</td>
              <td className={`py-1.5 text-right text-xs ${rankTone(r)}`}>{r.rank ? `#${r.rank} of ${r.of}` : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">{note}</p>
    </div>
  );
}

function TeamPanel({ t }: { t: TeamSummary }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <TeamLogo abbr={t.abbr} src={t.logo} size={36} />
        <div>
          <p className="font-semibold">{t.name}</p>
          <p className="text-xs text-ink-3">{t.record ?? "Record unavailable"}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Offense</p>
          <RankTable rows={t.offenseRanks} note="Rank 1 = most produced." />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Defense</p>
          <RankTable rows={t.defenseRanks} note="Rank 1 = fewest allowed." />
        </div>
      </div>
      <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent results</p>
      {t.recent.length ? (
        <div className="flex flex-wrap gap-2">
          {t.recent.map((r) => (
            <span key={r.gameId} className={`num rounded-md px-2 py-1 text-xs ${r.result === "W" ? "bg-strong/10 text-strong" : r.result === "L" ? "bg-negative/10 text-negative" : "bg-surface-3 text-ink-2"}`}>
              W{r.week} {r.result} {r.pointsFor}-{r.pointsAgainst} {r.home ? "vs" : "@"} {r.opponent}
            </span>
          ))}
        </div>
      ) : <p className="text-sm text-ink-3">No completed games this season.</p>}
    </Card>
  );
}

export default function GameDetail() {
  const { id = "" } = useParams();
  const q = useGame(id);
  if (q.isLoading) return <Spinner label="Loading game analysis" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { game: g, home, away, injuries, props } = q.data.data;
  const ranked = props.filter((p) => p.probEdge > 0 && isActionable(p)).slice(0, 12);

  return (
    <div>
      <Link to="/games" className="text-sm text-ink-3 hover:text-ink">← All games</Link>
      <Card className="mt-3 p-5">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-between">
          {[g.away, g.home].map((t, i) => (
            <div key={t.abbr} className={`flex items-center gap-3 ${i === 1 ? "sm:flex-row-reverse sm:text-right" : ""}`}>
              <TeamLogo abbr={t.abbr} src={t.logo} size={56} />
              <div>
                <p className="text-xl font-bold">{t.displayName}</p>
                <p className="text-sm text-ink-3">{t.record ?? ""} {i === 0 ? `· away ${t.awayRecord ?? "—"}` : `· home ${t.homeRecord ?? "—"}`}</p>
              </div>
              {g.state !== "pre" && <span className="num text-3xl font-bold">{i === 0 ? g.awayScore : g.homeScore}</span>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-ink-2">
          {g.state === "pre" ? fmtKickoff(g.date) : g.statusDetail} · {g.venue.name ?? "Venue unknown"}{g.venue.city ? `, ${g.venue.city}${g.venue.state ? `, ${g.venue.state}` : ""}` : ""}{g.neutralSite ? " · Neutral site" : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Spread" value={spreadText(g.lines, g.home.abbr, g.away.abbr)} />
          <Stat label="Total" value={g.lines.total ?? "—"} />
          <Stat label={`${g.away.abbr} ML`} value={fmtOdds(g.lines.awayMoneyline)} />
          <Stat label={`${g.home.abbr} ML`} value={fmtOdds(g.lines.homeMoneyline)} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Lines and movement" className="mb-0"><Card className="p-4"><LinesTable g={g} /></Card></Section>
        <Section title="Weather" className="mb-0"><Card className="p-4"><WeatherBadge w={g.weather} detailed /></Card></Section>
        <Section title="Data sources" className="mb-0"><Card className="p-4"><Freshness sources={q.data.sources.filter((s) => ["schedule", "weather", "injuries", "props"].includes(s.key))} compact /></Card></Section>
      </div>

      <Section title="Highest-rated props in this game" subtitle="Positive-edge props only, ranked by confidence." className="mt-8">
        {ranked.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{ranked.map((p, i) => <PropCard key={p.id} p={p} rank={i + 1} />)}</div>
          : <Empty>No positive-edge props for this game yet (lines may not be posted, or data is unavailable).</Empty>}
      </Section>

      <Section title="Team comparison" subtitle="Per-game averages from this season's box scores.">
        <div className="grid gap-4 lg:grid-cols-2"><TeamPanel t={away} /><TeamPanel t={home} /></div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`${g.away.abbr} injuries`}><Card className="p-4"><InjuryTable items={injuries.away} /></Card></Section>
        <Section title={`${g.home.abbr} injuries`}><Card className="p-4"><InjuryTable items={injuries.home} /></Card></Section>
      </div>
    </div>
  );
}
