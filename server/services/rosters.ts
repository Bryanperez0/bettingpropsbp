import type { RosterPlayer, SourceMeta } from "../../shared/types";
import { fetchRoster, fetchTeams, type TeamListItem } from "../providers/espn";
import { cached, readJSON, HOUR } from "../cache";
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
    let failed = teams.filter((_, i) => !res[i]).map((t) => t.abbr);
    if (failed.length === teams.length) throw new Error("All roster requests failed");
    let players = res.flatMap((x) => x ?? []);
    // Keep last good data: fill any team that failed this time from the previous save.
    if (failed.length) {
      const prev = (await readJSON<Rosters>("espn/rosters"))?.value;
      if (prev) {
        const reused = failed.filter((abbr) => prev.players.some((p) => p.team === abbr));
        players = [...players, ...prev.players.filter((p) => reused.includes(p.team))];
        failed = failed.filter((abbr) => !reused.includes(abbr));
      }
    }
    return { teams, players, failedTeams: failed } satisfies Rosters;
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
