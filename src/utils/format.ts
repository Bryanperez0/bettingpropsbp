import type { DataStatus, EdgeTier, PropMarket } from "../../shared/types";
import { MARKETS } from "../../shared/model/markets";

export const fmtFixed = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(d));

export const fmtOdds = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x > 0 ? `+${x}` : `${x}`);

export const fmtPct = (x: number | null | undefined, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`);

export const fmtSigned = (x: number | null | undefined, d = 1, suffix = "") =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(d)}${suffix}`;

export function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const marketLabel = (m: PropMarket) => MARKETS[m].label;

export const TIER_LABEL: Record<EdgeTier, string> = {
  strong: "Strong edge",
  moderate: "Moderate edge",
  neutral: "Neutral",
  negative: "Negative edge",
};

export const TIER_CLASSES: Record<EdgeTier, { text: string; bg: string; ring: string; bar: string }> = {
  strong: { text: "text-strong", bg: "bg-strong/10", ring: "ring-strong/40", bar: "bg-strong" },
  moderate: { text: "text-moderate", bg: "bg-moderate/10", ring: "ring-moderate/40", bar: "bg-moderate" },
  neutral: { text: "text-neutral", bg: "bg-neutral/10", ring: "ring-neutral/30", bar: "bg-neutral" },
  negative: { text: "text-negative", bg: "bg-negative/10", ring: "ring-negative/40", bar: "bg-negative" },
};

export const STATUS_META: Record<DataStatus, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-strong", text: "text-strong" },
  cached: { label: "Cached", dot: "bg-moderate", text: "text-moderate" },
  estimated: { label: "Estimated", dot: "bg-over", text: "text-over" },
  unavailable: { label: "Unavailable", dot: "bg-negative", text: "text-negative" },
  mock: { label: "Demo data", dot: "bg-fuchsia-400", text: "text-fuchsia-300" },
};

export function projectionText(unit: "yards" | "count" | "prob", x: number): string {
  return unit === "prob" ? fmtPct(x, 1) : fmtFixed(x, 1);
}
