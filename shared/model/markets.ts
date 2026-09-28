import type { PropCategory, PropMarket, StatLine } from "../types";

/**
 * Confidence component weights (each set sums to 100). Different prop types
 * lean on different evidence: volume props weight usage heavily, TD props
 * weight the model edge and game environment, longest-reception weights
 * consistency because single plays drive it.
 */
export interface ConfidenceWeights {
  edge: number;
  matchup: number;
  volume: number;
  form: number;
  consistency: number;
  environment: number;
}

export interface MarketConfig {
  key: PropMarket;
  label: string;
  short: string;
  category: PropCategory;
  unit: "yards" | "count" | "prob";
  /** The Odds API market key. */
  oddsApiKey: string;
  stat: (s: StatLine) => number;
  /** Stat is integer-valued (affects push handling on whole-number lines). */
  integer: boolean;
  /**
   * Prior coefficient of variation used to size the outcome distribution when
   * the player's own sample is small. Model assumption, documented on the
   * Methodology page.
   */
  cvPrior: number;
  positions: string[];
  volumeLabel: string;
  volume: (s: StatLine) => number;
  weights: ConfidenceWeights;
  /** Probability edge (model minus market) that earns the full edge score. */
  fullEdge: number;
}

export const MARKETS: Record<PropMarket, MarketConfig> = {
  pass_yds: {
    key: "pass_yds", label: "Passing Yards", short: "Pass Yds", category: "passing", unit: "yards",
    oddsApiKey: "player_pass_yds", stat: (s) => s.passYds, integer: true, cvPrior: 0.26,
    positions: ["QB"], volumeLabel: "Pass attempts", volume: (s) => s.passAtt,
    weights: { edge: 30, matchup: 20, volume: 15, form: 15, consistency: 10, environment: 10 }, fullEdge: 0.14,
  },
  pass_tds: {
    key: "pass_tds", label: "Passing TDs", short: "Pass TDs", category: "passing", unit: "count",
    oddsApiKey: "player_pass_tds", stat: (s) => s.passTD, integer: true, cvPrior: 0.7,
    positions: ["QB"], volumeLabel: "Pass attempts", volume: (s) => s.passAtt,
    weights: { edge: 35, matchup: 20, volume: 10, form: 10, consistency: 10, environment: 15 }, fullEdge: 0.15,
  },
  pass_completions: {
    key: "pass_completions", label: "Pass Completions", short: "Completions", category: "passing", unit: "count",
    oddsApiKey: "player_pass_completions", stat: (s) => s.passCmp, integer: true, cvPrior: 0.2,
    positions: ["QB"], volumeLabel: "Pass attempts", volume: (s) => s.passAtt,
    weights: { edge: 30, matchup: 15, volume: 20, form: 15, consistency: 10, environment: 10 }, fullEdge: 0.14,
  },
  pass_attempts: {
    key: "pass_attempts", label: "Pass Attempts", short: "Attempts", category: "passing", unit: "count",
    oddsApiKey: "player_pass_attempts", stat: (s) => s.passAtt, integer: true, cvPrior: 0.18,
    positions: ["QB"], volumeLabel: "Pass attempts", volume: (s) => s.passAtt,
    weights: { edge: 30, matchup: 10, volume: 25, form: 15, consistency: 10, environment: 10 }, fullEdge: 0.14,
  },
  rush_yds: {
    key: "rush_yds", label: "Rushing Yards", short: "Rush Yds", category: "rushing", unit: "yards",
    oddsApiKey: "player_rush_yds", stat: (s) => s.rushYds, integer: true, cvPrior: 0.5,
    positions: ["RB", "QB", "WR", "FB"], volumeLabel: "Carries", volume: (s) => s.rushAtt,
    weights: { edge: 30, matchup: 20, volume: 20, form: 15, consistency: 10, environment: 5 }, fullEdge: 0.14,
  },
  rush_attempts: {
    key: "rush_attempts", label: "Rush Attempts", short: "Carries", category: "rushing", unit: "count",
    oddsApiKey: "player_rush_attempts", stat: (s) => s.rushAtt, integer: true, cvPrior: 0.33,
    positions: ["RB", "QB", "FB"], volumeLabel: "Carries", volume: (s) => s.rushAtt,
    weights: { edge: 30, matchup: 10, volume: 30, form: 15, consistency: 10, environment: 5 }, fullEdge: 0.14,
  },
  rec_yds: {
    key: "rec_yds", label: "Receiving Yards", short: "Rec Yds", category: "receiving", unit: "yards",
    oddsApiKey: "player_reception_yds", stat: (s) => s.recYds, integer: true, cvPrior: 0.6,
    positions: ["WR", "TE", "RB", "FB"], volumeLabel: "Targets", volume: (s) => s.targets,
    weights: { edge: 30, matchup: 20, volume: 20, form: 15, consistency: 10, environment: 5 }, fullEdge: 0.14,
  },
  receptions: {
    key: "receptions", label: "Receptions", short: "Rec", category: "receiving", unit: "count",
    oddsApiKey: "player_receptions", stat: (s) => s.rec, integer: true, cvPrior: 0.45,
    positions: ["WR", "TE", "RB", "FB"], volumeLabel: "Targets", volume: (s) => s.targets,
    weights: { edge: 30, matchup: 15, volume: 25, form: 15, consistency: 10, environment: 5 }, fullEdge: 0.14,
  },
  rec_longest: {
    key: "rec_longest", label: "Longest Reception", short: "Long Rec", category: "receiving", unit: "yards",
    oddsApiKey: "player_reception_longest", stat: (s) => s.recLong, integer: true, cvPrior: 0.55,
    positions: ["WR", "TE", "RB", "FB"], volumeLabel: "Targets", volume: (s) => s.targets,
    weights: { edge: 30, matchup: 15, volume: 15, form: 15, consistency: 20, environment: 5 }, fullEdge: 0.14,
  },
  anytime_td: {
    key: "anytime_td", label: "Anytime TD", short: "Anytime TD", category: "touchdown", unit: "prob",
    oddsApiKey: "player_anytime_td", stat: (s) => s.rushTD + s.recTD, integer: true, cvPrior: 1,
    positions: ["RB", "WR", "TE", "QB", "FB"], volumeLabel: "Opportunities (carries + targets)",
    volume: (s) => s.rushAtt + s.targets,
    weights: { edge: 35, matchup: 20, volume: 20, form: 10, consistency: 5, environment: 10 }, fullEdge: 0.08,
  },
};

export const MARKET_LIST = Object.values(MARKETS);

export function marketFromOddsKey(key: string): PropMarket | null {
  const m = MARKET_LIST.find((x) => x.oddsApiKey === key);
  return m ? m.key : null;
}

/** Normalize roster positions into the groups the model uses. */
export function positionGroup(pos: string | null | undefined): "QB" | "RB" | "WR" | "TE" | null {
  switch ((pos || "").toUpperCase()) {
    case "QB": return "QB";
    case "RB": case "HB": case "FB": return "RB";
    case "WR": return "WR";
    case "TE": return "TE";
    default: return null;
  }
}
