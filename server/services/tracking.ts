import type { AnalyzedProp, PerformanceBucket, PerformanceSummary, SeasonDataset, TrackedPick } from "../../shared/types";
import { MARKETS } from "../../shared/model/markets";
import { unitsWon } from "../../shared/model/stats";
import { normName } from "../../shared/names";
import { readJSON, writeJSON } from "../cache";

const LEDGER_KEY = "ledger/v1";
/** Props at or above this confidence are logged, so ranges can be compared. */
export const TRACK_MIN_CONFIDENCE = 50;

export async function readLedger(): Promise<TrackedPick[]> {
  return (await readJSON<TrackedPick[]>(LEDGER_KEY))?.value ?? [];
}

export function pickKey(p: { gameId: string; market: string; playerId: string | null; playerName: string; side: string }) {
  return `${p.gameId}|${p.market}|${p.playerId ?? normName(p.playerName)}|${p.side}`;
}

/**
 * Save each recommendation the FIRST time it appears, exactly as generated.
 * Later line moves never overwrite a stored pick. Demo lines are never logged.
 */
export function selectNewPicks(ledger: TrackedPick[], props: AnalyzedProp[], now: string): TrackedPick[] {
  const have = new Set(ledger.map((p) => p.id));
  const added: TrackedPick[] = [];
  for (const p of props) {
    if (p.lineSource !== "sportsbook") continue;
    if (p.confidence.total < TRACK_MIN_CONFIDENCE || p.probEdge <= 0) continue;
    if (Date.parse(p.kickoff) <= Date.parse(now)) continue;
    const id = pickKey({ gameId: p.gameId, market: p.market, playerId: p.player.id, playerName: p.player.name, side: p.side });
    if (have.has(id)) continue;
    have.add(id);
    added.push({
      id, createdAt: now, gameId: p.gameId, kickoff: p.kickoff, season: p.season, week: p.week,
      playerId: p.player.id, playerName: p.player.name, team: p.player.team, opponent: p.opponent, position: p.player.position,
      market: p.market, marketLabel: p.marketLabel, category: p.category, side: p.side, line: p.line,
      odds: p.odds.side, projection: p.projection, confidence: p.confidence.total, tier: p.tier, modelProb: p.modelProb,
      result: "pending", actual: null, gradedAt: null,
    });
  }
  return added;
}

export async function recordPicks(props: AnalyzedProp[], now: string): Promise<number> {
  const ledger = await readLedger();
  const added = selectNewPicks(ledger, props, now);
  if (added.length) await writeJSON(LEDGER_KEY, [...ledger, ...added]);
  return added.length;
}

/** Grade one pick against a final box score. */
export function gradePick(pick: TrackedPick, datasets: SeasonDataset[], now: string): TrackedPick {
  if (pick.result !== "pending") return pick;
  const box = datasets.flatMap((d) => d.games).find((g) => g.gameId === pick.gameId);
  if (!box) return pick;
  const player = box.players.find((p) => (pick.playerId ? p.id === pick.playerId : normName(p.name) === normName(pick.playerName)));
  if (!player) return { ...pick, result: "void", actual: null, gradedAt: now }; // did not record a stat (DNP / inactive)
  const actual = MARKETS[pick.market].stat(player.stats);
  const line = pick.market === "anytime_td" ? 0.5 : pick.line;
  const result = actual === line ? "push" : (actual > line) === (pick.side === "over") ? "win" : "loss";
  return { ...pick, result, actual, gradedAt: now };
}

export async function gradePicks(datasets: SeasonDataset[]): Promise<number> {
  const ledger = await readLedger();
  const now = new Date().toISOString();
  let changed = 0;
  const next = ledger.map((p) => {
    const g = gradePick(p, datasets, now);
    if (g !== p) changed++;
    return g;
  });
  if (changed) await writeJSON(LEDGER_KEY, next);
  return changed;
}

function bucket(key: string, label: string, picks: TrackedPick[]): PerformanceBucket {
  const graded = picks.filter((p) => p.result === "win" || p.result === "loss" || p.result === "push");
  const wins = graded.filter((p) => p.result === "win").length;
  const losses = graded.filter((p) => p.result === "loss").length;
  const pushes = graded.filter((p) => p.result === "push").length;
  const units = graded.reduce((a, p) => a + (p.result === "win" ? unitsWon(p.odds) : p.result === "loss" ? -1 : 0), 0);
  return { key, label, picks: picks.length, wins, losses, pushes, hitRate: wins + losses ? wins / (wins + losses) : null, units: Math.round(units * 100) / 100 };
}

export const CONFIDENCE_RANGES: [number, number][] = [[90, 100], [80, 89], [70, 79], [60, 69], [50, 59]];

export function summarize(ledger: TrackedPick[]): PerformanceSummary {
  const all = bucket("all", "All", ledger);
  const group = (keyOf: (p: TrackedPick) => string, labelOf: (k: string) => string = (k) => k) => {
    const m = new Map<string, TrackedPick[]>();
    for (const p of ledger) m.set(keyOf(p), [...(m.get(keyOf(p)) ?? []), p]);
    return [...m.entries()].map(([k, v]) => bucket(k, labelOf(k), v));
  };
  return {
    total: ledger.length,
    graded: all.wins + all.losses + all.pushes,
    pending: ledger.filter((p) => p.result === "pending").length,
    wins: all.wins,
    losses: all.losses,
    pushes: all.pushes,
    hitRate: all.hitRate,
    units: all.units,
    byConfidence: CONFIDENCE_RANGES.map(([lo, hi]) => bucket(`${lo}-${hi}`, `${lo}–${hi}`, ledger.filter((p) => p.confidence >= lo && p.confidence <= hi))),
    byCategory: group((p) => p.marketLabel),
    byPosition: group((p) => p.position || "?"),
    byWeek: group((p) => `${p.season}-${String(p.week).padStart(2, "0")}`, (k) => `${k.split("-")[0]} Wk ${Number(k.split("-")[1])}`).sort((a, b) => b.key.localeCompare(a.key)),
    recent: [...ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
  };
}
