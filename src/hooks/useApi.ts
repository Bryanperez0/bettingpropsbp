import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import type { DashboardData, GameDetail, InjuriesData, PlayerListItem, PlayerProfile, PlayerPropRef, PropsData, StatusInfo } from "../../shared/api";
import type { AnalyzedProp, Game, InjuryItem, LiveGame, PerformanceSummary, PlayerGameLog, ScoreHistoryEntry } from "../../shared/types";

const opts = { staleTime: 60_000, refetchInterval: 5 * 60_000 };

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("dashboard"), ...opts });
export const useProps = (top?: number, enabled = true) =>
  useQuery({ queryKey: ["props", top ?? "all"], queryFn: () => api<PropsData>(top ? `props?top=${top}` : "props"), enabled, ...opts });
export const useProp = (id: string) => useQuery({ queryKey: ["prop", id], queryFn: () => api<{ prop: AnalyzedProp; game: Game | null; injuries: InjuryItem[]; history: ScoreHistoryEntry[]; logs: PlayerGameLog[]; playerProps: PlayerPropRef[] }>(`props/${encodeURIComponent(id)}`), ...opts });
export const useGames = () => useQuery({ queryKey: ["games"], queryFn: () => api<{ status: StatusInfo; games: Game[]; propCounts: Record<string, number> }>("games"), ...opts });
export const useGame = (id: string) => useQuery({ queryKey: ["game", id], queryFn: () => api<GameDetail>(`games/${encodeURIComponent(id)}`), ...opts });
export const usePlayers = () => useQuery({ queryKey: ["players"], queryFn: () => api<{ season: number; players: PlayerListItem[] }>("players"), ...opts });
export const usePlayer = (id: string) => useQuery({ queryKey: ["player", id], queryFn: () => api<PlayerProfile>(`players/${encodeURIComponent(id)}`), ...opts });
export const useInjuries = () => useQuery({ queryKey: ["injuries"], queryFn: () => api<InjuriesData>("injuries"), ...opts });
export const usePerformance = () => useQuery({ queryKey: ["performance"], queryFn: () => api<{ summary: PerformanceSummary; trackMinConfidence: number }>("performance"), ...opts });
/** Live in-game stats; polls every minute while enabled. */
export const useLive = (enabled: boolean) =>
  useQuery({ queryKey: ["live"], queryFn: () => api<{ games: Record<string, LiveGame> }>("live"), enabled, refetchInterval: 60_000, staleTime: 30_000 });

export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: () => api<StatusInfo & { stale: boolean }>("status"), ...opts });

export function useRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<StatusInfo>("refresh", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
