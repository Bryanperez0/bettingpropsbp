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
