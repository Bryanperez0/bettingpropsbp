import type { Config } from "@netlify/functions";
import type { TrackedPick } from "../../shared/types";
import { handle } from "../../server/respond";
import { readLedger } from "../../server/services/tracking";

/** Every tracked pick as CSV (signed-in users only, via handle()), for offline analysis. */
const COLUMNS: [string, (p: TrackedPick) => unknown][] = [
  ["id", (p) => p.id],
  ["created_at", (p) => p.createdAt],
  ["kickoff", (p) => p.kickoff],
  ["season", (p) => p.season],
  ["week", (p) => p.week],
  ["game_id", (p) => p.gameId],
  ["player_id", (p) => p.playerId],
  ["player", (p) => p.playerName],
  ["team", (p) => p.team],
  ["opponent", (p) => p.opponent],
  ["position", (p) => p.position],
  ["market", (p) => p.market],
  ["market_label", (p) => p.marketLabel],
  ["category", (p) => p.category],
  ["side", (p) => p.side],
  ["line", (p) => p.line],
  ["odds", (p) => p.odds],
  ["projection", (p) => p.projection],
  ["confidence", (p) => p.confidence],
  ["tier", (p) => p.tier],
  ["model_prob", (p) => p.modelProb],
  ["implied_prob", (p) => p.impliedProb],
  ["result", (p) => p.result],
  ["actual", (p) => p.actual],
  ["graded_at", (p) => p.gradedAt],
  ["close_source", (p) => p.close?.source],
  ["close_line", (p) => p.close?.line],
  ["close_over", (p) => p.close?.over],
  ["close_under", (p) => p.close?.under],
  ["close_line_move", (p) => p.close?.lineMove],
  ["close_prob_clv", (p) => p.close?.probClv],
  ["close_beat", (p) => p.close?.beat],
];

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default handle(async () => {
  const ledger = await readLedger();
  const rows = [COLUMNS.map(([h]) => h).join(","), ...ledger.map((p) => COLUMNS.map(([, get]) => cell(get(p))).join(","))];
  return new Response(rows.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="prop-lab-picks-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});

export const config: Config = { path: "/api/picks-export" };
