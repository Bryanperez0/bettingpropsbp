import type { Config } from "@netlify/functions";
import { error, handle, json } from "../../server/respond";
import { loadContext, playerProfile } from "../../server/services/details";

export default handle(async (_req, params) => {
  const ctx = await loadContext();
  const profile = playerProfile(ctx, params.id);
  if (!profile) return error("Player not found in current data.", 404);
  return json(profile, { sources: ctx.sources, warnings: ctx.warnings });
});

export const config: Config = { path: "/api/players/:id" };
