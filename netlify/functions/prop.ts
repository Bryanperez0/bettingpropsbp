import type { Config } from "@netlify/functions";
import { error, handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";

export default handle(async (_req, params) => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const prop = snapshot.props.find((p) => p.id === params.id);
  if (!prop) return error("Prop not found. Lines may have been pulled or refreshed.", 404);
  const game = snapshot.games.find((g) => g.id === prop.gameId) ?? null;
  const injuries = snapshot.injuries.filter((i) => i.team === prop.player.team || i.team === prop.opponent);
  return json({ prop, game, injuries }, { sources: snapshot.sources, warnings: snapshot.warnings });
});

export const config: Config = { path: "/api/props/:id" };
