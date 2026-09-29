import type { Config } from "@netlify/functions";
import { handle, json } from "../../server/respond";
import { readJSON } from "../../server/cache";
import { getAnalysis, findInjury } from "../../server/services/analysis";
import type { Rosters } from "../../server/services/rosters";
import { OFFENSE_POSITIONS, type SearchablePlayer } from "../../shared/search";

/** Offensive players on every roster, for the search drop-down. */
export default handle(async () => {
  const { snapshot } = await getAnalysis({ budgetMs: 8_000 });
  const roster = (await readJSON<Rosters>("espn/rosters"))?.value?.players ?? [];
  const props = new Map<string, number>();
  for (const p of snapshot.props) if (p.player.id) props.set(p.player.id, (props.get(p.player.id) ?? 0) + 1);
  const players: SearchablePlayer[] = roster
    .filter((p) => OFFENSE_POSITIONS.includes(p.position))
    .map((p) => ({
      id: p.id, name: p.name, team: p.team, position: p.position, headshot: p.headshot,
      propCount: props.get(p.id) ?? 0,
      injuryStatus: findInjury(snapshot.injuries, { id: p.id, name: p.name, team: p.team })?.status ?? null,
    }));
  return json({ players }, { maxAge: 300 });
});

export const config: Config = { path: "/api/search-index" };
