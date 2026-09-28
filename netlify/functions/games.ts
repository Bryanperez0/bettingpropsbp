import type { Config } from "@netlify/functions";
import { handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";
import { statusOf } from "../../server/services/details";

export default handle(async () => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const propCounts: Record<string, number> = {};
  for (const p of snapshot.props) propCounts[p.gameId] = (propCounts[p.gameId] ?? 0) + 1;
  return json({ status: statusOf(snapshot), games: snapshot.games, propCounts }, { sources: snapshot.sources, warnings: snapshot.warnings });
});

export const config: Config = { path: "/api/games" };
