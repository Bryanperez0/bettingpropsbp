import type { AnalyzedProp, BookOption, PlayerGameLog, PropLineGroup, PropSide, WeatherInfo } from "../types";
import { MARKETS } from "./markets";
import type { LeagueContext } from "./league";
import { project, type TeammateOut } from "./projection";
import { buildHistory, computeHitRates } from "./hitRate";
import { scoreConfidence, tierFor, DEFAULT_IMPLIED } from "./confidence";
import { americanToProb, clamp, mean, median, noVig, normalCdf, poissonCdf, round, unitsWon } from "./stats";
import { calibrate } from "./calibration";

export interface AnalyzeInput {
  line: PropLineGroup;
  player: { id: string | null; name: string; team: string; position: string; headshot: string | null; injuryStatus: string | null };
  logs: PlayerGameLog[];
  season: number;
  week: number;
  kickoff: string;
  opponent: string;
  isHome: boolean;
  league: LeagueContext | null;
  teamSpread: number | null;
  gameTotal: number | null;
  weather: WeatherInfo | null;
  teammatesOut: TeammateOut[];
  /** Context the model does NOT adjust for, surfaced as a risk + confidence penalty. */
  contextFlags?: { risk: string; penalty: number }[];
  now: string;
}

export interface OutcomeProbs {
  over: number;
  under: number;
  push: number;
}

/** Probability of Over/Under/Push at a line given the model's distribution. */
export function outcomeProbs(market: AnalyzedProp["market"], mu: number, sd: number | null, line: number): OutcomeProbs {
  if (market === "anytime_td") {
    const p = 1 - Math.exp(-Math.max(0, mu));
    return { over: p, under: 1 - p, push: 0 };
  }
  if (market === "pass_tds") {
    const lam = Math.max(0.01, mu);
    if (Number.isInteger(line)) {
      const under = poissonCdf(line - 1, lam);
      const upTo = poissonCdf(line, lam);
      return { over: 1 - upTo, under, push: upTo - under };
    }
    const under = poissonCdf(Math.floor(line), lam);
    return { over: 1 - under, under, push: 0 };
  }
  const s = Math.max(0.5, sd ?? Math.max(1, mu * MARKETS[market].cvPrior));
  if (Number.isInteger(line) && MARKETS[market].integer) {
    const under = normalCdf((line - 0.5 - mu) / s);
    const over = 1 - normalCdf((line + 0.5 - mu) / s);
    return { over, under, push: Math.max(0, 1 - over - under) };
  }
  const under = normalCdf((line - mu) / s);
  return { over: 1 - under, under, push: 0 };
}

function sideLabel(market: AnalyzedProp["market"], side: PropSide, line: number): string {
  if (market === "anytime_td") return side === "over" ? "YES — scores a TD" : "NO — does not score";
  return `${side === "over" ? "OVER" : "UNDER"} ${line}`;
}

const fmt = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "n/a" : round(x, d).toFixed(d));

/**
 * Analyze one prop line. Returns null when the model cannot produce an
 * honest projection (e.g. no game logs) — such props are never ranked.
 */
