import type { Config } from "@netlify/functions";
import type { DashboardData } from "../../shared/api";
import { handle, json } from "../../server/respond";
import { getAnalysis, topProps } from "../../server/services/analysis";
import { slim, statusOf } from "../../server/services/details";
import { isOut } from "../../server/services/injuries";

export default handle(async () => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const slateTeams = new Set(snapshot.games.flatMap((g) => [g.home.abbr, g.away.abbr]));
  const keyInjuries = snapshot.injuries
    .filter((i) => slateTeams.has(i.team) && ["QB", "RB", "WR", "TE"].includes(i.position ?? "") && (isOut(i.status) || /doubtful|questionable/i.test(i.status)))
    .slice(0, 24);
  const data: DashboardData = { status: statusOf(snapshot), games: snapshot.games, top: topProps(snapshot.props, 12).map(slim), keyInjuries };
  return json(data, { sources: snapshot.sources, warnings: snapshot.warnings });
});

export const config: Config = { path: "/api/dashboard" };
