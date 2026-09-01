import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchTeamsForSession } from "@/services/core/teamsSessionFetch";
import { useAuth } from "@/hooks/useAuth";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";

export interface AdminTeam {
  team_id: number;
  team_name: string;
  player_manager_id?: number | null;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  club_colors?: string;
  preferred_play_moments?: {
    days?: string[];
    timeslots?: string[];
    venues?: string[];
    notes?: string;
  };
}

export const adminTeamQueryKeys = {
  all: ["adminTeams"] as const,
  list: () => [...adminTeamQueryKeys.all, "list"] as const,
};

export function useAdminTeamsQuery() {
  const { authContextReady } = useAuth();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(adminTeamQueryKeys.list(), organizationId),
    queryFn: async (): Promise<AdminTeam[]> => {
      const teams = await fetchTeamsForSession();
      return teams.map((team) => ({
        ...team,
        preferred_play_moments:
          team.preferred_play_moments as unknown as AdminTeam["preferred_play_moments"],
      }));
    },
    enabled: authContextReady && orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });
}
