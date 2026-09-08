import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRpcSessionArgs } from "@/lib/authSession";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { MAX_LOADING_TIME } from "@/hooks/useMinLoadingGate";

export interface TeamPlayer {
  player_id: number;
  first_name: string;
  last_name: string;
  team_id?: number;
  is_eligible?: boolean;
}

export const teamPlayerQueryKeys = {
  all: ['teamPlayers'] as const,
  lists: () => [...teamPlayerQueryKeys.all, 'list'] as const,
  list: (teamId: number) => [...teamPlayerQueryKeys.lists(), teamId] as const,
  eligibility: (teamId: number, matchDateKey: string) =>
    [...teamPlayerQueryKeys.all, 'eligibility', teamId, matchDateKey] as const,
};

const getUserIdFromStorage = (): number | null => {
  try {
    const authDataString = localStorage.getItem('auth_data');
    if (!authDataString) return null;
    const authData = JSON.parse(authDataString);
    return authData?.user?.id ?? authData?.user?.user_id ?? null;
  } catch {
    return null;
  }
};

export const fetchTeamPlayers = async (teamId: number): Promise<TeamPlayer[]> => {
  const userId = getUserIdFromStorage();

  if (!userId) {
    console.error('❌ No user ID found for team player fetch');
    return [];
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 fetchTeamPlayers via RPC for teamId: ${teamId}, userId: ${userId}`);
  }

  const { data, error } = await supabase.rpc('get_players_for_session', {
    ...getRpcSessionArgs(),
    p_team_id: teamId
  });

  if (error) {
    console.error(`❌ Error fetching team players via RPC for team ${teamId}:`, error);
    throw error;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ Fetched ${data?.length || 0} players for team ${teamId} via RPC`);
  }

  return (data || []) as TeamPlayer[];
};

export function prefetchTeamPlayers(
  queryClient: QueryClient,
  teamId: number,
  organizationId: number | undefined,
) {
  if (!teamId || teamId <= 0) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: withOrgQueryKey(teamPlayerQueryKeys.list(teamId), organizationId),
    queryFn: () => fetchTeamPlayers(teamId),
  });
}

export function prefetchMatchFormPlayers(
  queryClient: QueryClient,
  homeTeamId: number,
  awayTeamId: number,
  organizationId: number | undefined,
) {
  return Promise.all([
    prefetchTeamPlayers(queryClient, homeTeamId, organizationId),
    prefetchTeamPlayers(queryClient, awayTeamId, organizationId),
  ]);
}

/**
 * Hook for fetching team players using React Query
 * Uses SECURITY DEFINER RPC for atomic authorization + data fetching
 */
export const useTeamPlayersQuery = (teamId: number | null) => {
  const { user, authContextReady } = useAuth();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const shouldFetch =
    !!user && authContextReady && orgQueryEnabled && teamId !== null && teamId > 0;

  const queryKey = useMemo(
    () => withOrgQueryKey(teamPlayerQueryKeys.list(teamId ?? 0), organizationId),
    [teamId, organizationId],
  );

  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (teamId === null || teamId <= 0) {
        return [];
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Request timeout - slow connection'));
        }, MAX_LOADING_TIME);

        signal?.addEventListener('abort', () => clearTimeout(timeoutId));
      });

      return Promise.race([
        fetchTeamPlayers(teamId),
        timeoutPromise
      ]);
    },
    enabled: shouldFetch,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    networkMode: "online",
  });
};

/**
 * Hook for invalidating team player queries after mutations
 */
export const useInvalidateTeamPlayers = () => {
  const queryClient = useQueryClient();

  return {
    invalidateTeam: (teamId: number) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🗑️ Invalidating team players query for teamId: ${teamId}`);
      }
      queryClient.invalidateQueries({ queryKey: teamPlayerQueryKeys.list(teamId) });
    },
    invalidateAll: () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🗑️ Invalidating all team player queries');
      }
      queryClient.invalidateQueries({ queryKey: teamPlayerQueryKeys.all });
    },
  };
};
