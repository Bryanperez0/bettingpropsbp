import type { Game, LiveGame } from "../../shared/types";
import { fetchSummary } from "../providers/espn";
import { readJSON, writeJSON } from "../cache";
import { mapLimit } from "../http";

const LIVE_TTL_MS = 45_000;

/** Games that have started (or are about to): these get live box scores. */
export function startedGames(games: Game[], nowMs = Date.now()): Game[] {
  return games.filter((g) => g.state !== "pre" || Date.parse(g.date) <= nowMs + 60_000);
}

/**
 * In-game stats from ESPN's live box score. Cached ~45 seconds while a game
 * is in progress; kept for good once it is final.
 */
export async function getLiveGames(games: Game[]): Promise<Record<string, LiveGame>> {
  const now = Date.now();
  const list = startedGames(games, now);
  const results = await mapLimit(list, 6, async (g) => {
    const key = `live/${g.id}`;
    const hit = await readJSON<LiveGame>(key);
    if (hit && (hit.value.state === "post" || now - Date.parse(hit.savedAt) < LIVE_TTL_MS)) return hit.value;
    try {
      const r = await fetchSummary(g.id);
      const live: LiveGame = {
        gameId: g.id,
        state: r.state,
        detail: r.detail,
        homeScore: r.box?.home.score ?? null,
        awayScore: r.box?.away.score ?? null,
        players: Object.fromEntries((r.box?.players ?? []).map((p) => [p.id, p.stats])),
        fetchedAt: new Date().toISOString(),
      };
      await writeJSON(key, live);
      return live;
    } catch {
      return hit?.value; // keep showing the last live read if ESPN hiccups
    }
  });
  return Object.fromEntries(results.filter((x): x is LiveGame => !!x).map((x) => [x.gameId, x]));
}
