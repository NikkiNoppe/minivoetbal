import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { getRpcSessionArgs } from "@/lib/authSession";
import { fetchTeamsForSession } from "@/services/core/teamsSessionFetch";

export interface Player {
  player_id: number;
  first_name: string;
  last_name: string;
  birth_date: string;
  team_id: number;
  teams?: {
    team_id: number;
    team_name: string;
  };
}

export interface Team {
  team_id: number;
  team_name: string;
}

// Centralized Query Keys - voor consistentie en cache management
export const playerQueryKeys = {
  all: ['players'] as const,
  lists: () => [...playerQueryKeys.all, 'list'] as const,
  list: (teamId: number | null) => [...playerQueryKeys.lists(), teamId] as const,
  details: () => [...playerQueryKeys.all, 'detail'] as const,
  detail: (id: number) => [...playerQueryKeys.details(), id] as const,
};

/**
 * Helper to get user ID from localStorage
 */
const getUserIdFromStorage = (): number | null => {
  try {
    const authDataString = localStorage.getItem('auth_data');
    if (!authDataString) return null;
    const authData = JSON.parse(authDataString);
    return authData?.user?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Fetch players using atomic SECURITY DEFINER RPC
 * This eliminates RLS context loss issues from connection pooling
 */
const fetchPlayersViaRPC = async (teamId: number | null): Promise<Player[]> => {
  const userId = getUserIdFromStorage();
  
  if (!userId) {
    console.error('❌ No user ID found for player fetch');
    return [];
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📡 Fetching players via RPC:', { userId, teamId });
  }
  
  const { data, error } = await supabase.rpc('get_players_for_session', {
    ...getRpcSessionArgs(),
    p_team_id: teamId
  });
  
  if (error) {
    console.error('❌ Error fetching players via RPC:', error);
    throw error;
  }
  
  const players = (data || []) as Player[];
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ RPC returned ${players.length} players for ${teamId ? `team ${teamId}` : 'all teams'}`);
  }
  
  return players;
};

/**
 * Main hook for fetching players
 * Uses React Query with atomic RPC for reliable data loading
 */
export const usePlayersQuery = (teamId: number | null = null) => {
  const { user, authContextReady } = useAuth();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const isAdmin = user?.role === "admin";
  
  // Determine what to fetch based on teamId and user role
  const shouldFetch = orgQueryEnabled && !!user && authContextReady && (isAdmin || (user.teamId !== undefined && user.teamId !== null));
  
  // Only log in development and only when query state actually changes
  const prevState = useRef<{ teamId: number | null; shouldFetch: boolean } | null>(null);
  const currentState = { teamId, shouldFetch };
  
  if (process.env.NODE_ENV === 'development') {
    if (!prevState.current || 
        prevState.current.teamId !== currentState.teamId || 
        prevState.current.shouldFetch !== currentState.shouldFetch) {
      console.log('🔍 usePlayersQuery setup:', {
        teamId,
        isAdmin,
        shouldFetch,
        willFetch: shouldFetch ? (teamId !== null ? `team ${teamId}` : isAdmin ? 'all players' : `team ${user?.teamId}`) : 'DISABLED'
      });
      prevState.current = currentState;
    }
  }
  
  // Create a stable query key
  const queryKey = useMemo(() => {
    return withOrgQueryKey(playerQueryKeys.list(teamId), organizationId);
  }, [teamId, organizationId]);
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('📡 usePlayersQuery queryFn called:', {
          teamId,
          isAdmin,
          userTeamId: user?.teamId
        });
      }
      
      // Use atomic RPC for all cases
      // If teamId is provided, fetch that team
      if (teamId !== null) {
        return fetchPlayersViaRPC(teamId);
      }
      
      // If admin and no teamId, fetch all players (pass null)
      if (isAdmin) {
        return fetchPlayersViaRPC(null);
      }
      
      // Player manager: fetch their team
      if (user?.teamId) {
        return fetchPlayersViaRPC(user.teamId);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ No players to fetch - no teamId and not admin');
      }
      return [];
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
 * Hook for fetching teams list
 */
export const useTeamsQuery = () => {
  const { authContextReady } = useAuth();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(['teams'], organizationId),
    queryFn: async (): Promise<Team[]> => {
      const teams = await fetchTeamsForSession();
      return teams.map((t) => ({ team_id: t.team_id, team_name: t.team_name }));
    },
    enabled: authContextReady && orgQueryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - teams change rarely
    gcTime: 30 * 60 * 1000, // 30 minutes cache
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};

/**
 * Hook for invalidating player queries after mutations
 */
export const useInvalidatePlayers = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => {
      console.log('🗑️ Invalidating all player queries');
      queryClient.invalidateQueries({ queryKey: playerQueryKeys.all });
    },
    invalidateTeam: (teamId: number | null) => {
      console.log(`🗑️ Invalidating team query for teamId: ${teamId}`);
      if (teamId !== null) {
        queryClient.invalidateQueries({ queryKey: playerQueryKeys.list(teamId) });
      } else {
        queryClient.invalidateQueries({ queryKey: playerQueryKeys.all });
      }
    },
    invalidateList: () => {
      console.log('🗑️ Invalidating player list queries');
      queryClient.invalidateQueries({ queryKey: playerQueryKeys.lists() });
    },
  };
};