export function analyzeProp(input: AnalyzeInput): AnalyzedProp | null {
  const cfg = MARKETS[input.line.market];
  const line = input.line.market === "anytime_td" ? 0.5 : input.line.line;
  if (line === null) return null;

  const proj = project({
    market: input.line.market,
    position: input.player.position,
    logs: input.logs,
    season: input.season,
    opponent: input.opponent,
    isHome: input.isHome,
    league: input.league,
    teamSpread: input.teamSpread,
    gameTotal: input.gameTotal,
    weather: input.weather,
    teammatesOut: input.teammatesOut,
  });
  if (!proj.ok) return null;

  const probs = outcomeProbs(input.line.market, proj.mean, proj.sd, line);
  // Condition on no push so probabilities compare cleanly with a two-way price.
  const noPush = (p: number) => (probs.push > 0 ? p / (1 - probs.push) : p);
  const rawOver = noPush(probs.over);
  const rawUnder = noPush(probs.under);

  // Market probability for each side: no-vig when both prices exist.
  const nv = noVig(input.line.overPrice, input.line.underPrice);
  let impliedOver: number | null = nv ? nv[0] : americanToProb(input.line.overPrice);
  let impliedUnder: number | null = nv ? nv[1] : americanToProb(input.line.underPrice);
  if (input.line.market === "anytime_td" && impliedUnder === null && impliedOver !== null) impliedUnder = 1 - impliedOver;
  if (input.line.market === "anytime_td" && impliedOver === null && impliedUnder !== null) impliedOver = 1 - impliedUnder;

  // The raw model is overconfident, so its probability is pulled most of the
  // way toward the market's (see calibration.ts). Both sides stay summing to 1.
  const pOver = calibrate(rawOver, impliedOver);
  const pUnder = calibrate(rawUnder, impliedUnder);

  // Pick the side with the larger edge vs the market. Without prices, the
  // more likely side wins (identical to projection vs line for O/U props).
  let side: PropSide;
  // Anytime TD is a Yes-only bet at sportsbooks, so it is always graded as
  // "Yes"; when the price isn't worth it the edge is negative, not a "No" pick.
  if (input.line.market === "anytime_td") side = "over";
  else if (impliedOver !== null && impliedUnder !== null) side = pOver - impliedOver >= pUnder - impliedUnder ? "over" : "under";
  else side = pOver >= pUnder ? "over" : "under";
  const modelProb = side === "over" ? pOver : pUnder;
  const rawModelProb = side === "over" ? rawOver : rawUnder;
  const impliedProb = side === "over" ? impliedOver : impliedUnder;
  const sidePrice = side === "over" ? input.line.overPrice : input.line.underPrice;
  const probEdge = modelProb - (impliedProb ?? DEFAULT_IMPLIED);
  const shop = shopBooks(input.line, side, proj.mean, proj.sd);

  const history = buildHistory(input.logs, input.line.market, line);
  const hitRates = computeHitRates(history, side, input.season);
  const curVals = history.filter((h) => h.season === input.season).map((h) => h.value);
  const allVals = history.map((h) => h.value);

  const matchupAvailable = !proj.missing.some((m) => m.startsWith("Opponent"));
  const environment = proj.factors.script * proj.factors.weather * proj.factors.homeAway;
  const confidence = scoreConfidence({
    market: input.line.market,
    side,
    modelProb,
    impliedProb,
    matchupFactor: proj.factors.matchup,
    matchupAvailable,
    environmentFactor: environment,
    injuryFactor: proj.factors.injury,
    volumeSeries: proj.volumeSeries,
    statSeries: curVals,
    hitRates,
    sample: proj.sample,
    injuryStatus: input.player.injuryStatus,
    oddsAvailable: sidePrice !== null,
    missing: proj.missing,
  });

  for (const f of input.contextFlags ?? []) {
    confidence.penalties.push({ label: f.risk, points: f.penalty });
    confidence.total = Math.max(0, confidence.total - f.penalty);
  }

  const isProb = cfg.unit === "prob";
  const projection = isProb ? 1 - Math.exp(-proj.mean) : proj.mean;
  const edge = isProb ? projection - (americanToProb(input.line.overPrice) ?? DEFAULT_IMPLIED) : projection - line;
  const edgePct = isProb || line === 0 ? null : (projection - line) / line;

  // ----- Reasons (all derived from computed numbers) -----
  const reasons: string[] = [];
  const risks = [...proj.risks, ...(input.contextFlags ?? []).map((f) => f.risk)];
  const statName = cfg.label.toLowerCase();
  const l5 = mean(allVals.slice(0, 5));
  const seasonAvg = mean(curVals);
  if (!isProb) {
    reasons.push(`Projects ${fmt(projection)} ${statName} vs a ${line} line (${edge >= 0 ? "+" : ""}${fmt(edge)}${edgePct !== null ? `, ${edgePct >= 0 ? "+" : ""}${fmt(edgePct * 100)}%` : ""})`);
    if (l5 !== null) reasons.push(`Averaging ${fmt(l5)} over the last ${Math.min(5, allVals.length)} games${seasonAvg !== null ? ` (${fmt(seasonAvg)} this season)` : ""}`);
  } else {
    reasons.push(`Model TD probability ${fmt(projection * 100)}% vs market ${impliedProb === null ? "n/a" : fmt((side === "over" ? impliedProb : 1 - impliedProb) * 100) + "%"}`);
    const tdGames = history.filter((h) => h.value > 0).length;
    reasons.push(`Scored in ${tdGames} of ${history.length} logged games`);
  }
  if (!isProb && (side === "under") === (projection > line)) {
    reasons.push(`Projection sits on the ${projection > line ? "over" : "under"} side, but that side is priced at ${side === "under" ? input.line.overPrice : input.line.underPrice}; the ${side} is the better value vs the price`);
  }
  const hr = hitRates.last5;
  if (hr.total > 0) reasons.push(`${side === "over" ? "Over" : "Under"} ${line} in ${hr.hits} of last ${hr.total - hr.pushes} games`);
  if (proj.volume.projected !== null) {
    reasons.push(`Projected ${fmt(proj.volume.projected)} ${proj.volume.label.toLowerCase()} (season ${fmt(proj.volume.season)}${proj.volume.share !== null ? `, ${proj.volume.shareLabel?.toLowerCase()} ${fmt(proj.volume.share * 100, 0)}%` : ""})`);
  }
  const m = proj.factors.matchup;
  const mRow = proj.matchup.find((r) => r.factor !== null) ?? proj.matchup[0];
  if (matchupAvailable && mRow && Math.abs(m - 1) >= 0.03) {
    const favorable = (m > 1) === (side === "over");
    const line2 = `Opponent ${mRow.label}: ${mRow.value} vs league ${mRow.leagueValue}${mRow.rank ? ` (rank ${mRow.rank}/${mRow.rankOf})` : ""}`;
    (favorable ? reasons : risks).push(line2);
  }
  for (const s of proj.steps) {
    if (s.label === "Game script" && Math.abs(proj.factors.script - 1) >= 0.02) {
      ((proj.factors.script > 1) === (side === "over") ? reasons : risks).push(`Game script: ${s.detail} (${s.value} volume)`);
    }
    if (s.label.startsWith("Weather") && s.detail) risks.push(`Weather: ${s.detail}`);
    if (s.label === "Teammate injury" && s.detail) reasons.push(`Injury context: ${s.detail}`);
  }
  if (input.player.injuryStatus && !/active/i.test(input.player.injuryStatus)) risks.push(`${input.player.name} is listed ${input.player.injuryStatus}`);
  if (sidePrice === null) risks.push("No price for this side — market probability assumed at -110");
  if (input.line.source === "demo") risks.push("DEMO line (player's recent median), not a sportsbook line");
  if (hitRates.season.pct !== null && hitRates.season.pct < 0.4 && hitRates.season.total >= 3) risks.push(`Only ${hitRates.season.hits}/${hitRates.season.total} this season at this line`);

  const explanation = buildExplanation({
    name: input.player.name, statName, side, line, projection, isProb, modelProb, rawModelProb, impliedProb,
    matchupFactor: m, env: environment, volume: proj.volume, confidence: confidence.total, sample: proj.sample,
  });

  const quality = clamp(1 - proj.missing.length * 0.12 - (proj.sample.current < 3 ? 0.2 : 0) - (sidePrice === null ? 0.1 : 0), 0, 1);

  return {
    id: propId(input.line.gameId, input.line.playerName, input.line.market),
    gameId: input.line.gameId,
    kickoff: input.kickoff,
    week: input.week,
    season: input.season,
    market: input.line.market,
    marketLabel: cfg.label,
    category: cfg.category,
    player: { ...input.player },
    opponent: input.opponent,
    isHome: input.isHome,
    line,
    lineSource: input.line.source,
    side,
    sideLabel: sideLabel(input.line.market, side, line),
    odds: { over: input.line.overPrice, under: input.line.underPrice, side: sidePrice },
    books: input.line.books,
    shop,
    firstSeen: input.line.firstSeen,
    opening: input.line.opening ?? null,
    projection: round(projection, isProb ? 3 : 1),
    unit: cfg.unit,
    edge: round(edge, isProb ? 3 : 1),
    edgePct: edgePct === null ? null : round(edgePct, 3),
    modelProb: round(modelProb, 3),
    rawModelProb: round(rawModelProb, 3),
    impliedProb: impliedProb === null ? null : round(impliedProb, 3),
    probEdge: round(probEdge, 3),
    confidence,
    tier: tierFor(confidence.total, probEdge),
    hitRates,
    history,
    averages: {
      season: seasonAvg === null ? null : round(seasonAvg, 1),
      last3: roundOrNull(mean(allVals.slice(0, 3))),
      last5: roundOrNull(l5),
      last10: roundOrNull(mean(allVals.slice(0, 10))),
      median: roundOrNull(median(curVals.length ? curVals : allVals)),
      games: proj.sample.current,
      priorSeasonGames: proj.sample.prior,
    },
    volume: {
      ...proj.volume,
      projected: roundOrNull(proj.volume.projected),
      season: roundOrNull(proj.volume.season),
      last3: roundOrNull(proj.volume.last3),
      share: proj.volume.share === null ? null : round(proj.volume.share, 3),
    },
    matchup: proj.matchup,
    steps: proj.steps,
    reasons,
    risks,
    explanation,
    dataQuality: { score: round(quality, 2), missing: proj.missing },
    generatedAt: input.now,
  };
}

