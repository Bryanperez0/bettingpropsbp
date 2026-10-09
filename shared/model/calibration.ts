/**
 * CALIBRATION: how much to trust the model over the sportsbook price.
 *
 * The raw model was badly overconfident. Its tracked picks averaged a 68%
 * win chance and actually hit 50.6% (710 graded picks, 2026 weeks 3-4).
 * Fitting final = market + w x (model - market) on the log-odds scale to
 * those results gave w = 0.06 (90% bootstrap range 0-0.18, resampled by
 * game). Leave-one-game-out testing scored w = 0.10 best of the round
 * values, so the final probability keeps 10% of the model's disagreement
 * with the market. Raw model probabilities (w = 1) fit worst of all.
 *
 * Refit as more weeks are graded: the evidence so far is one main weekend.
 */
export const MODEL_WEIGHT = 0.1;

const EPS = 1e-4;
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clampP = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));

/**
 * Blend the model's probability with the market's (no-vig) probability.
 * Without a market price, blends toward 50/50 so both sides still sum to 1.
 */
export function calibrate(modelProb: number, marketProb: number | null, weight = MODEL_WEIGHT): number {
  const m = clampP(modelProb);
  const q = clampP(marketProb ?? 0.5);
  return sigmoid(logit(q) + weight * (logit(m) - logit(q)));
}
