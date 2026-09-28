import type { Game, SourceMeta } from "../../shared/types";
import { fetchScoreboard, type ScoreboardResult } from "../providers/espn";
import { cached, readJSON, writeJSON, MIN } from "../cache";

export interface Slate extends ScoreboardResult {
  fetchedAt: string;
  fromCache: boolean;
}

/** The current NFL week as ESPN defines it (their default scoreboard). */
export async function getCurrentSlate(): Promise<{ slate: Slate; meta: SourceMeta }> {
  const r = await cached("espn/scoreboard/current", 5 * MIN, () => fetchScoreboard());
  return {
    slate: { ...r.data, fetchedAt: r.fetchedAt, fromCache: r.fromCache },
    meta: {
      key: "schedule", label: "Schedule & game lines", provider: "ESPN",
      status: r.stale ? "cached" : r.fromCache ? "cached" : "live", fetchedAt: r.fetchedAt,
      note: r.stale ? "ESPN unavailable — showing last saved schedule" : undefined,
    },
  };
}

/** A specific week. Weeks where every game is final are kept permanently. */
export async function getWeekGames(season: number, seasonType: number, week: number): Promise<Game[]> {
  const key = `espn/scoreboard/${season}-${seasonType}-${week}`;
  const hit = await readJSON<Game[]>(key);
  if (hit) {
    const allFinal = hit.value.length > 0 && hit.value.every((g) => g.state === "post");
    if (allFinal || Date.now() - Date.parse(hit.savedAt) < 10 * MIN) return hit.value;
  }
  try {
    const sb = await fetchScoreboard({ year: season, seasonType, week });
    await writeJSON(key, sb.games);
    return sb.games;
  } catch (e) {
    if (hit) return hit.value;
    throw e;
  }
}
