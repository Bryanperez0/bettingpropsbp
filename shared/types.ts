// Shared domain types used by the Netlify Functions (server) and the React app.

/** How trustworthy/fresh a piece of data is. Shown in the UI next to the data. */
export type DataStatus = "live" | "cached" | "estimated" | "unavailable" | "mock";

export interface SourceMeta {
  key: string;
  label: string;
  provider: string;
  status: DataStatus;
  /** ISO time the underlying data was fetched from the provider. */
  fetchedAt: string | null;
  note?: string;
}

// ---------------------------------------------------------------------------
// Box score / stat lines
// ---------------------------------------------------------------------------

/** One player's stat line from one game (parsed from an ESPN box score). */
export interface StatLine {
  passCmp: number;
  passAtt: number;
  passYds: number;
  passTD: number;
  passInt: number;
  sacks: number;
  rushAtt: number;
  rushYds: number;
  rushTD: number;
  rushLong: number;
  rec: number;
  recYds: number;
  recTD: number;
  recLong: number;
  targets: number;
}

export interface TeamStatLine {
  points: number;
  passCmp: number;
  passAtt: number;
  passYds: number;
  passTD: number;
  passInt: number;
  sacks: number;
  rushAtt: number;
  rushYds: number;
  rushTD: number;
  targets: number;
  totalYards: number | null;
  plays: number | null;
  /** Red-zone trips and red-zone TDs (from team stats "redZoneAttempts", e.g. "3-4"). */
  redZoneTrips: number | null;
  redZoneTDs: number | null;
}

export interface BoxTeam {
  teamId: string;
  abbr: string;
  score: number;
  stats: TeamStatLine;
}

export interface BoxPlayer {
  id: string;
  name: string;
  team: string; // abbreviation
  headshot?: string;
  stats: StatLine;
}

/** Compact, cache-friendly representation of a completed game's box score. */
export interface GameBox {
  gameId: string;
  season: number;
  seasonType: number;
  week: number;
  date: string;
  home: BoxTeam;
  away: BoxTeam;
  players: BoxPlayer[];
}

export interface SeasonDataset {
  season: number;
  builtAt: string;
  games: GameBox[];
}

/** A player's line from one game, with context needed by the model. */
export interface PlayerGameLog {
  gameId: string;
  season: number;
  week: number;
  date: string;
  team: string;
  opponent: string;
  home: boolean;
  stats: StatLine;
  teamStats: TeamStatLine;
  teamPoints: number;
  oppPoints: number;
}

// ---------------------------------------------------------------------------
// Teams, games, injuries, weather
// ---------------------------------------------------------------------------

export interface TeamRef {
  id: string;
  abbr: string;
  name: string;
  displayName: string;
  logo: string | null;
  color: string | null;
  record: string | null;
  homeRecord?: string | null;
  awayRecord?: string | null;
}

export interface GameLines {
  provider: string | null;
  /** Spread from the HOME team's perspective (negative = home favored). */
  homeSpread: number | null;
  homeSpreadOpen: number | null;
  total: number | null;
  totalOpen: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  homeMoneylineOpen: number | null;
  awayMoneylineOpen: number | null;
  details: string | null;
}

export interface WeatherInfo {
  status: DataStatus;
  indoor: boolean | null;
  source: string;
  fetchedAt: string | null;
  tempF: number | null;
  windMph: number | null;
  windGustMph: number | null;
  precipProb: number | null;
  conditions: string | null;
  note?: string;
}

export type GameState = "pre" | "in" | "post";

export interface Game {
  id: string;
  season: number;
  seasonType: number;
  week: number;
  date: string;
  state: GameState;
  statusDetail: string;
  name: string;
  shortName: string;
  home: TeamRef;
  away: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
  venue: {
    name: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    indoor: boolean | null;
  };
  neutralSite: boolean;
  lines: GameLines;
  weather: WeatherInfo | null;
}

export type InjuryStatus =
  | "Out"
  | "Doubtful"
  | "Questionable"
  | "Injured Reserve"
  | "Suspension"
  | "Day-To-Day"
  | "Probable"
  | "Active"
  | string;

