import type { Config } from "@netlify/functions";
import { handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";
import { getLiveGames } from "../../server/services/live";

/** Live in-game stats for games on the current slate that have started. */
export default handle(async () => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const games = await getLiveGames(snapshot.games);
  return json({ games }, { maxAge: 20 });
});

export const config: Config = { path: "/api/live" };
