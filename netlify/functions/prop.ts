import type { Config } from "@netlify/functions";
import { error, handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";
import { readHistory } from "../../server/services/history";
import { readDataset } from "../../server/services/dataset";
import { buildPlayerLogs } from "../../shared/model/league";

export default handle(async (_req, params) => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const prop = snapshot.props.find((p) => p.id === params.id);
  if (!prop) return error("Prop not found. Lines may have been pulled or refreshed.", 404);
  const game = snapshot.games.find((g) => g.id === prop.gameId) ?? null;
  const injuries = snapshot.injuries.filter((i) => i.team === prop.player.team || i.team === prop.opponent);
  const history = await readHistory(prop.gameId, prop.id);

  // Full game logs (this season + last) and the player's other props, for the chart controls.
  const datasets = (await Promise.all([readDataset(snapshot.season - 1), readDataset(snapshot.season)])).filter((d) => d !== null);
  const logs = prop.player.id ? buildPlayerLogs(prop.player.id, datasets.flatMap((d) => d!.games)) : [];
  const playerProps = snapshot.props
    .filter((p) => p.gameId === prop.gameId && (prop.player.id ? p.player.id === prop.player.id : p.player.name === prop.player.name))
    .map((p) => ({ id: p.id, market: p.market, line: p.line, side: p.side, sideLabel: p.sideLabel }));

  return json({ prop, game, injuries, history, logs, playerProps }, { sources: snapshot.sources, warnings: snapshot.warnings });
});

export const config: Config = { path: "/api/props/:id" };
