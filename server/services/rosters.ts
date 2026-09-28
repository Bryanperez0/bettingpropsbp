import type { RosterPlayer, SourceMeta } from "../../shared/types";
import { fetchRoster, fetchTeams, type TeamListItem } from "../providers/espn";
import { cached, HOUR } from "../cache";
import { mapLimit } from "../http";

export interface Rosters {
  teams: TeamListItem[];
  players: RosterPlayer[];
  failedTeams: string[];
}

export async function getTeams(): Promise<TeamListItem[]> {
  return (await cached("espn/teams", 7 * 24 * HOUR, fetchTeams)).data;
}

/** All 32 rosters (positions, headshots). Cached 12 hours. */
export async function getRosters(deadline: number): Promise<{ rosters: Rosters; meta: SourceMeta }> {
  const r = await cached("espn/rosters", 12 * HOUR, async () => {
    const teams = await getTeams();
    const res = await mapLimit(teams, 8, (t) => fetchRoster(t.id, t.abbr), deadline);
    const failedTeams = teams.filter((_, i) => !res[i]).map((t) => t.abbr);
    if (failedTeams.length === teams.length) throw new Error("All roster requests failed");
    return { teams, players: res.flatMap((x) => x ?? []), failedTeams } satisfies Rosters;
  });
  return {
    rosters: r.data,
    meta: {
      key: "rosters", label: "Rosters & positions", provider: "ESPN",
      status: r.fromCache ? "cached" : "live", fetchedAt: r.fetchedAt,
      note: r.data.failedTeams.length ? `Missing: ${r.data.failedTeams.join(", ")}` : undefined,
    },
  };
}

export function positionMap(rosters: Rosters): Record<string, string> {
  return Object.fromEntries(rosters.players.map((p) => [p.id, p.position]));
}