/**
 * Line shopping: value the recommended side at every book using the model's
 * probability at THAT book's line, so a better number and a better price are
 * compared on the same scale (expected profit per unit).
 */
export function shopBooks(line: PropLineGroup, side: PropSide, mu: number, sd: number | null): BookOption[] {
  const out: BookOption[] = [];
  for (const b of line.books) {
    const price = side === "over" ? b.overPrice : b.underPrice;
    const at = line.market === "anytime_td" ? 0.5 : b.line;
    if (price === null || at === null) continue;
    const pr = outcomeProbs(line.market, mu, sd, at);
    const decided = pr.over + pr.under || 1;
    const nv = noVig(b.overPrice, b.underPrice);
    const market = nv ? nv[side === "over" ? 0 : 1] : americanToProb(price);
    const win = calibrate((side === "over" ? pr.over : pr.under) / decided, market) * (1 - pr.push);
    const lose = 1 - pr.push - win;
    out.push({ book: b.book, bookTitle: b.bookTitle, line: at, price, winProb: round(win, 3), ev: round(win * unitsWon(price) - lose, 3) });
  }
  return out.sort((a, b) => b.ev - a.ev || a.bookTitle.localeCompare(b.bookTitle));
}

const roundOrNull = (x: number | null) => (x === null ? null : round(x, 1));

