import type { Game, InjuryItem, SourceMeta } from "../../shared/types";
import { fetchLeagueInjuries, fetchSummary } from "../providers/espn";
import { cached, MIN } from "../cache";
import { mapLimit } from "../http";
import type { TeamListItem } from "../providers/espn";

/**
 * Injury reports. Primary: ESPN league-wide injuries feed. Fallback: the
 * injury section of each game summary on the current slate.
 */
export async function getInjuries(games: Game[], teams: TeamListItem[], deadline: number): Promise<{ injuries: InjuryItem[]; meta: SourceMeta }> {
  const byName = Object.fromEntries(teams.map((t) => [t.displayName, t.abbr]));
  try {
    const r = await cached("espn/injuries", 30 * MIN, async () => {
      const list = await fetchLeagueInjuries(byName);
      if (!list.length) throw new Error("empty league injury feed");
      return list;
    });
    return { injuries: r.data, meta: { key: "injuries", label: "Injury reports", provider: "ESPN", status: r.fromCache ? "cached" : "live", fetchedAt: r.fetchedAt } };
  } catch {
    const r = await cached(`espn/injuries-slate/${games.map((g) => g.id).join(",").slice(0, 200)}`, 30 * MIN, async () => {
      const res = await mapLimit(games, 6, (g) => fetchSummary(g.id), deadline);
      const all = res.flatMap((x) => x?.injuries ?? []);
      if (!all.length && res.every((x) => !x)) throw new Error("no injury data");
      return all;
    });
    return {
      injuries: r.data,
      meta: { key: "injuries", label: "Injury reports", provider: "ESPN (game summaries)", status: r.fromCache ? "cached" : "live", fetchedAt: r.fetchedAt, note: "Teams on bye are not included" },
    };
  }
}

const OUT_RE = /^(out|injured reserve|ir|suspension|suspended|physically unable|pup|non-football)/i;
export const isOut = (status: string | null | undefined) => !!status && OUT_RE.test(status.trim());
export const isDoubtful = (status: string | null | undefined) => !!status && /doubtful/i.test(status);