export interface InjuryItem {
  playerId: string;
  name: string;
  team: string;
  position: string | null;
  status: InjuryStatus;
  injury: string | null;
  detail: string | null;
  returnDate: string | null;
  updated: string | null;
  comment: string | null;
  headshot?: string | null;
}

export interface RosterPlayer {
  id: string;
  name: string;
  team: string;
  teamId: string;
  position: string;
  jersey: string | null;
  headshot: string | null;
  status: string | null;
  group: string;
}

// ---------------------------------------------------------------------------
// Props & model output
// ---------------------------------------------------------------------------

export type PropMarket =
  | "pass_yds"
  | "pass_tds"
  | "pass_completions"
  | "pass_attempts"
  | "rush_yds"
  | "rush_attempts"
  | "rec_yds"
  | "receptions"
  | "rec_longest"
  | "anytime_td";

export type PropCategory = "passing" | "rushing" | "receiving" | "touchdown";
export type PropSide = "over" | "under";
export type LineSource = "sportsbook" | "demo";

export interface BookLine {
  book: string;
  bookTitle: string;
  line: number | null;
  overPrice: number | null;
  underPrice: number | null;
  lastUpdate: string | null;
  /** The book's opening line and prices, when the provider reports them. */
  open?: { line: number | null; overPrice: number | null; underPrice: number | null } | null;
}

/** Consensus opening line across books (from the sportsbooks, not this app). */
export interface OpeningLine { line: number | null; overPrice: number | null; underPrice: number | null; books: number }

/** One book's price for the recommended side, valued with the model's probability at that book's line. */
export interface BookOption {
  book: string;
  bookTitle: string;
  line: number;
  price: number;
  /** Model probability the bet wins at this book's line. */
  winProb: number;
  /** Expected profit per 1 unit staked (0.05 = +5%). */
  ev: number;
}

/** A normalized prop line for one player/market, possibly quoted by several books. */
export interface PropLineGroup {
  gameId: string;
  playerName: string;
  playerId: string | null;
  team: string | null;
  market: PropMarket;
  /** Consensus line used by the model (most common line across books). */
  line: number | null;
  overPrice: number | null;
  underPrice: number | null;
  books: BookLine[];
  source: LineSource;
  fetchedAt: string;
  firstSeen: { line: number | null; overPrice: number | null; underPrice: number | null; at: string } | null;
  opening?: OpeningLine | null;
}

export interface HitRate {
  hits: number;
  total: number;
  pushes: number;
  pct: number | null;
}

export interface HitRates {
  season: HitRate;
  last10: HitRate;
  last5: HitRate;
  last3: HitRate;
  home: HitRate;
  away: HitRate;
}

export interface HistoryPoint {
  gameId: string;
  season: number;
  week: number;
  date: string;
  opponent: string;
  home: boolean;
  value: number;
  result: "over" | "under" | "push";
}

export interface ProjectionStep {
  label: string;
  value: string;
  detail?: string;
}

