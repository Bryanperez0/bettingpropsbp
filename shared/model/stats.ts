// Small, dependency-free statistics helpers used by the model.

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (n - 1). Returns null with fewer than 2 values. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Coefficient of variation; null when mean is ~0 or sample too small. */
export function cv(xs: number[]): number | null {
  const m = mean(xs);
  const s = stdev(xs);
  if (m === null || s === null || Math.abs(m) < 1e-9) return null;
  return s / Math.abs(m);
}

export function round(x: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const poly = t * (a[0] + t * (a[1] + t * (a[2] + t * (a[3] + t * a[4]))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** P(X <= k) for X ~ Poisson(lambda). */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  let term = Math.exp(-lambda);
  let total = term;
  for (let i = 1; i <= Math.floor(k); i++) {
    term *= lambda / i;
    total += term;
  }
  return Math.min(1, total);
}

/**
 * Real American odds are -100 or below, or +100 or above. Feeds have sent
 * values like -1 or -6, which would read as near-certain prices and huge
 * payouts, so anything in between is rejected.
 */
export function isValidAmericanOdds(price: number | null | undefined): price is number {
  return typeof price === "number" && Number.isFinite(price) && Math.abs(price) >= 100;
}

/** American odds -> implied probability (includes the book's vig). Null for invalid odds. */
export function americanToProb(price: number | null | undefined): number | null {
  if (!isValidAmericanOdds(price)) return null;
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

/** Remove the vig from a two-way market. Returns [pA, pB] or null. */
export function noVig(priceA: number | null, priceB: number | null): [number, number] | null {
  const a = americanToProb(priceA);
  const b = americanToProb(priceB);
  if (a === null || b === null) return null;
  const t = a + b;
  return [a / t, b / t];
}

/** Profit in units for a 1-unit stake at American odds (used for ROI tracking). */
export function unitsWon(price: number | null): number {
  const p = price ?? -110;
  return p > 0 ? p / 100 : 100 / -p;
}

/**
 * Regress an observed ratio toward 1.0 based on sample size, then cap it.
 * weight = n / (n + k). Used for opponent matchup factors.
 */
export function shrinkRatio(ratio: number | null, n: number, k: number, lo: number, hi: number): number {
  if (ratio === null || !Number.isFinite(ratio)) return 1;
  const w = n / (n + k);
  return clamp(1 + (ratio - 1) * w, lo, hi);
}

/** Regress an observed value toward a prior. weight = n / (n + k). */
export function shrinkTo(observed: number | null, prior: number | null, n: number, k: number): number | null {
  if (observed === null) return prior;
  if (prior === null) return observed;
  const w = n / (n + k);
  return observed * w + prior * (1 - w);
}
