import { Link } from "react-router-dom";
import { useDashboard } from "../hooks/useApi";
import { PropCard } from "../components/PropCard";
import { GameCard } from "../components/GameParts";
import { InjuryTable } from "../components/GameParts";
import { Freshness, Warnings } from "../components/Freshness";
import { StatusBanner } from "../components/StatusBanner";
import { Card, Empty, ErrorState, PageHeader, Section, Spinner } from "../components/ui";

export default function Dashboard() {
  const q = useDashboard();
  if (q.isLoading) return <Spinner label="Loading this week's analysis" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { data, sources, warnings } = q.data;
  const upcoming = data.games.filter((g) => g.state !== "post");
  const seasonLabel = data.status.seasonType === 3 ? "Postseason" : data.status.seasonType === 1 ? "Preseason" : `Week ${data.status.week}`;

  return (
    <div>
      <PageHeader
        title="Today's Top NFL Props"
        subtitle={<>The strongest player props on the {data.status.season} {seasonLabel} slate, ranked by a transparent statistical model. Each card shows the projection, the line, the edge, and why.</>}
      >
        <Link to="/top" className="rounded-lg bg-over px-4 py-2 text-sm font-semibold text-white hover:brightness-110">See all top props</Link>
      </PageHeader>

      <StatusBanner status={data.status} />
      <Warnings warnings={warnings.filter((w) => !/ODDS_API_KEY|DEMO|box scores still loading/.test(w))} />
      <div className="mb-6"><Freshness sources={sources} compact /></div>

      <Section title="Top props" subtitle={`${data.status.stats.analyzed} props analyzed · ranked by confidence, then probability edge · max 2 per player`}>
        {data.top.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.top.map((p, i) => <PropCard key={p.id} p={p} rank={i + 1} />)}
          </div>
        ) : (
          <Empty>
            {data.status.oddsConfigured
              ? "No props currently show a positive edge on upcoming games. Lines may not be posted yet, or every game on this slate has started."
              : "No prop lines are loaded, so there is nothing to rank yet. See the note above."}
          </Empty>
        )}
      </Section>

      <Section title="This week's games" subtitle={`${upcoming.length} upcoming or live`} action={<Link to="/games" className="text-sm text-ink-2 hover:text-ink">All games →</Link>}>
        {data.games.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(upcoming.length ? upcoming : data.games).slice(0, 8).map((g) => <GameCard key={g.id} g={g} />)}
          </div>
        ) : <Empty>No games on the current slate.</Empty>}
      </Section>

      <Section title="Key skill-position injuries" subtitle="QB / RB / WR / TE listed Out, Doubtful or Questionable for teams on this slate" action={<Link to="/injuries" className="text-sm text-ink-2 hover:text-ink">All injuries →</Link>}>
        <Card className="p-4"><InjuryTable items={data.keyInjuries} showTeam empty="No skill-position injuries reported, or injury data is unavailable." /></Card>
      </Section>

      <Section title="Data freshness">
        <Card className="p-4"><Freshness sources={sources} /></Card>
      </Section>
    </div>
  );
}
