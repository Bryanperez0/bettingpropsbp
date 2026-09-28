import type { GameBox, SeasonDataset, SourceMeta } from "../../shared/types";
import { fetchSummary } from "../providers/espn";
import { readJSON, writeJSON } from "../cache";
import { mapLimit } from "../http";
import { getWeekGames } from "./schedule";

export interface DatasetResult {
  dataset: SeasonDataset;
  pending: number;
  /** Games whose box score failed repeatedly and are no longer retried. */
  skipped: number;
  totalCompleted: number;
}

/** After this many failed fetches a game is skipped (reported, not retried every minute). */
const MAX_ATTEMPTS = 3;

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

  const failKey = `dataset-failures/${season}`;
  const failures: Record<string, number> = (await readJSON<Record<string, number>>(failKey))?.value ?? {};
  const missing = completed.filter((id) => !have.has(id) && (failures[id] ?? 0) < MAX_ATTEMPTS);
  const skipped = completed.filter((id) => !have.has(id) && (failures[id] ?? 0) >= MAX_ATTEMPTS).length;
  const added: GameBox[] = [];
  let failuresChanged = false;
  if (missing.length) {
    const results = await mapLimit(missing, 6, async (id) => {
      try {
        const box = (await fetchSummary(id)).box;
        if (!box || !box.players.length) throw new Error("no box score");
        return box;
      } catch (e) {
        failures[id] = (failures[id] ?? 0) + 1;
        failuresChanged = true;
        throw e;
      }
    }, deadline);
    for (const b of results) if (b) added.push(b);
  }
  if (failuresChanged) await writeJSON(failKey, failures);
  if (added.length) {
    dataset.games = [...dataset.games, ...added].sort((a, b) => a.date.localeCompare(b.date));
    dataset.builtAt = new Date().toISOString();
    await writeJSON(key, dataset);
  }
  const stillMissing = completed.filter((id) => !have.has(id) && !added.some((b) => b.gameId === id) && (failures[id] ?? 0) < MAX_ATTEMPTS).length;
  return { dataset, pending: stillMissing, skipped: skipped + (missing.length - added.length - stillMissing), totalCompleted: completed.length };
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
    note: (d.pending
      ? `${d.dataset.games.length}/${d.totalCompleted} completed games loaded; ${d.pending} still loading`
      : `${d.dataset.games.length} completed games`) + (d.skipped ? `; ${d.skipped} box score(s) unavailable from ESPN` : ""),
  };
}
