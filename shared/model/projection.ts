import type { PlayerGameLog, ProjectionStep, PropMarket, StatLine, WeatherInfo, AnalyzedProp } from "../types";
import { MARKETS, positionGroup } from "./markets";
import { defenseRank, posVal, POS_COVERAGE_MIN, type LeagueContext, type PosKey, type TeamProfile } from "./league";
import { clamp, mean, round, shrinkRatio, shrinkTo, stdev, sum } from "./stats";

/**
 * PROJECTION MODEL
 * ----------------
 * Every projection is built from the player's own box-score history:
 *
 *   projection = projected volume x projected efficiency x adjustments
 *
 * - Volume and efficiency are recency-weighted blends of season (45%),
 *   last-5 (30%) and last-3 (25%) values. Early in the season, last
 *   season's numbers are blended in with a declining weight.
 * - Efficiency rates are regressed toward the league average for the
 *   position in proportion to sample size.
 * - Opponent factors compare what the opponent allows to the league
 *   average, regressed toward 1.0 by the opponent's games played, and capped.
 * - Game script / weather / home-away / injury adjustments are small,
 *   capped, and each one is shown in the calculation steps.
 */

export interface TeammateOut {
  id: string;
  name: string;
  position: string;
  status: string;
  /** Teammate's share of the relevant team volume this season (0-1). */
  share: number;
  volume: "targets" | "carries";
  /** Game ids where the teammate recorded stats. */
  gameIds: string[];
}

export interface ProjectionInput {
  market: PropMarket;
  position: string;
  logs: PlayerGameLog[];
  season: number;
  opponent: string;
  isHome: boolean;
  league: LeagueContext | null;
  /** Player's team spread (negative = favored). */
  teamSpread: number | null;
  gameTotal: number | null;
  weather: WeatherInfo | null;
  teammatesOut: TeammateOut[];
}

export interface ProjectionResult {
  ok: boolean;
  unavailableReason?: string;
  /** Projected stat, or the Poisson lambda for TD markets. */
  mean: number;
  sd: number | null;
  steps: ProjectionStep[];
  volume: AnalyzedProp["volume"];
  matchup: AnalyzedProp["matchup"];
  /** Multiplicative factors applied (1 = neutral). */
  factors: { matchup: number; script: number; weather: number; homeAway: number; injury: number };
  reasons: string[];
  risks: string[];
  missing: string[];
  sample: { current: number; prior: number };
  /** Per-game volume values (current season, newest first). */
  volumeSeries: number[];
}

// ---------------------------------------------------------------------------
// Blending helpers
// ---------------------------------------------------------------------------

const W_SEASON = 0.45;
const W_L5 = 0.3;
const W_L3 = 0.25;
/** Current-season games needed before last season stops contributing. */
const PRIOR_FULL = 4;
const PRIOR_MAX_WEIGHT = 0.6;

interface Blend {
  value: number;
  season: number | null;
  l5: number | null;
  l3: number | null;
  prior: number | null;
  priorWeight: number;
}

function weighted(parts: [number | null, number][]): number | null {
  const valid = parts.filter((p): p is [number, number] => p[0] !== null && Number.isFinite(p[0]));
  if (!valid.length) return null;
  const w = sum(valid.map((p) => p[1]));
  return valid.reduce((a, [v, wt]) => a + v * wt, 0) / w;
}

function priorWeight(n: number, priorN: number): number {
  if (priorN < 3) return 0;
  if (n === 0) return 1;
  if (n >= PRIOR_FULL) return 0;
  return ((PRIOR_FULL - n) / PRIOR_FULL) * PRIOR_MAX_WEIGHT;
}

/** Recency-weighted average of per-game values (newest first). */
export function blendPerGame(cur: number[], prior: number[]): Blend | null {
  const season = mean(cur);
  const l5 = mean(cur.slice(0, 5));
  const l3 = mean(cur.slice(0, 3));
  const curBlend = weighted([[season, W_SEASON], [l5, W_L5], [l3, W_L3]]);
  const pm = prior.length >= 3 ? mean(prior) : null;
  const pw = priorWeight(cur.length, prior.length);
  if (curBlend === null && pm === null) return null;
  const value = curBlend === null ? pm! : pm === null ? curBlend : curBlend * (1 - pw) + pm * pw;
  return { value, season, l5, l3, prior: pm, priorWeight: curBlend === null ? 1 : pm === null ? 0 : pw };
}

