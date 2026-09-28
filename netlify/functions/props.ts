import type { Config } from "@netlify/functions";
import type { PropsData } from "../../shared/api";
import { handle, json } from "../../server/respond";
import { getAnalysis, topProps } from "../../server/services/analysis";
import { slim, statusOf } from "../../server/services/details";

export default handle(async (req) => {
  const url = new URL(req.url);
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const top = url.searchParams.get("top");
  const list = top ? topProps(snapshot.props, Math.min(50, Number(top) || 20)) : snapshot.props;
  const data: PropsData = {
    status: statusOf(snapshot),
    props: list.map(slim),
    games: snapshot.games.map((g) => ({ id: g.id, shortName: g.shortName, date: g.date, home: g.home, away: g.away, state: g.state })),
  };
  return json(data, { sources: snapshot.sources, warnings: snapshot.warnings });
});

export const config: Config = { path: "/api/props" };
