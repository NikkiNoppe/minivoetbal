import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { suspensionService } from "@/domains/cards-suspensions/services";
import { useToast } from "@/hooks/use-toast";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";

export interface SuspensionStats {
  totalSuspensions: number;
  activeSuspensions: number;
  pendingSuspensions: number;
  completedSuspensions: number;
}

export const useSuspensionsData = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const sharedQueryOptions = {
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online" as const,
  };

  const playerCardsQuery = useQuery({
    queryKey: withOrgQueryKey(["playerCards"], organizationId),
    queryFn: suspensionService.getPlayerCards,
    enabled: orgQueryEnabled,
    ...sharedQueryOptions,
  });

  const cardsFingerprint = useMemo(() => {
    if (!playerCardsQuery.data) return "";
    return playerCardsQuery.data
      .map((c) => `${c.playerId}:${c.yellowCards}:${c.redCards}`)
      .join("|");
  }, [playerCardsQuery.data]);

  const suspensionsQuery = useQuery({
    queryKey: withOrgQueryKey(["suspensions", cardsFingerprint], organizationId),
    queryFn: () => suspensionService.getActiveSuspensions(playerCardsQuery.data || []),
    enabled: orgQueryEnabled && playerCardsQuery.isSuccess,
    ...sharedQueryOptions,
  });

  const hasCards = playerCardsQuery.data !== undefined;
  const hasSuspensions = suspensionsQuery.data !== undefined;
  const waitingForCards = !hasCards && playerCardsQuery.isFetching;
  const waitingForSuspensions = !hasSuspensions && suspensionsQuery.isFetching;

  const cardsGate = useMinLoadingGate(waitingForCards);
  const suspensionsGate = useMinLoadingGate(waitingForSuspensions);

  const playerCardsLoading =
    !cardsGate.timedOut && !hasCards && (waitingForCards || !cardsGate.minReady);
  const suspensionsLoading =
    !suspensionsGate.timedOut &&
    !hasSuspensions &&
    (waitingForSuspensions || !suspensionsGate.minReady);

  const isRefreshing =
    (hasCards && playerCardsQuery.isFetching && !playerCardsQuery.isLoading) ||
    (hasSuspensions && suspensionsQuery.isFetching && !suspensionsQuery.isLoading);

  const topYellowCardPlayers =
    playerCardsQuery.data
      ?.filter((player) => player.yellowCards > 0)
      ?.sort((a, b) => b.yellowCards - a.yellowCards)
      ?.slice(0, 10) || [];

  const suspensionStats: SuspensionStats = {
    totalSuspensions: suspensionsQuery.data?.length || 0,
    activeSuspensions: suspensionsQuery.data?.filter((s) => s.status === "active").length || 0,
    pendingSuspensions: suspensionsQuery.data?.filter((s) => s.status === "pending").length || 0,
    completedSuspensions:
      suspensionsQuery.data?.filter((s) => s.status === "completed").length || 0,
  };

  const handleRefresh = async () => {
    try {
      await suspensionService.refreshPlayerCards();
      await queryClient.invalidateQueries({
        queryKey: withOrgQueryKey(["playerCards"], organizationId),
      });
      await queryClient.invalidateQueries({
        queryKey: withOrgQueryKey(["suspensions"], organizationId),
      });
      await Promise.all([playerCardsQuery.refetch(), suspensionsQuery.refetch()]);
    } catch (error) {
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het vernieuwen.",
        variant: "destructive",
      });
    }
  };

  return {
    playerCards: playerCardsQuery.data,
    playerCardsLoading,
    playerCardsError: playerCardsQuery.error,

    suspensions: suspensionsQuery.data,
    suspensionsLoading,
    suspensionsError: suspensionsQuery.error,

    topYellowCardPlayers,
    suspensionStats,

    isLoading: playerCardsLoading || suspensionsLoading,
    isFetching: playerCardsQuery.isFetching || suspensionsQuery.isFetching,
    isRefreshing,
    hasError: !!playerCardsQuery.error || !!suspensionsQuery.error,

    handleRefresh,
    refetchPlayerCards: playerCardsQuery.refetch,
    refetchSuspensions: suspensionsQuery.refetch,
  };
};
