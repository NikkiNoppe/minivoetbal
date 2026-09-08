import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAllMatchesForSession } from '@/services/core/matchesSessionFetch';
import { useOrgQueryScope } from '@/hooks/useOrganization';
import { withOrgQueryKey } from '@/lib/orgQueryKey';

export interface RefereeMatch {
  match_id: number;
  match_date: string;
  home_team_id: number;
  away_team_id: number;
  home_team_name?: string;
  away_team_name?: string;
  speeldag?: string;
  location?: string;
  unique_number?: string;
  is_locked?: boolean;
  is_submitted?: boolean;
  home_score?: number | null;
  away_score?: number | null;
  referee?: string;
  referee_notes?: string;
  home_players?: any[];
  away_players?: any[];
}

export const useRefereeMatches = (refereeUsername: string | null, month?: number, year?: number) => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(['refereeMatches', refereeUsername, month, year], organizationId),
    queryFn: async () => {
      if (!refereeUsername) return [];

      const now = new Date();
      const currentMonth = month ?? now.getMonth() + 1;
      const currentYear = year ?? now.getFullYear();

      const startDate = new Date(currentYear, currentMonth - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      const matches = await fetchAllMatchesForSession();
      const data = matches
        .filter(
          (match) =>
            match.referee === refereeUsername &&
            match.match_date >= startDate.toISOString() &&
            match.match_date <= endDate.toISOString(),
        )
        .sort((a, b) => a.match_date.localeCompare(b.match_date));

      return data.map((match) => ({
        match_id: match.match_id,
        match_date: match.match_date,
        home_team_id: match.home_team_id!,
        away_team_id: match.away_team_id!,
        home_team_name: match.home_team_name || undefined,
        away_team_name: match.away_team_name || undefined,
        speeldag: match.speeldag || undefined,
        location: match.location || undefined,
        unique_number: match.unique_number || undefined,
        is_locked: match.is_locked ?? undefined,
        is_submitted: match.is_submitted ?? undefined,
        home_score: match.home_score,
        away_score: match.away_score,
        referee: match.referee || undefined,
        referee_notes: match.referee_notes || undefined,
        home_players: match.home_players as any[],
        away_players: match.away_players as any[],
      } satisfies RefereeMatch));
    },
    enabled: !!refereeUsername && orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: 'online',
  });
};
