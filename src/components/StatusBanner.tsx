import type { StatusInfo } from "../../shared/api";

/** Explains, in plain terms, anything that limits what the app can show. */
export function StatusBanner({ status }: { status: StatusInfo }) {
  const items: { tone: string; title: string; body: string }[] = [];
  if (!status.oddsConfigured && !status.demoLines) {
    items.push({
      tone: "border-negative/40 bg-negative/5",
      title: "Sportsbook prop lines are not connected",
      body: "Set ODDS_API_KEY in your Netlify environment variables to load real player prop lines. Until then the app shows schedules, stats, injuries and weather, but no prop recommendations.",
    });
  }
  if (status.demoLines) {
    items.push({
      tone: "border-fuchsia-500/40 bg-fuchsia-500/10",
      title: "DEMO LINES ARE ON",
      body: "No sportsbook is connected. Lines shown are each player's recent median (not real odds), so edges are not meaningful. Demo picks are never tracked.",
    });
  }
  if (status.stats.datasetPending > 0) {
    items.push({
      tone: "border-moderate/40 bg-moderate/5",
      title: "Still collecting box scores",
      body: `${status.stats.datasetPending} completed games are still loading. Projections improve as they arrive (automatic refresh every 15 minutes, or press Refresh).`,
    });
  }
  if (status.storage === "memory") {
    items.push({
      tone: "border-moderate/40 bg-moderate/5",
      title: "Running without persistent storage",
      body: "Netlify Blobs is not available in this environment, so caches and tracked picks reset when the server restarts. This is expected with plain `vite`; use `netlify dev` or deploy to Netlify.",
    });
  }
  if (!items.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {items.map((i) => (
        <div key={i.title} className={`rounded-xl border p-4 ${i.tone}`}>
          <p className="font-semibold text-ink">{i.title}</p>
          <p className="mt-1 text-sm text-ink-2">{i.body}</p>
        </div>
      ))}
    </div>
  );
}
