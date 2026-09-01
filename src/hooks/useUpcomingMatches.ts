import { useQuery } from '@tanstack/react-query';
import { fetchTeamScheduleForSuspensions } from '@/services/core/matchesSessionFetch';
import { useOrgQueryScope } from '@/hooks/useOrganization';
import { withOrgQueryKey } from '@/lib/orgQueryKey';

export interface UpcomingMatch {
  match_id: number;
  match_date: string;
  home_team_id: number;
  away_team_id: number;
  opponent_name: string;
  home_team_name?: string;
  away_team_name?: string;
  is_home: boolean;
  speeldag?: string;
  location?: string;
  unique_number?: string;
  is_locked?: boolean;
  is_submitted?: boolean;
  home_players?: any[];
  away_players?: any[];
  home_score?: number | null;
  away_score?: number | null;
  referee?: string;
  referee_notes?: string;
}

function isUpcomingTeamMatch(
  match: {
    match_date: string;
    home_score: number | null;
    away_score: number | null;
    is_submitted?: boolean | null;
  },
  nowMs: number,
): boolean {
  if (match.home_score != null && match.away_score != null) {
    return false;
  }
  const matchMs = new Date(match.match_date).getTime();
  if (!Number.isNaN(matchMs)) {
    return matchMs >= nowMs;
  }
  return match.home_score == null && match.away_score == null;
}

export const useUpcomingMatches = (teamId: number | null, limit: number = 5) => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(['upcomingMatches', teamId, limit], organizationId),
    queryFn: async () => {
      if (!teamId) return [];

      const nowMs = Date.now();
      const matches = await fetchTeamScheduleForSuspensions([teamId]);

      const data = matches
        .filter(
          (match) =>
            (match.home_team_id === teamId || match.away_team_id === teamId) &&
            isUpcomingTeamMatch(match, nowMs),
        )
        .sort((a, b) => a.match_date.localeCompare(b.match_date))
        .slice(0, limit);

      return data.map((match) => {
        const isHome = match.home_team_id === teamId;
        return {
          match_id: match.match_id,
          match_date: match.match_date,
          home_team_id: match.home_team_id!,
          away_team_id: match.away_team_id!,
          opponent_name: isHome
            ? (match.away_team_name || 'Onbekend')
            : (match.home_team_name || 'Onbekend'),
          home_team_name: match.home_team_name || undefined,
          away_team_name: match.away_team_name || undefined,
          is_home: isHome,
          speeldag: match.speeldag || undefined,
          location: match.location || undefined,
          unique_number: match.unique_number || undefined,
          is_locked: match.is_locked ?? undefined,
          is_submitted: match.is_submitted ?? undefined,
          home_players: (match.home_players as any[]) || [],
          away_players: (match.away_players as any[]) || [],
          home_score: match.home_score,
          away_score: match.away_score,
          referee: match.referee || undefined,
          referee_notes: match.referee_notes || undefined,
        } satisfies UpcomingMatch;
      });
    },
    enabled: !!teamId && orgQueryEnabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
};
