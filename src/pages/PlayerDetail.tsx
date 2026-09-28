import { Link, useParams } from "react-router-dom";
import { usePlayer } from "../hooks/useApi";
import { PlayerAvatar, TeamLogo } from "../components/Media";
import { InjuryStatus, WeatherBadge } from "../components/GameParts";
import { PropCard } from "../components/PropCard";
import { StatChart, type StatPoint } from "../charts/StatChart";
import { Card, Empty, ErrorState, Section, Spinner, Unavailable } from "../components/ui";
import { fmtFixed, fmtKickoff, fmtPct } from "../utils/format";
import { positionGroup } from "../../shared/model/markets";
import type { StatLine } from "../../shared/types";

const CHARTS: { key: keyof StatLine; title: string; pos: string[] }[] = [
  { key: "passYds", title: "Passing yards", pos: ["QB"] },
  { key: "passAtt", title: "Pass attempts", pos: ["QB"] },
  { key: "rushYds", title: "Rushing yards", pos: ["QB", "RB"] },
  { key: "rushAtt", title: "Carries", pos: ["QB", "RB"] },
  { key: "recYds", title: "Receiving yards", pos: ["RB", "WR", "TE"] },
  { key: "targets", title: "Targets", pos: ["RB", "WR", "TE"] },
  { key: "rec", title: "Receptions", pos: ["RB", "WR", "TE"] },
];

const LOG_COLS: { key: keyof StatLine; label: string; pos: string[] }[] = [
  { key: "passCmp", label: "Cmp", pos: ["QB"] }, { key: "passAtt", label: "Att", pos: ["QB"] }, { key: "passYds", label: "Pass Yds", pos: ["QB"] },
  { key: "passTD", label: "Pass TD", pos: ["QB"] }, { key: "passInt", label: "INT", pos: ["QB"] },
  { key: "rushAtt", label: "Car", pos: ["QB", "RB", "WR"] }, { key: "rushYds", label: "Rush Yds", pos: ["QB", "RB", "WR"] }, { key: "rushTD", label: "Rush TD", pos: ["QB", "RB"] },
  { key: "targets", label: "Tgt", pos: ["RB", "WR", "TE"] }, { key: "rec", label: "Rec", pos: ["RB", "WR", "TE"] }, { key: "recYds", label: "Rec Yds", pos: ["RB", "WR", "TE"] },
  { key: "recLong", label: "Long", pos: ["RB", "WR", "TE"] }, { key: "recTD", label: "Rec TD", pos: ["RB", "WR", "TE"] },
];

