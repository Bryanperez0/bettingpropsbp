import type { Config } from "@netlify/functions";
import { error, handle, json } from "../../server/respond";
import { gameDetail, loadContext } from "../../server/services/details";

export default handle(async (_req, params) => {
  const ctx = await loadContext();
  const detail = gameDetail(ctx, params.id);
  if (!detail) return error("Game not found on the current slate.", 404);
  return json(detail, { sources: ctx.sources, warnings: ctx.warnings });
});

export const config: Config = { path: "/api/games/:id" };
