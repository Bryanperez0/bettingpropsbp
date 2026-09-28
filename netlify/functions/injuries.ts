import type { Config } from "@netlify/functions";
import type { InjuriesData } from "../../shared/api";
import { handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";
import { readJSON } from "../../server/cache";
import type { Rosters } from "../../server/services/rosters";

export default handle(async () => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const rosters = (await readJSON<Rosters>("espn/rosters"))?.value;
  const teams = (rosters?.teams ?? []).map((t) => ({ abbr: t.abbr, name: t.displayName, logo: t.logo }));
  const data: InjuriesData = { injuries: snapshot.injuries, teams };
  return json(data, { sources: snapshot.sources.filter((s) => s.key === "injuries"), warnings: [] });
});

export const config: Config = { path: "/api/injuries" };
