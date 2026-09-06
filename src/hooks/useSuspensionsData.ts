import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { suspensionService } from "@/domains/cards-suspensions";
import { useToast } from "@/hooks/use-toast";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";

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

  const playerCardsQuery = useQuery({
    queryKey: withOrgQueryKey(["playerCards"], organizationId),
    queryFn: suspensionService.getPlayerCards,
    enabled: orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });

  const suspensionsQuery = useQuery({
    queryKey: withOrgQueryKey(
      ["suspensions", playerCardsQuery.dataUpdatedAt],
      organizationId,
    ),
    queryFn: () => suspensionService.getActiveSuspensions(playerCardsQuery.data || []),
    enabled: orgQueryEnabled && playerCardsQuery.isSuccess,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });

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
    playerCardsLoading: playerCardsQuery.isLoading,
    playerCardsError: playerCardsQuery.error,

    suspensions: suspensionsQuery.data,
    suspensionsLoading: suspensionsQuery.isLoading,
    suspensionsError: suspensionsQuery.error,

    topYellowCardPlayers,
    suspensionStats,

    isLoading: playerCardsQuery.isLoading || suspensionsQuery.isLoading,
    isFetching: playerCardsQuery.isFetching || suspensionsQuery.isFetching,
    hasError: !!playerCardsQuery.error || !!suspensionsQuery.error,

    handleRefresh,
    refetchPlayerCards: playerCardsQuery.refetch,
    refetchSuspensions: suspensionsQuery.refetch,
  };
};
