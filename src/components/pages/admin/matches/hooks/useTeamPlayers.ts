
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTeamPlayersQuery, teamPlayerQueryKeys } from "@/hooks/useTeamPlayersQuery";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { suspensionService } from "@/domains/cards-suspensions/services";

export interface TeamPlayer {
  player_id: number;
  first_name: string;
  last_name: string;
  team_id?: number;
  is_eligible?: boolean;
}

interface UseTeamPlayersReturn {
  players: TeamPlayer[] | undefined;
  loading: boolean;
  isFetching: boolean;
  error: unknown;
  retryCount: number;
  refetch: () => Promise<void>;
}

interface UseTeamPlayersWithSuspensionReturn extends UseTeamPlayersReturn {
  playersWithSuspensions: TeamPlayer[] | undefined;
  suspensionLoading: boolean;
  isRefreshing: boolean;
}

export const useTeamPlayers = (teamId: number): UseTeamPlayersReturn => {
  const playersQuery = useTeamPlayersQuery(teamId);
  const hasData = playersQuery.data !== undefined;
  const waitingForData = !hasData && playersQuery.isFetching;
  const { minReady, timedOut } = useMinLoadingGate(waitingForData);

  const isLoading = !timedOut && !hasData && (waitingForData || !minReady);
  const error =
    playersQuery.error ||
    (timedOut && !hasData
      ? new Error("Laden duurt te lang. Controleer je verbinding en probeer opnieuw.")
      : null);

  const refetch = async () => {
    await playersQuery.refetch();
  };

  return {
    players: playersQuery.data,
    loading: isLoading,
    isFetching: hasData && playersQuery.isFetching,
    error,
    retryCount: playersQuery.failureCount || 0,
    refetch,
  };
};

export const useTeamPlayersWithSuspensions = (
  teamId: number,
  matchDate?: Date,
): UseTeamPlayersWithSuspensionReturn => {
  const baseHook = useTeamPlayers(teamId);
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const matchDateKey = useMemo(() => {
    if (!matchDate) return "";
    const y = matchDate.getUTCFullYear();
    const m = String(matchDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(matchDate.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [matchDate]);

  const playerIds = useMemo(
    () => (baseHook.players ?? []).map((p) => p.player_id),
    [baseHook.players],
  );
  const playerIdsKey = useMemo(
    () => [...playerIds].sort((a, b) => a - b).join(","),
    [playerIds],
  );

  const eligibilityQuery = useQuery({
    queryKey: withOrgQueryKey(
      [...teamPlayerQueryKeys.eligibility(teamId, matchDateKey), playerIdsKey] as const,
      organizationId,
    ),
    queryFn: () => suspensionService.checkBatchPlayerEligibility(playerIds, matchDate!),
    enabled: orgQueryEnabled && !!matchDate && playerIds.length > 0,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    networkMode: "online",
  });

  const playersWithSuspensions = useMemo(() => {
    if (!baseHook.players) return undefined;
    const eligibility = eligibilityQuery.data;
    return baseHook.players.map((player) => ({
      ...player,
      is_eligible: eligibility ? (eligibility[player.player_id] ?? true) : true,
    }));
  }, [baseHook.players, eligibilityQuery.data]);

  const hasPlayers = playersWithSuspensions !== undefined;

  return {
    ...baseHook,
    playersWithSuspensions,
    suspensionLoading: !eligibilityQuery.data && eligibilityQuery.isFetching,
    isRefreshing:
      hasPlayers && (baseHook.isFetching || (!!eligibilityQuery.data && eligibilityQuery.isFetching)),
  };
};

export default useTeamPlayers;
