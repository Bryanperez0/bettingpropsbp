import { useGames } from "../hooks/useApi";
import { GameCard } from "../components/GameParts";
import { Freshness } from "../components/Freshness";
import { Empty, ErrorState, PageHeader, Section, Spinner } from "../components/ui";

export default function Games() {
  const q = useGames();
  if (q.isLoading) return <Spinner label="Loading games" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { games, propCounts, status } = q.data.data;
  const byDay = new Map<string, typeof games>();
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = new Date(g.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    byDay.set(k, [...(byDay.get(k) ?? []), g]);
  }
  return (
    <div>
      <PageHeader title={`Week ${status.week} Games`} subtitle="Click a game for lines, weather, injuries, team rankings and the highest-rated props in that matchup." />
      <div className="mb-6"><Freshness sources={q.data.sources.filter((s) => ["schedule", "weather", "props"].includes(s.key))} compact /></div>
      {games.length ? [...byDay.entries()].map(([day, list]) => (
        <Section key={day} title={day}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((g) => <GameCard key={g.id} g={g} propCount={propCounts[g.id] ?? 0} />)}
          </div>
        </Section>
      )) : <Empty>No games found for the current week.</Empty>}
    </div>
  );
}
