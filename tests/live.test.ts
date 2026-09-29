import { describe, expect, it } from "vitest";
import { liveStatus } from "../shared/live";
import type { LiveGame } from "../shared/types";
import { line0 } from "./helpers";

const game = (state: LiveGame["state"], rec?: number, recTD = 0): LiveGame => ({
  gameId: "G", state, detail: "Q3 8:12", homeScore: 10, awayScore: 7, fetchedAt: "",
  players: rec === undefined ? {} : { p1: { ...line0(), rec, recTD } },
});
const under = { market: "receptions" as const, line: 2.5, side: "under" as const, player: { id: "p1" } };
const over = { ...under, side: "over" as const };

describe("live tracker", () => {
  it("is empty before kickoff", () => {
    expect(liveStatus(under, game("pre", 0))).toBeNull();
    expect(liveStatus(under, undefined)).toBeNull();
  });
  it("tracks an Under in progress", () => {
    expect(liveStatus(under, game("in", 1))).toMatchObject({ outcome: "alive", current: 1, text: "1 so far, alive (2 more would lose it)" });
    expect(liveStatus(under, game("in", 3))).toMatchObject({ outcome: "miss", text: "Under lost (3)" });
  });
  it("tracks an Over in progress, counting a player with no stats yet as 0", () => {
    expect(liveStatus(over, game("in"))).toMatchObject({ outcome: "alive", current: 0, text: "0 so far, needs 3 more" });
    expect(liveStatus(over, game("in", 4))).toMatchObject({ outcome: "hit" });
  });
  it("grades final results, pushes and DNPs", () => {
    expect(liveStatus(under, game("post", 2))).toMatchObject({ final: true, outcome: "hit" });
    expect(liveStatus(over, game("post", 2))).toMatchObject({ outcome: "miss" });
    expect(liveStatus({ ...over, line: 3 }, game("post", 3))).toMatchObject({ outcome: "push" });
    expect(liveStatus(over, game("post"))).toMatchObject({ outcome: "void" });
  });
  it("handles anytime TD", () => {
    const yes = { market: "anytime_td" as const, line: 0.5, side: "over" as const, player: { id: "p1" } };
    expect(liveStatus(yes, game("in", 2, 0))).toMatchObject({ outcome: "alive", text: "No TD yet" });
    expect(liveStatus(yes, game("in", 2, 1))).toMatchObject({ outcome: "hit", text: "Scored a TD" });
  });
});
