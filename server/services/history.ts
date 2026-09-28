import type { AnalyzedProp, ScoreHistoryEntry } from "../../shared/types";
import { readJSON, writeJSON } from "../cache";

const MAX_ENTRIES = 60;
const key = (gameId: string) => `history/${gameId}`;
type GameHistory = Record<string, ScoreHistoryEntry[]>;

function snapshotOf(p: AnalyzedProp, at: string): ScoreHistoryEntry {
  return {
    at,
    confidence: p.confidence.total,
    tier: p.tier,
    side: p.side,
    line: p.line,
    odds: p.odds.side,
    projection: p.projection,
    modelProb: p.modelProb,
    components: Object.fromEntries(p.confidence.components.map((c) => [c.label, c.score])),
    penalties: Object.fromEntries(p.confidence.penalties.map((x) => [x.label, x.points])),
    changes: [],
  };
}

const fmt = (x: number | null) => (x === null ? "none" : x > 0 ? `+${x}` : `${x}`);

/** Human-readable list of what moved between two recalculations. */
export function describeChanges(prev: ScoreHistoryEntry, cur: ScoreHistoryEntry): string[] {
  const out: string[] = [];
  if (prev.side !== cur.side) out.push(`Lean flipped ${prev.side.toUpperCase()} → ${cur.side.toUpperCase()}`);
  if (prev.line !== cur.line) out.push(`Line ${prev.line} → ${cur.line}`);
  if (prev.odds !== cur.odds) out.push(`Odds ${fmt(prev.odds)} → ${fmt(cur.odds)}`);
  if (Math.abs(prev.projection - cur.projection) >= 0.05) out.push(`Projection ${prev.projection} → ${cur.projection}`);
  for (const [label, score] of Object.entries(cur.components)) {
    const before = prev.components[label];
    if (before !== undefined && Math.abs(before - score) >= 0.5) out.push(`${label} ${before} → ${score}`);
  }
  for (const [label, pts] of Object.entries(cur.penalties)) {
    if (!(label in prev.penalties)) out.push(`Penalty added: ${label} (−${pts})`);
    else if (prev.penalties[label] !== pts) out.push(`Penalty changed: ${label} (−${prev.penalties[label]} → −${pts})`);
  }
  for (const [label, pts] of Object.entries(prev.penalties)) {
    if (!(label in cur.penalties)) out.push(`Penalty removed: ${label} (+${pts})`);
  }
  return out;
}

const changed = (a: ScoreHistoryEntry, b: ScoreHistoryEntry) =>
  a.confidence !== b.confidence || a.line !== b.line || a.odds !== b.odds || a.side !== b.side || Math.abs(a.projection - b.projection) >= 0.05;

/** Append an entry for every prop whose score, line, odds, lean or projection moved. */
export async function recordHistory(props: AnalyzedProp[], at: string): Promise<void> {
  const byGame = new Map<string, AnalyzedProp[]>();
  for (const p of props) byGame.set(p.gameId, [...(byGame.get(p.gameId) ?? []), p]);
  for (const [gameId, list] of byGame) {
    const hist: GameHistory = (await readJSON<GameHistory>(key(gameId)))?.value ?? {};
    let dirty = false;
    for (const p of list) {
      const entries = hist[p.id] ?? [];
      const cur = snapshotOf(p, at);
      const last = entries[entries.length - 1];
      if (last && !changed(last, cur)) continue;
      cur.changes = last ? describeChanges(last, cur) : ["First calculation"];
      hist[p.id] = [...entries, cur].slice(-MAX_ENTRIES);
      dirty = true;
    }
    if (dirty) await writeJSON(key(gameId), hist);
  }
}

export async function readHistory(gameId: string, propId: string): Promise<ScoreHistoryEntry[]> {
  return (await readJSON<GameHistory>(key(gameId)))?.value?.[propId] ?? [];
}
