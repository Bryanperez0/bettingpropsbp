import { describe, expect, it } from "vitest";
import { nameScore, searchPlayers, matchesName } from "../shared/search";

const P = (name: string, propCount = 0) => ({ name, propCount });

describe("forgiving player search", () => {
  it("finds DeVonta Smith when spelled Davante", () => {
    expect(nameScore("Davante Smith", "DeVonta Smith")).toBeGreaterThan(0);
    expect(matchesName("davante", "DeVonta Smith")).toBe(true);
    expect(searchPlayers("Davante Smith", [P("DeVonta Smith"), P("Jaylen Smith"), P("Davante Adams")])[0].item.name).toBe("DeVonta Smith");
  });

  it("matches a first OR last name and lists every match", () => {
    const list = [P("Allen Lazard"), P("Josh Allen"), P("Keenan Allen"), P("Allen Robinson"), P("Mike Evans")];
    const names = searchPlayers("Allen", list).map((h) => h.item.name);
    expect(names).toHaveLength(4);
    expect(names).not.toContain("Mike Evans");
  });

  it("puts players with props this week first among equal matches", () => {
    const hits = searchPlayers("Allen", [P("Josh Allen", 0), P("Keenan Allen", 3)]);
    expect(hits[0].item.name).toBe("Keenan Allen");
  });

  it("handles typos, partial names, accents and suffixes", () => {
    expect(matchesName("Barkly", "Saquon Barkley")).toBe(true);     // one typo
    expect(matchesName("saq", "Saquon Barkley")).toBe(true);        // prefix
    expect(matchesName("burden", "Luther Burden III")).toBe(true);  // suffix ignored
    expect(matchesName("swift", "D'Andre Swift")).toBe(true);
    expect(matchesName("zzz", "Saquon Barkley")).toBe(false);
    expect(matchesName("Smith Jones", "DeVonta Smith")).toBe(false); // every word must match
  });

  it("ranks an exact name above a fuzzy one", () => {
    const hits = searchPlayers("Smith", [P("Smithson"), P("DeVonta Smith")]);
    expect(hits[0].item.name).toBe("DeVonta Smith");
  });

  it("caps the dropdown at 8 results", () => {
    expect(searchPlayers("aaron", Array.from({ length: 20 }, (_, i) => P(`Aaron Player${i}`)))).toHaveLength(8);
  });
});
