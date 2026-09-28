import type { Config } from "@netlify/functions";
import { handle, json } from "../../server/respond";
import { loadContext, playerList } from "../../server/services/details";

export default handle(async () => {
  const ctx = await loadContext();
  return json({ season: ctx.snapshot.season, players: playerList(ctx) }, { sources: ctx.sources, warnings: ctx.warnings, maxAge: 300 });
});

export const config: Config = { path: "/api/players" };
