import { useMemo, useState } from "react";
import { useInjuries } from "../hooks/useApi";
import { InjuryTable } from "../components/GameParts";
import { TeamLogo } from "../components/Media";
import { Freshness } from "../components/Freshness";
import { Card, Empty, ErrorState, PageHeader, Spinner } from "../components/ui";

const STATUSES = ["All", "Out", "Doubtful", "Questionable", "Injured Reserve"];

export default function Injuries() {
  const q = useInjuries();
  const [team, setTeam] = useState("All");
  const [status, setStatus] = useState("All");
  const [skillOnly, setSkillOnly] = useState(true);
  const all = q.data?.data.injuries ?? [];
  const list = useMemo(() => all.filter((i) =>
    (team === "All" || i.team === team) &&
    (status === "All" || i.status.toLowerCase().startsWith(status.toLowerCase())) &&
    (!skillOnly || ["QB", "RB", "WR", "TE", "FB"].includes(i.position ?? ""))), [all, team, status, skillOnly]);
  const byTeam = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const i of list) m.set(i.team, [...(m.get(i.team) ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  if (q.isLoading) return <Spinner label="Loading injury reports" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const teams = [...new Set(all.map((i) => i.team))].filter(Boolean).sort();
  return (
    <div>
      <PageHeader title="Injuries" subtitle="Current NFL injury reports. Out / IR players are excluded from prop rankings. Teammate absences adjust projections only when the player has games both with and without that teammate; otherwise they are listed as a risk, not assumed to help." />
      <div className="mb-4"><Freshness sources={q.data.sources} compact /></div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"><option value="All">All teams</option>{teams.map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-2"><input type="checkbox" checked={skillOnly} onChange={(e) => setSkillOnly(e.target.checked)} /> Skill positions only</label>
      </div>
      {byTeam.length ? (
        <div className="space-y-4">
          {byTeam.map(([t, items]) => (
            <Card key={t} className="p-4">
              <p className="mb-2 flex items-center gap-2 font-semibold"><TeamLogo abbr={t} size={22} />{q.data!.data.teams.find((x) => x.abbr === t)?.name ?? t} <span className="text-xs font-normal text-ink-3">{items.length}</span></p>
              <InjuryTable items={items} />
            </Card>
          ))}
        </div>
      ) : <Empty>{all.length ? "No injuries match these filters." : "Injury data is unavailable right now."}</Empty>}
    </div>
  );
}