/** Recency-weighted ratio (e.g. yards per carry) using window sums. */
export function blendRate(
  cur: PlayerGameLog[],
  prior: PlayerGameLog[],
  num: (s: StatLine) => number,
  den: (s: StatLine) => number,
): { value: number | null; denom: number } {
  const ratio = (ls: PlayerGameLog[]) => {
    const d = sum(ls.map((l) => den(l.stats)));
    return d > 0 ? sum(ls.map((l) => num(l.stats))) / d : null;
  };
  const curBlend = weighted([[ratio(cur), W_SEASON], [ratio(cur.slice(0, 5)), W_L5], [ratio(cur.slice(0, 3)), W_L3]]);
  const pr = prior.length >= 3 ? ratio(prior) : null;
  const pw = priorWeight(cur.length, prior.length);
  const value = curBlend === null ? pr : pr === null ? curBlend : curBlend * (1 - pw) + pr * pw;
  const denom = sum(cur.map((l) => den(l.stats))) + 0.5 * sum(prior.map((l) => den(l.stats)));
  return { value, denom };
}

const f1 = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "n/a" : round(x, d).toFixed(d));
const pct = (x: number) => `${x >= 1 ? "+" : ""}${round((x - 1) * 100, 1)}%`;

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

/** Passing efficiency weather multiplier. Only wind, heavy precip, and extreme cold count. */
export function passWeatherFactor(w: WeatherInfo | null): { factor: number; note: string | null } {
  if (!w || w.indoor) return { factor: 1, note: w?.indoor ? "Indoor/dome: weather not applied" : null };
  let f = 1;
  const notes: string[] = [];
  if (w.windMph !== null && w.windMph >= 15) {
    const cut = Math.min(0.12, (w.windMph - 12) * 0.01);
    f *= 1 - cut;
    notes.push(`wind ${Math.round(w.windMph)} mph (-${round(cut * 100, 0)}%)`);
  }
  if (w.precipProb !== null && w.precipProb >= 60) {
    f *= 0.97;
    notes.push(`precip ${w.precipProb}% (-3%)`);
  }
  if (w.tempF !== null && w.tempF <= 20) {
    f *= 0.98;
    notes.push(`${Math.round(w.tempF)}°F (-2%)`);
  }
  return { factor: f, note: notes.length ? notes.join(", ") : null };
}

/** Rushing volume goes up slightly in heavy wind or rain (small, capped). */
function rushWeatherFactor(w: WeatherInfo | null): { factor: number; note: string | null } {
  if (!w || w.indoor) return { factor: 1, note: null };
  if ((w.windMph ?? 0) >= 20 || (w.precipProb ?? 0) >= 70) return { factor: 1.02, note: "bad weather (+2% carries)" };
  return { factor: 1, note: null };
}

/** Game-script multiplier on volume from the point spread. */
function scriptFactor(spread: number | null, kind: "rush" | "pass"): { factor: number; note: string | null } {
  if (spread === null) return { factor: 1, note: null };
  // Favorites (negative spread) run more late; underdogs throw more.
  const raw = kind === "rush" ? -spread * 0.008 : spread * 0.007;
  const f = 1 + clamp(raw, -0.06, 0.06);
  const role = spread < 0 ? `favored by ${Math.abs(spread)}` : spread > 0 ? `${spread}-pt underdog` : "pick'em";
  return { factor: f, note: `${role}` };
}

function homeAwayFactor(cur: PlayerGameLog[], stat: (s: StatLine) => number, isHome: boolean): { factor: number; note: string | null } {
  const home = cur.filter((l) => l.home).map((l) => stat(l.stats));
  const away = cur.filter((l) => !l.home).map((l) => stat(l.stats));
  const all = mean(cur.map((l) => stat(l.stats)));
  if (home.length < 2 || away.length < 2 || !all) return { factor: 1, note: null };
  const split = mean(isHome ? home : away)!;
  const f = clamp(1 + 0.3 * (split / all - 1), 0.95, 1.05);
  return { factor: f, note: `${isHome ? "home" : "away"} avg ${f1(split)} vs overall ${f1(all)}` };
}

/**
 * Teammate-absence adjustment. Only applied when the player has at least two
 * games WITH and two games WITHOUT the injured teammate; otherwise it's
 * reported but not applied (no assumed boost).
 */
