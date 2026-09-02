import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRpcSessionArgs } from "@/lib/authSession";

export interface TeamPlayer {
  player_id: number;
  first_name: string;
  last_name: string;
  team_id?: number;
  is_eligible?: boolean;
}

// Centralized Query Keys
export const teamPlayerQueryKeys = {
  all: ['teamPlayers'] as const,
  lists: () => [...teamPlayerQueryKeys.all, 'list'] as const,
  list: (teamId: number) => [...teamPlayerQueryKeys.lists(), teamId] as const,
};

// Helper to get user ID from localStorage
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

// Fetch function using SECURITY DEFINER RPC
const fetchTeamPlayers = async (teamId: number): Promise<TeamPlayer[]> => {
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

/**
 * Hook for fetching team players using React Query
 * Uses SECURITY DEFINER RPC for atomic authorization + data fetching
 */
export const useTeamPlayersQuery = (teamId: number | null) => {
  const { user, authContextReady } = useAuth();
  
  // Determine if we should fetch
  const shouldFetch = !!user && authContextReady && teamId !== null && teamId > 0;
  
  // Create a stable query key
  const queryKey = useMemo(() => {
    return teamPlayerQueryKeys.list(teamId!);
  }, [teamId]);
  
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (teamId === null || teamId <= 0) {
        return [];
      }
      
      // Create timeout for slow connections (15 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Request timeout - slow connection'));
        }, 15000);
        
        signal?.addEventListener('abort', () => clearTimeout(timeoutId));
      });
      
      const result = await Promise.race([
        fetchTeamPlayers(teamId),
        timeoutPromise
      ]);
      
      return result;
    },
    enabled: shouldFetch,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 4,
    retryDelay: (attemptIndex) => {
      // Exponential backoff with jitter: 1.5s, 3s, 6s, 10s (max)
      const baseDelay = Math.min(1500 * Math.pow(2, attemptIndex), 10000);
      const jitter = Math.random() * 500;
      return baseDelay + jitter;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    placeholderData: (previousData) => previousData,
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
