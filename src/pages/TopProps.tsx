import { useMemo, useState } from "react";
import { useProps } from "../hooks/useApi";
import { PropCard } from "../components/PropCard";
import { Freshness, Warnings } from "../components/Freshness";
import { StatusBanner } from "../components/StatusBanner";
import { Empty, ErrorState, PageHeader, Spinner } from "../components/ui";
import type { PropCategory } from "../../shared/types";
import { propHasStarted } from "../components/LiveTracker";

const TABS: { key: PropCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "passing", label: "Passing" },
  { key: "rushing", label: "Rushing" },
  { key: "receiving", label: "Receiving" },
  { key: "touchdown", label: "Touchdowns" },
];

type View = "top" | "all";

export default function TopProps() {
  const [view, setView] = useState<View>("top");
  const top = useProps(40);
  // Every analyzed prop; only fetched once "Show all props" is used.
  const all = useProps(undefined, view === "all");
  const q = view === "top" ? top : all;
  const [tab, setTab] = useState<PropCategory | "all">("all");
  const { list, started } = useMemo(() => {
    const byTab = (q.data?.data.props ?? []).filter((p) => tab === "all" || p.category === tab);
    const strongest = (a: typeof byTab[number], b: typeof byTab[number]) => b.confidence.total - a.confidence.total || b.probEdge - a.probEdge;
    const upcoming = byTab.filter((p) => !propHasStarted(p)).sort(strongest);
    const begun = byTab.filter((p) => propHasStarted(p)).sort(strongest);
    return view === "top"
      ? { list: upcoming.slice(0, 20), started: begun.slice(0, 20) }
      : { list: upcoming, started: begun };
  }, [q.data, tab, view]);

  if (q.isLoading) return <Spinner label={view === "top" ? "Ranking props" : "Loading every prop"} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const pill = (active: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2"}`;

  return (
    <div>
      <PageHeader
        title={view === "top" ? "Top Props" : "All Props"}
        subtitle={view === "top"
          ? "The 20 highest-confidence props with a positive edge on games that haven't started. Confidence is a 0–100 score built from model edge, matchup, volume, form, consistency and game environment, minus data-quality penalties. It is not a win probability."
          : "Every analyzed prop on upcoming games, strongest first, including neutral and negative ratings. Use this to look up any player's line and see what the model thinks."}
      >
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Which props to show">
          <button onClick={() => setView("top")} aria-pressed={view === "top"} className={pill(view === "top")}>Top 20</button>
          <button onClick={() => setView("all")} aria-pressed={view === "all"} className={pill(view === "all")}>Show all props</button>
        </div>
      </PageHeader>
      <StatusBanner status={q.data.data.status} />
      <Warnings warnings={q.data.warnings.filter((w) => !/ODDS_API_KEY|DEMO|box scores still loading/.test(w))} />
      <div className="mb-4"><Freshness sources={q.data.sources.filter((s) => ["props", "injuries", "schedule"].includes(s.key))} compact /></div>
      <div className="scrollbar-thin mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={pill(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {view === "all" && <p className="mb-3 text-xs text-ink-3">{list.length} upcoming{started.length ? ` · ${started.length} in progress or final` : ""}</p>}
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => <PropCard key={p.id} p={p} rank={view === "top" ? i + 1 : undefined} />)}
        </div>
      ) : (
        <Empty>{started.length ? "No upcoming games with props in this category. Picks from games in progress or finished are below." : "No props in this category right now."}</Empty>
      )}
      {started.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">In progress & final</h2>
          <p className="mb-3 mt-0.5 text-sm text-ink-3">Pregame picks from games that have started, with live stats. Confidence and lean are frozen at kickoff.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {started.map((p) => <PropCard key={p.id} p={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
