import type { ConfidenceBreakdown, EdgeTier, HitRates, PropMarket, PropSide } from "../types";
import { MARKETS } from "./markets";
import { clamp, cv, mean, round } from "./stats";

export interface ConfidenceInput {
  market: PropMarket;
  side: PropSide;
  modelProb: number;
  impliedProb: number | null;
  /** Combined opponent factor applied in the projection (1 = neutral). */
  matchupFactor: number;
  matchupAvailable: boolean;
  /** Script x weather x home/away (1 = neutral). */
  environmentFactor: number;
  injuryFactor: number;
  volumeSeries: number[];
  statSeries: number[];
  hitRates: HitRates;
  sample: { current: number; prior: number };
  injuryStatus: string | null;
  oddsAvailable: boolean;
  missing: string[];
}

/** Assumed market probability when a price is missing (standard -110). */
export const DEFAULT_IMPLIED = 110 / 210;

const dir = (f: number, side: PropSide) => (side === "over" ? f : 1 / f);
const pctOr = (p: number | null, fallback = 0.5) => (p === null ? fallback : p);

/**
 * CONFIDENCE SCORE (0-100)
 * Six components, weighted per market (see markets.ts), minus explicit data
 * quality penalties. Every component is computed from model inputs; nothing
 * is random, and each shows its own detail string in the UI.
 */
export function scoreConfidence(i: ConfidenceInput): ConfidenceBreakdown {
  const cfg = MARKETS[i.market];
  const w = cfg.weights;
  const components: ConfidenceBreakdown["components"] = [];
  const add = (key: string, label: string, max: number, frac: number, detail: string) =>
    components.push({ key, label, max, score: round(max * clamp(frac, 0, 1), 1), detail });

  // 1. Model edge: model probability vs the market's (no-vig) probability.
  const implied = i.impliedProb ?? DEFAULT_IMPLIED;
  const probEdge = i.modelProb - implied;
  add("edge", "Model edge", w.edge, probEdge / cfg.fullEdge,
    `Model ${round(i.modelProb * 100, 1)}% vs market ${round(implied * 100, 1)}%${i.impliedProb === null ? " (assumed -110)" : ""} = ${probEdge >= 0 ? "+" : ""}${round(probEdge * 100, 1)} pts`);

  // 2. Matchup: opponent factor in the direction of the pick.
  if (i.matchupAvailable) {
    const d = dir(i.matchupFactor, i.side);
    add("matchup", "Matchup", w.matchup, 0.5 + (d - 1) / 0.3,
      `Opponent factor ${round((i.matchupFactor - 1) * 100, 1)}% (${d >= 1 ? "supports" : "works against"} the ${i.side})`);
  } else {
    add("matchup", "Matchup", w.matchup, 0.35, "Opponent data unavailable — partial credit only");
  }

  // 3. Volume: recent usage trend (and injury-driven change) plus stability.
  const vs = i.volumeSeries;
  const seasonVol = mean(vs);
  const l3Vol = mean(vs.slice(0, 3));
  const trend = seasonVol && l3Vol !== null ? l3Vol / seasonVol : 1;
  const trendScore = clamp(0.5 + (dir(trend * i.injuryFactor, i.side) - 1) / 0.4, 0, 1);
  const volCv = cv(vs);
  const stability = volCv === null ? 0.5 : clamp(1 - volCv, 0, 1);
  add("volume", "Volume / role", w.volume, 0.6 * trendScore + 0.4 * stability,
    vs.length ? `L3 ${round(l3Vol ?? 0, 1)} vs season ${round(seasonVol ?? 0, 1)} ${cfg.volumeLabel.toLowerCase()}; stability ${round(stability * 100, 0)}%` : "No current-season usage data");

  // 4. Recent form: last-5 and last-3 hit rates at the current line.
  const l5 = pctOr(i.hitRates.last5.pct);
  const l3 = pctOr(i.hitRates.last3.pct);
  add("form", "Recent form", w.form, 0.6 * l5 + 0.4 * l3,
    `${i.side} hit L5 ${i.hitRates.last5.hits}/${i.hitRates.last5.total - i.hitRates.last5.pushes}, L3 ${i.hitRates.last3.hits}/${i.hitRates.last3.total - i.hitRates.last3.pushes}`);

  // 5. Consistency: season hit rate + low game-to-game variance.
  const seasonHit = pctOr(i.hitRates.season.pct);
  const statCv = cv(i.statSeries);
  const cvDivisor = cfg.category === "touchdown" ? 1.5 : 1.2;
  const low = statCv === null ? 0.5 : clamp(1 - statCv / cvDivisor, 0, 1);
  add("consistency", "Consistency", w.consistency, 0.6 * seasonHit + 0.4 * low,
    `Season ${i.hitRates.season.hits}/${i.hitRates.season.total - i.hitRates.season.pushes} at this line; variability ${statCv === null ? "n/a" : round(statCv * 100, 0) + "% CV"}`);

  // 6. Environment: game script, weather, home/away in the pick's direction.
  const envD = dir(i.environmentFactor, i.side);
  add("environment", "Game environment", w.environment, 0.5 + (envD - 1) / 0.12,
    `Script/weather/venue factor ${round((i.environmentFactor - 1) * 100, 1)}%`);

  // Data-quality penalties (explicit, never hidden).
  const penalties: ConfidenceBreakdown["penalties"] = [];
  if (i.sample.current === 0) penalties.push({ label: "No games this season (last season only)", points: 15 });
  else if (i.sample.current < 3) penalties.push({ label: `Small sample (${i.sample.current} games)`, points: 10 });
  else if (i.sample.current < 5) penalties.push({ label: `Limited sample (${i.sample.current} games)`, points: 4 });
  if (!i.oddsAvailable) penalties.push({ label: "Odds unavailable for this side", points: 5 });
  if (!i.matchupAvailable) penalties.push({ label: "Opponent data unavailable", points: 4 });
  const st = (i.injuryStatus || "").toLowerCase();
  if (st.includes("questionable")) penalties.push({ label: "Player listed Questionable", points: 8 });
  if (st.includes("doubtful")) penalties.push({ label: "Player listed Doubtful", points: 20 });
  if (i.missing.includes("Game total/spread")) penalties.push({ label: "Game total/spread unavailable", points: 2 });
  if (i.missing.includes("Weather")) penalties.push({ label: "Weather unavailable", points: 2 });

  const raw = components.reduce((a, c) => a + c.score, 0) - penalties.reduce((a, p) => a + p.points, 0);
  return { total: Math.round(clamp(raw, 0, 100)), components, penalties };
}

export function tierFor(confidence: number, probEdge: number): EdgeTier {
  if (probEdge < 0 || confidence < 40) return "negative";
  if (confidence >= 72 && probEdge >= 0.06) return "strong";
  if (confidence >= 58 && probEdge >= 0.03) return "moderate";
  return "neutral";
}
