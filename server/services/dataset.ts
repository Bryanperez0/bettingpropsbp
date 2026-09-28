import type { GameBox, SeasonDataset, SourceMeta } from "../../shared/types";
import { fetchSummary } from "../providers/espn";
import { readJSON, writeJSON } from "../cache";
import { mapLimit } from "../http";
import { getWeekGames } from "./schedule";

export interface DatasetResult {
  dataset: SeasonDataset;
  pending: number;
  totalCompleted: number;
}

/**
 * Builds a season of box scores incrementally. Completed games never change,
 * so each is fetched once and stored. Work stops at `deadline`; the next call
 * (or the scheduled refresh) continues where it left off.
 */
export async function getDataset(season: number, weeks: number[], deadline: number): Promise<DatasetResult> {
  const key = `dataset/${season}`;
  const saved = await readJSON<SeasonDataset>(key);
  const dataset: SeasonDataset = saved?.value ?? { season, builtAt: new Date(0).toISOString(), games: [] };
  const have = new Set(dataset.games.map((g) => g.gameId));

  const completed: string[] = [];
  const weekLists = await mapLimit(weeks, 6, (w) => getWeekGames(season, 2, w), deadline);
  for (const games of weekLists) for (const g of games ?? []) if (g.state === "post") completed.push(g.id);

  const missing = completed.filter((id) => !have.has(id));
  const added: GameBox[] = [];
  if (missing.length) {
    const results = await mapLimit(missing, 6, async (id) => (await fetchSummary(id)).box, deadline);
    for (const b of results) if (b && b.players.length) added.push(b);
  }
  if (added.length) {
    dataset.games = [...dataset.games, ...added].sort((a, b) => a.date.localeCompare(b.date));
    dataset.builtAt = new Date().toISOString();
    await writeJSON(key, dataset);
  }
  return { dataset, pending: missing.length - added.length, totalCompleted: completed.length };
}

export async function readDataset(season: number): Promise<SeasonDataset | null> {
  return (await readJSON<SeasonDataset>(`dataset/${season}`))?.value ?? null;
}

export function datasetMeta(d: DatasetResult, label: string): SourceMeta {
  return {
    key: `stats-${d.dataset.season}`,
    label,
    provider: "ESPN box scores",
    status: d.dataset.games.length ? (d.pending ? "cached" : "live") : "unavailable",
    fetchedAt: d.dataset.games.length ? d.dataset.builtAt : null,
    note: d.pending
      ? `${d.dataset.games.length}/${d.totalCompleted} completed games loaded; ${d.pending} still loading`
      : `${d.dataset.games.length} completed games`,
  };
}