export interface ConfidenceComponent {
  key: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface ConfidenceBreakdown {
  total: number;
  components: ConfidenceComponent[];
  penalties: { label: string; points: number }[];
}

export type EdgeTier = "strong" | "moderate" | "neutral" | "negative";

export interface AnalyzedProp {
  id: string;
  gameId: string;
  kickoff: string;
  week: number;
  season: number;
  market: PropMarket;
  marketLabel: string;
  category: PropCategory;
  player: {
    id: string | null;
    name: string;
    team: string;
    position: string;
    headshot: string | null;
    injuryStatus: string | null;
  };
  opponent: string;
  isHome: boolean;
  line: number;
  lineSource: LineSource;
  side: PropSide;
  sideLabel: string;
  odds: { over: number | null; under: number | null; side: number | null };
  books: BookLine[];
  /** Books pricing the recommended side, best expected value first. */
  shop?: BookOption[];
  firstSeen: PropLineGroup["firstSeen"];
  opening?: OpeningLine | null;
  projection: number;
  /** For anytime TD the projection is a probability (0-1) and unit is "prob". */
  unit: "yards" | "count" | "prob";
  edge: number;
  edgePct: number | null;
  modelProb: number;
  impliedProb: number | null;
  probEdge: number;
  confidence: ConfidenceBreakdown;
  tier: EdgeTier;
  hitRates: HitRates;
  history: HistoryPoint[];
  averages: {
    season: number | null;
    last3: number | null;
    last5: number | null;
    last10: number | null;
    median: number | null;
    games: number;
    priorSeasonGames: number;
  };
  volume: { label: string; projected: number | null; season: number | null; last3: number | null; share: number | null; shareLabel: string | null };
  matchup: { label: string; value: string; leagueValue: string; factor: number | null; rank: number | null; rankOf: number; note: string }[];
  steps: ProjectionStep[];
  reasons: string[];
  risks: string[];
  explanation: string;
  dataQuality: { score: number; missing: string[] };
  generatedAt: string;
  /**
   * Set once the game has started: the prop is the frozen PREGAME analysis
   * (confidence and lean as of the last refresh before kickoff).
   */
  frozen?: { state: GameState; frozenAt: string } | null;
}

/** One recalculation of a prop, kept so score changes can be explained. */
export interface ScoreHistoryEntry {
  at: string;
  confidence: number;
  tier: EdgeTier;
  side: PropSide;
  line: number;
  odds: number | null;
  projection: number;
  modelProb: number;
  components: Record<string, number>;
  penalties: Record<string, number>;
  /** What moved since the previous entry. */
  changes: string[];
}

/** Live box-score snapshot for a game that has started. */
export interface LiveGame {
  gameId: string;
  state: GameState;
  detail: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Player id -> stat line so far. Players without a stat yet are absent. */
  players: Record<string, StatLine>;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Tracking / model performance
// ---------------------------------------------------------------------------

export type PickResult = "win" | "loss" | "push" | "pending" | "void";

export interface TrackedPick {
  id: string;
  createdAt: string;
  gameId: string;
  kickoff: string;
  season: number;
  week: number;
  playerId: string | null;
  playerName: string;
  team: string;
  opponent: string;
  position: string;
  market: PropMarket;
  marketLabel: string;
  category: PropCategory;
  side: PropSide;
  line: number;
  odds: number | null;
  projection: number;
  confidence: number;
  tier: EdgeTier;
  modelProb: number;
  /** Market probability of the picked side when recorded (vig removed when both sides were priced). */
  impliedProb?: number | null;
  /** Closing line value: how the market moved between the pick and kickoff. */
  close?: ClosingLine | null;
  result: PickResult;
  actual: number | null;
  gradedAt: string | null;
}

export interface ClosingLine {
  line: number;
  over: number | null;
  under: number | null;
  /** "sportsbook-close": the books' official closing prices. "last-seen": the last pregame line this app fetched. */
  source: "sportsbook-close" | "last-seen";
  at: string;
  /** Line points in the pick's favor (+ means the pick got a better number than the close). 0 for anytime TD. */
  lineMove: number;
  /** Closing minus recorded market probability for the picked side, at the same line. null if the line moved. */
  probClv: number | null;
  /** true = beat the closing line, false = lost to it, null = even. */
  beat: boolean | null;
}

export interface ClvSummary {
  tracked: number;
  beat: number;
  lost: number;
  even: number;
  beatRate: number | null;
  avgLineMove: number | null;
  avgProbClv: number | null;
}

export interface PerformanceBucket {
  key: string;
  label: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  units: number;
  /** Picks with a closing line, and how many beat it. */
  clvN: number;
  clvBeat: number;
}

export interface PerformanceSummary {
  total: number;
  graded: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  units: number;
  clv: ClvSummary;
  byConfidence: PerformanceBucket[];
  byCategory: PerformanceBucket[];
  byPosition: PerformanceBucket[];
  byWeek: PerformanceBucket[];
  recent: TrackedPick[];
}

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiEnvelope<T> {
  data: T;
  sources: SourceMeta[];
  generatedAt: string;
  warnings: string[];
}
