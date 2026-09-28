/** Normalize player names so sportsbook names match ESPN names. */
export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "patrick mahomes" -> "p mahomes" (fallback key). */
export function shortKey(name: string): string {
  const n = normName(name).split(" ");
  if (n.length < 2) return n.join(" ");
  return `${n[0][0]} ${n[n.length - 1]}`;
}
