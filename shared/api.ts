// Response shapes returned by /api/* endpoints.
import type { AnalyzedProp, Game, InjuryItem, PerformanceSummary, PlayerGameLog, RosterPlayer } from "./types";
import type { TeamProfile } from "./model/league";

export type SlimProp = Omit<AnalyzedProp, "history" | "steps" | "matchup">;

export interface StatusInfo {
  generatedAt: string;
  season: number;
  seasonType: number;
  week: number;
  oddsConfigured: boolean;
  demoLines: boolean;
  storage: "blobs" | "memory";
  stats: { linesFound: number; analyzed: number; unmatched: number; teamBets?: number; excludedInjured: number; insufficientData: number; datasetPending: number };
}

export interface DashboardData {
  status: StatusInfo;
  games: Game[];
  top: SlimProp[];
  keyInjuries: InjuryItem[];
}

export interface PropsData {
  status: StatusInfo;
  props: SlimProp[];
  games: Pick<Game, "id" | "shortName" | "date" | "home" | "away" | "state">[];
}

export interface RankRow { label: string; value: number | null; rank: number | null; of: number; digits?: number }

export interface TeamSummary {
  abbr: string;
  name: string;
  logo: string | null;
  record: string | null;
  offense: TeamProfile | null;
  defense: TeamProfile | null;
  offenseRanks: RankRow[];
  defenseRanks: RankRow[];
  recent: { gameId: string; week: number; opponent: string; home: boolean; pointsFor: number; pointsAgainst: number; result: "W" | "L" | "T" }[];
}

export interface GameDetail {
  game: Game;
  home: TeamSummary;
  away: TeamSummary;
  injuries: { home: InjuryItem[]; away: InjuryItem[] };
  props: SlimProp[];
}

export interface StatSummary {
  key: string;
  label: string;
  season: number | null;
  median: number | null;
  last3: number | null;
  last5: number | null;
  last10: number | null;
  home: number | null;
  away: number | null;
}

export interface PlayerListItem {
  id: string;
  name: string;
  team: string;
  position: string;
  headshot: string | null;
  games: number;
  headline: { label: string; value: number }[];
  injuryStatus: string | null;
  propCount: number;
}

export interface PlayerProfile {
  player: Pick<RosterPlayer, "id" | "name" | "team" | "position" | "headshot" | "jersey">;
  injury: InjuryItem | null;
  season: number;
  logs: PlayerGameLog[];
  summaries: StatSummary[];
  usage: { label: string; value: number | null; note?: string }[];
  upcoming: { game: Game; opponent: string; isHome: boolean; defenseRanks: RankRow[] } | null;
  props: SlimProp[];
}

export interface InjuriesData {
  injuries: InjuryItem[];
  teams: { abbr: string; name: string; logo: string | null }[];
}

export type PerformanceData = PerformanceSummary;
