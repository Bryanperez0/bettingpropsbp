import { normName } from "./names";

/**
 * Forgiving player-name matching for the search box.
 *
 * Each word the user types is compared with each word of the player's name
 * (first or last), and scored:
 *   exact word 1.0 · word starts with it 0.9 · same consonants 0.75
 *   (Davante ~ DeVonta) · one typo 0.7 · two typos on long words 0.55 ·
 *   contained in the name 0.5
 * Every typed word must match something; the player's score is the average.
 */

export const OFFENSE_POSITIONS = ["QB", "RB", "WR", "TE", "FB"];

export interface SearchablePlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  headshot: string | null;
  propCount: number;
  injuryStatus: string | null;
}

export interface SearchHit<T> {
  item: T;
  score: number;
}

/** Consonant outline: keep the first letter, drop later vowels and doubles. */
function skeleton(word: string): string {
  const first = word[0] ?? "";
  const rest = word.slice(1).replace(/[aeiouy]/g, "");
  return (first + rest).replace(/(.)\1+/g, "$1");
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function wordScore(q: string, w: string): number {
  if (q === w) return 1;
  if (w.startsWith(q)) return 0.9;
  if (q.length >= 3 && skeleton(q) === skeleton(w) && skeleton(q).length >= 2) return 0.75;
  if (q.length >= 4) {
    const d = editDistance(q, w, 2);
    if (d === 1) return 0.7;
    if (d === 2 && q.length >= 7) return 0.55;
  }
  if (q.length >= 3 && w.includes(q)) return 0.5;
  return 0;
}

/** 0 = no match; higher is better (max 1). */
export function nameScore(query: string, name: string): number {
  const qWords = normName(query).split(" ").filter(Boolean);
  const nWords = normName(name).split(" ").filter(Boolean);
  if (!qWords.length || !nWords.length) return 0;
  let total = 0;
  for (const q of qWords) {
    const best = Math.max(...nWords.map((w) => wordScore(q, w)));
    if (best === 0) return 0;
    total += best;
  }
  return total / qWords.length;
}

/** Ranked matches: best name match first, then players with props this week. */
export function searchPlayers<T extends { name: string; propCount?: number }>(query: string, players: T[], limit = 8): SearchHit<T>[] {
  if (!query.trim()) return [];
  const hits: SearchHit<T>[] = [];
  for (const p of players) {
    const s = nameScore(query, p.name);
    if (s > 0) hits.push({ item: p, score: s });
  }
  hits.sort((a, b) =>
    b.score - a.score ||
    Number((b.item.propCount ?? 0) > 0) - Number((a.item.propCount ?? 0) > 0) ||
    (b.item.propCount ?? 0) - (a.item.propCount ?? 0) ||
    a.item.name.localeCompare(b.item.name));
  return hits.slice(0, limit);
}

/** True when the name matches the query at all (used by list filters). */
export const matchesName = (query: string, name: string) => !query.trim() || nameScore(query, name) > 0;
