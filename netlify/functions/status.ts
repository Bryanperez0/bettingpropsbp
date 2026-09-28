import type { Config } from "@netlify/functions";
import { handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";
import { statusOf } from "../../server/services/details";

export default handle(async () => {
  const { snapshot, stale } = await getAnalysis({ budgetMs: 8_000 });
  return json({ ...statusOf(snapshot), stale }, { sources: snapshot.sources, warnings: snapshot.warnings, maxAge: 30 });
});

export const config: Config = { path: "/api/status" };
