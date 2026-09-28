import { useMemo, useState } from "react";
import { useProps } from "../hooks/useApi";
import { PropCard } from "../components/PropCard";
import { Freshness, Warnings } from "../components/Freshness";
import { StatusBanner } from "../components/StatusBanner";
import { Empty, ErrorState, PageHeader, Spinner } from "../components/ui";
import type { PropCategory } from "../../shared/types";

const TABS: { key: PropCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "passing", label: "Passing" },
  { key: "rushing", label: "Rushing" },
  { key: "receiving", label: "Receiving" },
  { key: "touchdown", label: "Touchdowns" },
];

export default function TopProps() {
  const q = useProps(40);
  const [tab, setTab] = useState<PropCategory | "all">("all");
  const list = useMemo(() => (q.data?.data.props ?? []).filter((p) => tab === "all" || p.category === tab).slice(0, 20), [q.data, tab]);
  if (q.isLoading) return <Spinner label="Ranking props" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div>
      <PageHeader title="Top Props" subtitle="The 20 highest-confidence props with a positive edge on games that haven't started. Confidence is a 0–100 score built from model edge, matchup, volume, form, consistency and game environment, minus data-quality penalties. It is not a win probability." />
      <StatusBanner status={q.data.data.status} />
      <Warnings warnings={q.data.warnings.filter((w) => !/ODDS_API_KEY|DEMO|box scores still loading/.test(w))} />
      <div className="mb-4"><Freshness sources={q.data.sources.filter((s) => ["props", "injuries", "schedule"].includes(s.key))} compact /></div>
      <div className="scrollbar-thin mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.key ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => <PropCard key={p.id} p={p} rank={i + 1} />)}
        </div>
      ) : <Empty>No qualifying props in this category right now.</Empty>}
    </div>
  );
}