/**
 * A recommendation is actionable only if a sportsbook prices the recommended
 * side (e.g. most books don't offer an anytime-TD "No"). Demo lines have no
 * prices by design and are labeled separately.
 */
export function isActionable(p: Pick<AnalyzedProp, "lineSource" | "odds">): boolean {
  return p.lineSource === "demo" || p.odds.side !== null;
}

export function propId(gameId: string, playerName: string, market: string): string {
  return `${gameId}-${market}-${playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function buildExplanation(a: {
  name: string; statName: string; side: PropSide; line: number; projection: number; isProb: boolean;
  modelProb: number; rawModelProb: number; impliedProb: number | null; matchupFactor: number; env: number;
  volume: AnalyzedProp["volume"]; confidence: number; sample: { current: number; prior: number };
}): string {
  const parts: string[] = [];
  if (a.isProb) {
    parts.push(`The model gives ${a.name} a ${fmt(a.projection * 100)}% chance to score (${a.side === "over" ? "Yes" : "No"} side ${fmt(a.modelProb * 100)}%${a.impliedProb !== null ? ` vs ${fmt(a.impliedProb * 100)}% implied by the odds` : ""}).`);
  } else {
    parts.push(`The model projects ${a.name} for ${fmt(a.projection)} ${a.statName} against a line of ${a.line}, which makes the ${a.side} a ${fmt(a.modelProb * 100)}% outcome${a.impliedProb !== null ? ` vs ${fmt(a.impliedProb * 100)}% implied by the price` : ""}.`);
  }
  if (Math.abs(a.rawModelProb - a.modelProb) >= 0.005) {
    parts.push(`The raw projection alone says ${fmt(a.rawModelProb * 100)}%; that is blended with the market because the raw model has been overconfident in tracked results.`);
  }
  const drivers: string[] = [];
  if (a.volume.projected !== null && a.volume.season !== null && a.volume.season > 0) {
    const r = a.volume.projected / a.volume.season;
    if (Math.abs(r - 1) >= 0.05) drivers.push(`${a.volume.label.toLowerCase()} projected ${r > 1 ? "above" : "below"} his season average`);
    else drivers.push(`steady ${a.volume.label.toLowerCase()}`);
  }
  if (Math.abs(a.matchupFactor - 1) >= 0.03) drivers.push(`a ${a.matchupFactor > 1 ? "favorable" : "tough"} opponent matchup (${a.matchupFactor > 1 ? "+" : ""}${fmt((a.matchupFactor - 1) * 100)}%)`);
  if (Math.abs(a.env - 1) >= 0.02) drivers.push(`game environment ${a.env > 1 ? "adds" : "subtracts"} ${fmt(Math.abs(a.env - 1) * 100)}%`);
  if (drivers.length) parts.push(`Main drivers: ${drivers.join(", ")}.`);
  if (a.sample.current < 3) parts.push(`Small sample this season (${a.sample.current} games), so treat this cautiously.`);
  parts.push(`Confidence ${a.confidence}/100. A projection is an estimate, not a guarantee.`);
  return parts.join(" ");
}
