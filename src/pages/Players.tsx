import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayers } from "../hooks/useApi";
import { PlayerAvatar, TeamLogo } from "../components/Media";
import { InjuryStatus } from "../components/GameParts";
import { Empty, ErrorState, PageHeader, Spinner } from "../components/ui";
import { positionGroup } from "../../shared/model/markets";

const POS = ["All", "QB", "RB", "WR", "TE"];

export default function Players() {
  const q = usePlayers();
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState("All");
  const [team, setTeam] = useState("All");
  const [withProps, setWithProps] = useState(false);
  const players = q.data?.data.players ?? [];
  const teams = useMemo(() => ["All", ...[...new Set(players.map((p) => p.team))].sort()], [players]);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return players.filter((p) => (pos === "All" || positionGroup(p.position) === pos) && (team === "All" || p.team === team) && (!withProps || p.propCount > 0) && (!s || p.name.toLowerCase().includes(s)));
  }, [players, search, pos, team, withProps]);

  if (q.isLoading) return <Spinner label="Loading players" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div>
      <PageHeader title="Players" subtitle={`Skill-position players with ${q.data.data.season} game logs. Per-game averages this season.`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player" aria-label="Search player"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-over focus:outline-none sm:w-64" />
        <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">{POS.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">{teams.map((t) => <option key={t}>{t}</option>)}</select>
        <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-2"><input type="checkbox" checked={withProps} onChange={(e) => setWithProps(e.target.checked)} /> Has props this week</label>
      </div>
      <p className="mb-3 text-xs text-ink-3">{list.length} players</p>
      {list.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, 150).map((p) => (
            <Link key={p.id} to={`/players/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-ink-3 hover:bg-surface-2">
              <PlayerAvatar name={p.name} src={p.headshot} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.injuryStatus && <InjuryStatus status={p.injuryStatus} />}
                </div>
                <div className="flex items-center gap-1 text-xs text-ink-3"><TeamLogo abbr={p.team} size={14} />{p.team} · {p.position} · {p.games} g{p.propCount ? ` · ${p.propCount} props` : ""}</div>
                <div className="num mt-1 flex gap-3 text-xs text-ink-2">{p.headline.map((h) => <span key={h.label}>{h.label} <b className="text-ink">{h.value}</b></span>)}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : <Empty>No players match these filters.</Empty>}
      {list.length > 150 && <p className="mt-3 text-xs text-ink-3">Showing the first 150. Narrow the filters to see more.</p>}
    </div>
  );
}
