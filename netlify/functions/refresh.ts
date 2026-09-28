import type { Config } from "@netlify/functions";
import { error, handle, json } from "../../server/respond";
import { getAnalysis } from "../../server/services/analysis";
import { statusOf } from "../../server/services/details";
import { getConfig } from "../../server/config";
import { readJSON } from "../../server/cache";

/**
 * Manual refresh. Rebuilds the analysis immediately. Odds are still served
 * from cache until ODDS_CACHE_MINUTES passes, so this can't burn API credits.
 */
export default handle(async (req) => {
  if (req.method !== "POST") return error("Use POST", 405);
  const secret = getConfig().refreshSecret;
  if (secret && req.headers.get("x-refresh-secret") !== secret) return error("Unauthorized", 401);
  const last = await readJSON<{ generatedAt: string }>("analysis/current");
  if (last && Date.now() - Date.parse(last.savedAt) < 60_000) return error("Refreshed less than a minute ago", 429);
  const { snapshot } = await getAnalysis({ force: true, budgetMs: 8_000 });
  return json(statusOf(snapshot), { sources: snapshot.sources, warnings: snapshot.warnings, maxAge: 0 });
});

export const config: Config = { path: "/api/refresh", method: "POST" };