function injuryFactor(
  logs: PlayerGameLog[],
  team: string,
  outs: TeammateOut[],
  volume: (s: StatLine) => number,
  kind: "targets" | "carries",
): { factor: number; notes: string[]; risks: string[] } {
  let f = 1;
  const notes: string[] = [];
  const risks: string[] = [];
  const teamLogs = logs.filter((l) => l.team === team);
  for (const t of outs.filter((o) => o.volume === kind && o.share >= 0.12)) {
    const played = new Set(t.gameIds);
    const withG = teamLogs.filter((l) => played.has(l.gameId)).map((l) => volume(l.stats));
    const without = teamLogs.filter((l) => !played.has(l.gameId)).map((l) => volume(l.stats));
    if (withG.length >= 2 && without.length >= 2 && mean(withG)! > 0) {
      const ratio = mean(without)! / mean(withG)!;
      const w = without.length / (without.length + 3);
      const adj = clamp(1 + (ratio - 1) * w, 0.85, 1.3);
      f *= adj;
      notes.push(`${t.name} (${t.status}) — ${kind} with: ${f1(mean(withG))}, without: ${f1(mean(without))} over ${without.length} g (${pct(adj)})`);
    } else {
      risks.push(`${t.name} (${t.position}, ${t.status}) held ${round(t.share * 100, 0)}% of team ${kind}; not enough games without him to adjust`);
    }
  }
  return { factor: clamp(f, 0.85, 1.35), notes, risks };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const unavailable = (reason: string, sample: { current: number; prior: number }): ProjectionResult => ({
  ok: false, unavailableReason: reason, mean: 0, sd: null, steps: [], matchup: [],
  volume: { label: "", projected: null, season: null, last3: null, share: null, shareLabel: null },
  factors: { matchup: 1, script: 1, weather: 1, homeAway: 1, injury: 1 },
  reasons: [], risks: [], missing: [reason], sample, volumeSeries: [],
});

export function project(input: ProjectionInput): ProjectionResult {
  const cfg = MARKETS[input.market];
  const cur = input.logs.filter((l) => l.season === input.season);
  const prior = input.logs.filter((l) => l.season === input.season - 1);
  const sample = { current: cur.length, prior: prior.length };
  if (!cur.length && prior.length < 3) return unavailable("No game logs available for this player", sample);

  const team = (cur[0] ?? prior[0]).team;
  const posKey: PosKey = positionGroup(input.position) ?? (input.market.startsWith("pass") ? "QB" : "WR");
  const L = input.league;
  const oppD: TeamProfile | null = L?.defense[input.opponent] ?? null;
  const lg = L?.league ?? null;
  const oppGames = oppD?.games ?? 0;
  const missing: string[] = [];
  const reasons: string[] = [];
  const risks: string[] = [];
  const steps: ProjectionStep[] = [];
  const matchup: AnalyzedProp["matchup"] = [];
  if (!oppD || !lg) missing.push("Opponent defensive data");
  // By-position splits need rosters for the players the opponent faced.
  const posOk = !!oppD && !!lg && (oppD.posCoverage ?? 0) >= POS_COVERAGE_MIN && (lg.posCoverage ?? 0) >= POS_COVERAGE_MIN;
  const POS_MISSING = "Opponent by-position data (incomplete rosters)";

  const perGame = (fn: (s: StatLine) => number) => ({
    cur: cur.map((l) => fn(l.stats)),
    prior: prior.map((l) => fn(l.stats)),
  });
  const addBlendSteps = (label: string, b: Blend) => {
    steps.push({
      label,
      value: f1(b.value),
      detail: `season ${f1(b.season)} x45% + L5 ${f1(b.l5)} x30% + L3 ${f1(b.l3)} x25%` +
        (b.priorWeight > 0 ? ` | blended ${round(b.priorWeight * 100, 0)}% with last season (${f1(b.prior)})` : ""),
    });
  };
  const oppRatio = (o: number | null, l: number | null, k = 4, lo = 0.85, hi = 1.15) =>
    o === null || l === null || l === 0 ? 1 : shrinkRatio(o / l, oppGames, k, lo, hi);
  const pushMatch = (label: string, o: number | null, l: number | null, metric: (p: TeamProfile) => number | null, factor: number | null, note: string, digits = 1) => {
    const r = L && o !== null ? defenseRank(L, input.opponent, metric) : null;
    matchup.push({ label, value: f1(o, digits), leagueValue: f1(l, digits), factor, rank: r?.rank ?? null, rankOf: r?.of ?? 32, note });
  };

  const volumeSeries = cur.map((l) => cfg.volume(l.stats));
  const teamVol = (kind: "targets" | "carries" | "attempts") =>
    sum(cur.map((l) => (kind === "targets" ? l.teamStats.targets : kind === "carries" ? l.teamStats.rushAtt : l.teamStats.passAtt)));

  let projected = 0;
  let sd: number | null = null;
  let factors = { matchup: 1, script: 1, weather: 1, homeAway: 1, injury: 1 };
  let volume: AnalyzedProp["volume"] = { label: cfg.volumeLabel, projected: null, season: null, last3: null, share: null, shareLabel: null };

  // ---------------- RUSHING ----------------
  if (input.market === "rush_yds" || input.market === "rush_attempts") {
    const car = blendPerGame(perGame((s) => s.rushAtt).cur, perGame((s) => s.rushAtt).prior);
    if (!car || car.value <= 0) return unavailable("No rushing volume in sample", sample);
    addBlendSteps("Baseline carries", car);

    const volRatio = oppRatio(oppD?.rushAtt ?? null, lg?.rushAtt ?? null, 4, 0.92, 1.08);
    const volM = Math.sqrt(volRatio);
    const script = scriptFactor(input.teamSpread, "rush");
    const wx = rushWeatherFactor(input.weather);
    const inj = injuryFactor(input.logs, team, input.teammatesOut, (s) => s.rushAtt, "carries");
    const projCarries = car.value * volM * script.factor * wx.factor * inj.factor;
    steps.push({ label: "Opponent rush attempts faced", value: pct(volM), detail: `${f1(oppD?.rushAtt)} att/g allowed vs league ${f1(lg?.rushAtt)} (regressed, square-root damped)` });
    if (script.note) steps.push({ label: "Game script", value: pct(script.factor), detail: script.note });
    if (wx.note) steps.push({ label: "Weather", value: pct(wx.factor), detail: wx.note });
    for (const n of inj.notes) steps.push({ label: "Teammate injury", value: pct(inj.factor), detail: n });
    risks.push(...inj.risks);
    steps.push({ label: "Projected carries", value: f1(projCarries) });

    const share = teamVol("carries") > 0 ? sum(volumeSeries) / teamVol("carries") : null;
    volume = { label: "Carries", projected: projCarries, season: car.season, last3: car.l3, share, shareLabel: "Rush share" };
    pushMatch("Rush yds allowed/g", oppD?.rushYds ?? null, lg?.rushYds ?? null, (p) => p.rushYds, null, "Rank 1 = fewest allowed");

    if (input.market === "rush_attempts") {
      const ha = homeAwayFactor(cur, (s) => s.rushAtt, input.isHome);
      projected = projCarries * ha.factor;
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      factors = { matchup: volM, script: script.factor, weather: wx.factor, homeAway: ha.factor, injury: inj.factor };
      pushMatch("Rush att faced/g", oppD?.rushAtt ?? null, lg?.rushAtt ?? null, (p) => p.rushAtt, volM, "Volume factor applied");
    } else {
      const lgYpc = lg && lg.rushAtt > 0 ? lg.rushYds / lg.rushAtt : null;
      const rate = blendRate(cur, prior, (s) => s.rushYds, (s) => s.rushAtt);
      const ypc = shrinkTo(rate.value, lgYpc, rate.denom, 60);
      if (ypc === null) return unavailable("No rushing efficiency data", sample);
      steps.push({ label: "Yards per carry", value: f1(ypc, 2), detail: `player ${f1(rate.value, 2)} regressed toward league ${f1(lgYpc, 2)} (${Math.round(rate.denom)} carries of evidence)` });
      const oppYpc = oppD && oppD.rushAtt > 0 ? oppD.rushYds / oppD.rushAtt : null;
      const effM = oppRatio(oppYpc, lgYpc, 4, 0.85, 1.15);
      steps.push({ label: "Opponent YPC allowed", value: pct(effM), detail: `${f1(oppYpc, 2)} allowed vs league ${f1(lgYpc, 2)} (regressed by ${oppGames} games)` });
      const ha = homeAwayFactor(cur, (s) => s.rushYds, input.isHome);
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      projected = projCarries * ypc * effM * ha.factor;
      factors = { matchup: volM * effM, script: script.factor, weather: wx.factor, homeAway: ha.factor, injury: inj.factor };
      pushMatch("YPC allowed", oppYpc, lgYpc, (p) => (p.rushAtt ? p.rushYds / p.rushAtt : null), effM, "Efficiency factor applied", 2);
      if (posOk) pushMatch("RB rush yds allowed/g", oppD!.pos.RB.rushYds, lg!.pos.RB.rushYds, (p) => posVal(p, (x) => x.RB.rushYds), null, "Context only");
    }
  }

  // ---------------- RECEIVING ----------------
  else if (input.market === "rec_yds" || input.market === "receptions" || input.market === "rec_longest") {
    const tg = blendPerGame(perGame((s) => s.targets).cur, perGame((s) => s.targets).prior);
    if (!tg || tg.value <= 0) return unavailable("No target data in sample", sample);
    addBlendSteps("Baseline targets", tg);
    const oP = posOk ? oppD!.pos[posKey] : null;
    const lP = lg?.pos[posKey] ?? null;
    if (oppD && lg && !posOk) missing.push(POS_MISSING);
    const tRatio = oppRatio(oP?.targets ?? null, lP?.targets ?? null, 4, 0.9, 1.1);
    const tM = Math.sqrt(tRatio);
    const script = scriptFactor(input.teamSpread, "pass");
    const inj = injuryFactor(input.logs, team, input.teammatesOut, (s) => s.targets, "targets");
    const projTargets = tg.value * tM * script.factor * inj.factor;
    steps.push({ label: `Opponent targets to ${posKey}s`, value: pct(tM), detail: `${f1(oP?.targets)} tgt/g allowed vs league ${f1(lP?.targets)} (regressed, damped)` });
    if (script.note) steps.push({ label: "Game script", value: pct(script.factor), detail: script.note });
    for (const n of inj.notes) steps.push({ label: "Teammate injury", value: pct(inj.factor), detail: n });
    risks.push(...inj.risks);
    steps.push({ label: "Projected targets", value: f1(projTargets) });
    const share = teamVol("targets") > 0 ? sum(volumeSeries) / teamVol("targets") : null;
    volume = { label: "Targets", projected: projTargets, season: tg.season, last3: tg.l3, share, shareLabel: "Target share" };
    const wx = passWeatherFactor(input.weather);

    const lgYpt = lP && lP.targets > 0 ? lP.recYds / lP.targets : null;
    const lgCatch = lP && lP.targets > 0 ? lP.rec / lP.targets : null;
    const oppYpt = oP && oP.targets > 0 ? oP.recYds / oP.targets : null;
    const oppCatch = oP && oP.targets > 0 ? oP.rec / oP.targets : null;
    pushMatch(`${posKey} rec yds allowed/g`, oP?.recYds ?? null, lP?.recYds ?? null, (p) => posVal(p, (x) => x[posKey].recYds), null, "Rank 1 = fewest allowed");
    pushMatch(`${posKey} targets allowed/g`, oP?.targets ?? null, lP?.targets ?? null, (p) => posVal(p, (x) => x[posKey].targets), tM, "Volume factor applied");
    pushMatch("Pass yds allowed/g", oppD?.passYds ?? null, lg?.passYds ?? null, (p) => p.passYds, null, "Context only");

    if (input.market === "rec_yds") {
      const rate = blendRate(cur, prior, (s) => s.recYds, (s) => s.targets);
      const ypt = shrinkTo(rate.value, lgYpt, rate.denom, 40);
      if (ypt === null) return unavailable("No receiving efficiency data", sample);
      steps.push({ label: "Yards per target", value: f1(ypt, 2), detail: `player ${f1(rate.value, 2)} regressed toward league ${posKey} ${f1(lgYpt, 2)} (${Math.round(rate.denom)} targets of evidence)` });
      const effM = oppRatio(oppYpt, lgYpt, 4, 0.85, 1.15);
      steps.push({ label: `Opponent yds/target to ${posKey}s`, value: pct(effM), detail: `${f1(oppYpt, 2)} vs league ${f1(lgYpt, 2)}` });
      if (wx.note) steps.push({ label: "Weather", value: pct(wx.factor), detail: wx.note });
      const ha = homeAwayFactor(cur, (s) => s.recYds, input.isHome);
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      projected = projTargets * ypt * effM * wx.factor * ha.factor;
      factors = { matchup: tM * effM, script: script.factor, weather: wx.factor, homeAway: ha.factor, injury: inj.factor };
      pushMatch(`Yds/target allowed to ${posKey}`, oppYpt, lgYpt, (p) => (posVal(p, (x) => x[posKey].targets) ? p.pos[posKey].recYds / p.pos[posKey].targets : null), effM, "Efficiency factor applied", 2);
    } else if (input.market === "receptions") {
      const rate = blendRate(cur, prior, (s) => s.rec, (s) => s.targets);
      const cr = shrinkTo(rate.value, lgCatch, rate.denom, 40);
      if (cr === null) return unavailable("No catch-rate data", sample);
      steps.push({ label: "Catch rate", value: `${f1(cr * 100)}%`, detail: `player ${f1((rate.value ?? 0) * 100)}% regressed toward league ${posKey} ${f1((lgCatch ?? 0) * 100)}%` });
      const effM = oppRatio(oppCatch, lgCatch, 4, 0.93, 1.07);
      steps.push({ label: `Opponent catch rate allowed to ${posKey}s`, value: pct(effM), detail: `${f1((oppCatch ?? 0) * 100)}% vs league ${f1((lgCatch ?? 0) * 100)}%` });
      const ha = homeAwayFactor(cur, (s) => s.rec, input.isHome);
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      projected = projTargets * cr * effM * ha.factor;
      factors = { matchup: tM * effM, script: script.factor, weather: 1, homeAway: ha.factor, injury: inj.factor };
      pushMatch(`Catch rate allowed to ${posKey}`, oppCatch === null ? null : oppCatch * 100, lgCatch === null ? null : lgCatch * 100, (p) => (posVal(p, (x) => x[posKey].targets) ? p.pos[posKey].rec / p.pos[posKey].targets : null), effM, "Efficiency factor applied");
    } else {
      // Longest reception: recency-weighted per-game long catch, scaled by the
      // target projection vs the player's usual volume, and opponent yds/catch.
      const lng = blendPerGame(perGame((s) => s.recLong).cur, perGame((s) => s.recLong).prior);
      if (!lng) return unavailable("No longest-reception data", sample);
      addBlendSteps("Baseline longest catch", lng);
      const volAdj = tg.value > 0 ? clamp(Math.sqrt(projTargets / tg.value), 0.9, 1.1) : 1;
      const oppYpr = oP && oP.rec > 0 ? oP.recYds / oP.rec : null;
      const lgYpr = lP && lP.rec > 0 ? lP.recYds / lP.rec : null;
      const effM = Math.sqrt(oppRatio(oppYpr, lgYpr, 4, 0.85, 1.15));
      steps.push({ label: "Target volume vs usual", value: pct(volAdj) });
      steps.push({ label: `Opponent yds/catch to ${posKey}s`, value: pct(effM), detail: `${f1(oppYpr)} vs league ${f1(lgYpr)} (damped)` });
      if (wx.note) steps.push({ label: "Weather", value: pct(wx.factor), detail: wx.note });
      projected = lng.value * volAdj * effM * wx.factor;
      factors = { matchup: tM * effM, script: script.factor, weather: wx.factor, homeAway: 1, injury: inj.factor };
    }
  }

  // ---------------- PASSING ----------------
  else if (input.market === "pass_yds" || input.market === "pass_attempts" || input.market === "pass_completions" || input.market === "pass_tds") {
    const att = blendPerGame(perGame((s) => s.passAtt).cur, perGame((s) => s.passAtt).prior);
    if (!att || att.value < 5) return unavailable("Not enough passing volume (not a regular passer)", sample);
    addBlendSteps("Baseline pass attempts", att);
    const aRatio = oppRatio(oppD?.passAtt ?? null, lg?.passAtt ?? null, 4, 0.92, 1.08);
    const aM = Math.sqrt(aRatio);
    const script = scriptFactor(input.teamSpread, "pass");
    const projAtt = att.value * aM * script.factor;
    steps.push({ label: "Opponent pass attempts faced", value: pct(aM), detail: `${f1(oppD?.passAtt)} att/g vs league ${f1(lg?.passAtt)} (regressed, damped)` });
    if (script.note) steps.push({ label: "Game script", value: pct(script.factor), detail: script.note });
    steps.push({ label: "Projected attempts", value: f1(projAtt) });
    volume = { label: "Pass attempts", projected: projAtt, season: att.season, last3: att.l3, share: null, shareLabel: null };
    const wx = passWeatherFactor(input.weather);
    const lgYpa = lg && lg.passAtt > 0 ? lg.passYds / lg.passAtt : null;
    const lgCmp = lg && lg.passAtt > 0 ? lg.passCmp / lg.passAtt : null;
    const oppYpa = oppD && oppD.passAtt > 0 ? oppD.passYds / oppD.passAtt : null;
    const oppCmp = oppD && oppD.passAtt > 0 ? oppD.passCmp / oppD.passAtt : null;
    pushMatch("Pass yds allowed/g", oppD?.passYds ?? null, lg?.passYds ?? null, (p) => p.passYds, null, "Rank 1 = fewest allowed");
    // Sacks the opponent's pass rush generated = sacks taken by the offenses it faced.
    pushMatch("Sacks generated/g (pressure proxy)", oppD?.sacks ?? null, lg?.sacks ?? null, (p) => -p.sacks, null, "Rank 1 = most sacks; context only");

    if (input.market === "pass_attempts") {
      const ha = homeAwayFactor(cur, (s) => s.passAtt, input.isHome);
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      projected = projAtt * ha.factor;
      factors = { matchup: aM, script: script.factor, weather: 1, homeAway: ha.factor, injury: 1 };
      pushMatch("Pass att faced/g", oppD?.passAtt ?? null, lg?.passAtt ?? null, (p) => p.passAtt, aM, "Volume factor applied");
    } else if (input.market === "pass_completions") {
      const rate = blendRate(cur, prior, (s) => s.passCmp, (s) => s.passAtt);
      const cmp = shrinkTo(rate.value, lgCmp, rate.denom, 150);
      if (cmp === null) return unavailable("No completion data", sample);
      steps.push({ label: "Completion %", value: `${f1(cmp * 100)}%`, detail: `player ${f1((rate.value ?? 0) * 100)}% regressed toward league ${f1((lgCmp ?? 0) * 100)}%` });
      const effM = oppRatio(oppCmp, lgCmp, 4, 0.94, 1.06);
      steps.push({ label: "Opponent completion % allowed", value: pct(effM), detail: `${f1((oppCmp ?? 0) * 100)}% vs league ${f1((lgCmp ?? 0) * 100)}%` });
      const wxc = wx.factor < 1 ? 1 - (1 - wx.factor) / 2 : 1;
      if (wx.note) steps.push({ label: "Weather (half effect on completions)", value: pct(wxc), detail: wx.note });
      const ha = homeAwayFactor(cur, (s) => s.passCmp, input.isHome);
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      projected = projAtt * cmp * effM * wxc * ha.factor;
      factors = { matchup: aM * effM, script: script.factor, weather: wxc, homeAway: ha.factor, injury: 1 };
      pushMatch("Completion % allowed", oppCmp === null ? null : oppCmp * 100, lgCmp === null ? null : lgCmp * 100, (p) => (p.passAtt ? p.passCmp / p.passAtt : null), effM, "Efficiency factor applied");
    } else if (input.market === "pass_yds") {
      const rate = blendRate(cur, prior, (s) => s.passYds, (s) => s.passAtt);
      const ypa = shrinkTo(rate.value, lgYpa, rate.denom, 150);
      if (ypa === null) return unavailable("No yards-per-attempt data", sample);
      steps.push({ label: "Yards per attempt", value: f1(ypa, 2), detail: `player ${f1(rate.value, 2)} regressed toward league ${f1(lgYpa, 2)} (${Math.round(rate.denom)} att of evidence)` });
      const effM = oppRatio(oppYpa, lgYpa, 4, 0.85, 1.15);
      steps.push({ label: "Opponent YPA allowed", value: pct(effM), detail: `${f1(oppYpa, 2)} vs league ${f1(lgYpa, 2)}` });
      if (wx.note) steps.push({ label: "Weather", value: pct(wx.factor), detail: wx.note });
      const ha = homeAwayFactor(cur, (s) => s.passYds, input.isHome);
      if (ha.note) steps.push({ label: "Home/away split", value: pct(ha.factor), detail: ha.note });
      projected = projAtt * ypa * effM * wx.factor * ha.factor;
      factors = { matchup: aM * effM, script: script.factor, weather: wx.factor, homeAway: ha.factor, injury: 1 };
      pushMatch("YPA allowed", oppYpa, lgYpa, (p) => (p.passAtt ? p.passYds / p.passAtt : null), effM, "Efficiency factor applied", 2);
    } else {
      // Passing TDs: Poisson. lambda = blended TD/game regressed to league QB rate,
      // scaled by opponent TD rate allowed and the team's implied total.
      const td = blendPerGame(perGame((s) => s.passTD).cur, perGame((s) => s.passTD).prior);
      if (!td) return unavailable("No passing TD data", sample);
      addBlendSteps("Baseline pass TDs/game", td);
      const lgTd = lg?.passTD ?? null;
      const lam0 = shrinkTo(td.value, lgTd, cur.length + prior.length * 0.5, 6)!;
      steps.push({ label: "Regressed TD rate", value: f1(lam0, 2), detail: `toward league ${f1(lgTd, 2)} per team-game` });
      const effM = oppRatio(oppD?.passTD ?? null, lgTd, 4, 0.8, 1.2);
      steps.push({ label: "Opponent pass TDs allowed", value: pct(effM), detail: `${f1(oppD?.passTD, 2)}/g vs league ${f1(lgTd, 2)}` });
      const implied = impliedTotal(input.gameTotal, input.teamSpread);
      const envM = implied !== null && lg ? clamp(implied / lg.points, 0.75, 1.3) : 1;
      if (implied !== null) steps.push({ label: "Implied team total", value: pct(envM), detail: `${f1(implied)} pts vs league ${f1(lg?.points)} per team-game` });
      else missing.push("Game total/spread");
      if (wx.note) steps.push({ label: "Weather", value: pct(wx.factor), detail: wx.note });
      projected = lam0 * effM * envM * wx.factor;
      factors = { matchup: effM, script: envM, weather: wx.factor, homeAway: 1, injury: 1 };
      pushMatch("Pass TDs allowed/g", oppD?.passTD ?? null, lgTd, (p) => p.passTD, effM, "Applied", 2);
    }
  }

  // ---------------- ANYTIME TD ----------------
  else if (input.market === "anytime_td") {
    const tdVals = perGame((s) => s.rushTD + s.recTD);
    const td = blendPerGame(tdVals.cur, tdVals.prior);
    const car = blendPerGame(perGame((s) => s.rushAtt).cur, perGame((s) => s.rushAtt).prior);
    const tg = blendPerGame(perGame((s) => s.targets).cur, perGame((s) => s.targets).prior);
    if (!td || !car || !tg) return unavailable("Not enough usage data", sample);
    const lP = lg?.pos[posKey] ?? null;
    const lgRbTdPerCarry = lg && lg.pos.RB.rushAtt > 0 ? lg.pos.RB.rushTD / lg.pos.RB.rushAtt : null;
    const lgTdPerTarget = lP && lP.targets > 0 ? lP.recTD / lP.targets : null;
    // Opportunity-based expectation: league TD rates applied to projected usage.
    const oppLambda = car.value * (lgRbTdPerCarry ?? 0) + tg.value * (lgTdPerTarget ?? 0);
    steps.push({ label: "Opportunities", value: `${f1(car.value)} car + ${f1(tg.value)} tgt`, detail: "recency-weighted" });
    steps.push({ label: "Usage-based TD expectation", value: f1(oppLambda, 3), detail: `league TD/carry ${f1(lgRbTdPerCarry, 3)}, TD/target (${posKey}) ${f1(lgTdPerTarget, 3)}` });
    const n = cur.length + prior.length * 0.5;
    const w = n / (n + 8);
    const lam0 = td.value * w + oppLambda * (1 - w);
    steps.push({ label: "Blended TD rate", value: f1(lam0, 3), detail: `actual ${f1(td.value, 3)}/g x ${round(w * 100, 0)}% + usage-based x ${round((1 - w) * 100, 0)}%` });
    const oP = posOk ? oppD!.pos[posKey] : null;
    if (oppD && lg && !posOk) missing.push(POS_MISSING);
    const oTd = oP ? oP.rushTD + oP.recTD : null;
    const lTd = lP ? lP.rushTD + lP.recTD : null;
    const effM = oppRatio(oTd, lTd, 4, 0.8, 1.2);
    steps.push({ label: `Opponent TDs allowed to ${posKey}s`, value: pct(effM), detail: `${f1(oTd, 2)}/g vs league ${f1(lTd, 2)}` });
    const implied = impliedTotal(input.gameTotal, input.teamSpread);
    const envM = implied !== null && lg ? clamp(implied / lg.points, 0.75, 1.3) : 1;
    if (implied !== null) steps.push({ label: "Implied team total", value: pct(envM), detail: `${f1(implied)} pts vs league ${f1(lg?.points)}` });
    else missing.push("Game total/spread");
    const inj = injuryFactor(input.logs, team, input.teammatesOut, (s) => s.rushAtt + s.targets, posKey === "RB" ? "carries" : "targets");
    risks.push(...inj.risks);
    for (const nn of inj.notes) steps.push({ label: "Teammate injury", value: pct(inj.factor), detail: nn });
    projected = lam0 * effM * envM * inj.factor;
    factors = { matchup: effM, script: envM, weather: 1, homeAway: 1, injury: inj.factor };
    volume = { label: "Opportunities", projected: car.value + tg.value, season: (car.season ?? 0) + (tg.season ?? 0), last3: (car.l3 ?? 0) + (tg.l3 ?? 0), share: null, shareLabel: null };
    pushMatch(`TDs allowed to ${posKey}s/g`, oTd, lTd, (p) => posVal(p, (x) => x[posKey].rushTD + x[posKey].recTD), effM, "Applied", 2);
    pushMatch("Points allowed/g", oppD?.points ?? null, lg?.points ?? null, (p) => p.points, null, "Context only");
    if (oppD?.redZoneTrips !== null && oppD?.redZoneTrips !== undefined) {
      pushMatch("Red-zone trips allowed/g", oppD.redZoneTrips, lg?.redZoneTrips ?? null, (p) => p.redZoneTrips, null, "Context only");
    }
  }

  if (!Number.isFinite(projected) || projected < 0) return unavailable("Projection could not be computed", sample);

  // Outcome spread: blend the player's own standard deviation with a prior CV.
  if (cfg.unit !== "prob" && input.market !== "pass_tds") {
    const own = stdev(cur.map((l) => cfg.stat(l.stats)));
    const priorSd = Math.max(1, projected * cfg.cvPrior);
    const w = own === null ? 0 : cur.length / (cur.length + 5);
    sd = Math.sqrt(w * (own ?? 0) ** 2 + (1 - w) * priorSd ** 2);
    steps.push({ label: "Outcome std. dev.", value: f1(sd), detail: `player ${f1(own)} (${round(w * 100, 0)}%) + prior ${round(cfg.cvPrior * 100, 0)}% of projection` });
  }

  if (sample.current < 3) risks.push(`Only ${sample.current} game(s) this season`);
  if (!input.weather && !missing.includes("Weather")) missing.push("Weather");
  if (input.teamSpread === null && !missing.includes("Game total/spread")) missing.push("Game total/spread");

  return {
    ok: true, mean: projected, sd, steps, volume, matchup, factors, reasons, risks, missing, sample, volumeSeries,
  };
}

/** Team implied points = total/2 - spread/2 (spread from that team's side). */
export function impliedTotal(total: number | null, teamSpread: number | null): number | null {
  if (total === null) return null;
  return total / 2 - (teamSpread ?? 0) / 2;
}
