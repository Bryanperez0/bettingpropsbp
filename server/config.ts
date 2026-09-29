// Server-side configuration. Read only inside Netlify Functions — never shipped to the browser.

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined)?.trim() || "";
const list = (k: string, fallback: string) => (env(k) || fallback).split(",").map((s) => s.trim()).filter(Boolean);
const num = (k: string, fallback: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && env(k) !== "" ? n : fallback;
};

export const DEFAULT_MARKETS =
  "player_pass_yds,player_pass_tds,player_pass_completions,player_pass_attempts,player_rush_yds,player_rush_attempts,player_reception_yds,player_receptions,player_reception_longest,player_anytime_td";

export function getConfig() {
  return {
    sgoApiKey: env("SPORTSGAMEODDS_API_KEY"),
    /** Minutes between SportsGameOdds slate refreshes (each refresh bills one object per game). */
    sgoCacheMinutes: num("SGO_CACHE_MINUTES", 180),
    /** Stop calling SportsGameOdds for the month after this many objects (free plan: 2,500). */
    sgoMonthlyLimit: num("SGO_MONTHLY_LIMIT", 2300),
    sgoLookaheadHours: num("SGO_LOOKAHEAD_HOURS", Math.min(num("ODDS_LOOKAHEAD_HOURS", 96), 48)),
    oddsApiKey: env("ODDS_API_KEY"),
    oddsRegions: env("ODDS_API_REGIONS") || "us",
    oddsBookmakers: list("ODDS_API_BOOKMAKERS", ""),
    oddsMarkets: list("ODDS_API_MARKETS", DEFAULT_MARKETS),
    oddsCacheMinutes: num("ODDS_CACHE_MINUTES", 60),
    oddsLookaheadHours: num("ODDS_LOOKAHEAD_HOURS", 96),
    includePriorSeason: env("INCLUDE_PRIOR_SEASON") !== "false",
    demoPropLines: env("DEMO_PROP_LINES") === "true",
    refreshSecret: env("REFRESH_SECRET"),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