export default function PlayerDetail() {
  const { id = "" } = useParams();
  const q = usePlayer(id);
  if (q.isLoading) return <Spinner label="Loading player" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data.data;
  const pos = positionGroup(d.player.position) ?? "WR";
  const cur = d.logs.filter((l) => l.season === d.season);
  const chartLogs = [...(cur.length ? cur : d.logs.slice(0, 10))].reverse();
  const cols = LOG_COLS.filter((c) => c.pos.includes(pos));

  return (
    <div>
      <Link to="/players" className="text-sm text-ink-3 hover:text-ink">← Players</Link>
      <Card className="mt-3 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <PlayerAvatar name={d.player.name} src={d.player.headshot} size={88} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{d.player.name}</h1>
              {d.injury && <InjuryStatus status={d.injury.status} />}
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-ink-2"><TeamLogo abbr={d.player.team} size={20} />{d.player.team} · {d.player.position}{d.player.jersey ? ` · #${d.player.jersey}` : ""}</p>
            {d.injury && <p className="mt-1 text-xs text-ink-3">{[d.injury.injury, d.injury.detail, d.injury.comment].filter(Boolean).join(" · ")}</p>}
          </div>
          {d.upcoming && (
            <Link to={`/games/${d.upcoming.game.id}`} className="rounded-lg border border-line bg-surface-2 p-3 text-sm hover:border-ink-3">
              <p className="text-xs uppercase tracking-wide text-ink-3">Upcoming</p>
              <p className="flex items-center gap-2 font-semibold">{d.upcoming.isHome ? "vs" : "@"} <TeamLogo abbr={d.upcoming.opponent} size={20} /> {d.upcoming.opponent}</p>
              <p className="text-xs text-ink-3">{fmtKickoff(d.upcoming.game.date)}</p>
              <div className="mt-1"><WeatherBadge w={d.upcoming.game.weather} /></div>
            </Link>
          )}
        </div>
      </Card>

      <Section title="Available props this week" className="mt-6">
        {d.props.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{d.props.map((p) => <PropCard key={p.id} p={p} />)}</div> : <Empty>No prop lines loaded for this player.</Empty>}
      </Section>

      <Section title={`${d.season} splits`} subtitle="Season/median/home/away use this season only. Last-N can include last season when the current sample is short.">
        <Card className="overflow-x-auto p-4 scrollbar-thin">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3">{["Stat", "Season avg", "Median", "L3", "L5", "L10", "Home", "Away"].map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="num">
              {d.summaries.map((s) => (
                <tr key={s.key} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-sans text-ink">{s.label}</td>
                  {[s.season, s.median, s.last3, s.last5, s.last10, s.home, s.away].map((v, i) => <td key={i} className="pr-3">{fmtFixed(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="Usage">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {d.usage.map((u) => (
            <div key={u.label} className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-3">{u.label}</div>
              {u.value === null ? <Unavailable /> : <div className="num text-lg font-semibold">{fmtPct(u.value, 1)}</div>}
            </div>
          ))}
        </div>
      </Section>

      {d.upcoming && (
        <Section title={`Opponent: ${d.upcoming.opponent} defense`} subtitle="Per game this season. Rank 1 = fewest allowed.">
          <Card className="grid gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.upcoming.defenseRanks.map((r) => (
              <div key={r.label} className="flex justify-between border-b border-line py-1.5 text-sm">
                <span className="text-ink-2">{r.label}</span>
                <span className="num"><b>{r.value === null ? "—" : r.value.toFixed(r.digits ?? 1)}</b> <span className="text-xs text-ink-3">{r.rank ? `#${r.rank}/${r.of}` : ""}</span></span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Trends" subtitle={cur.length ? `${d.season} games` : "Most recent games"}>
        {chartLogs.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CHARTS.filter((c) => c.pos.includes(pos)).map((c) => {
              const data: StatPoint[] = chartLogs.map((l) => ({ label: `W${l.week}`, value: l.stats[c.key], opponent: l.opponent, home: l.home }));
              const avg = data.length ? data.reduce((a, b) => a + b.value, 0) / data.length : null;
              return <StatChart key={c.key} title={c.title} data={data} average={avg} />;
            })}
          </div>
        ) : <Empty>No game logs available.</Empty>}
      </Section>

      <Section title="Game logs">
        <Card className="overflow-x-auto p-4 scrollbar-thin">
          {d.logs.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1.5 pr-3 font-medium">Season</th><th className="pr-3 font-medium">Wk</th><th className="pr-3 font-medium">Opp</th><th className="pr-3 font-medium">Score</th>{cols.map((c) => <th key={c.key} className="pr-3 font-medium">{c.label}</th>)}</tr></thead>
              <tbody className="num">
                {d.logs.map((l) => (
                  <tr key={l.gameId} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-ink-2">{l.season}</td>
                    <td className="pr-3 text-ink-2">{l.week}</td>
                    <td className="pr-3 font-sans">{l.home ? "vs" : "@"} {l.opponent}</td>
                    <td className="pr-3 text-ink-2">{l.teamPoints > l.oppPoints ? "W" : l.teamPoints < l.oppPoints ? "L" : "T"} {l.teamPoints}-{l.oppPoints}</td>
                    {cols.map((c) => <td key={c.key} className="pr-3">{l.stats[c.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Unavailable what="Game logs" />}
        </Card>
      </Section>
    </div>
  );
}
