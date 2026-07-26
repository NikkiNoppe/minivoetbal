import { useQuery } from "@tanstack/react-query";
import { cupService } from "@/services";
import { isoToLocalDateTime } from "@/lib/dateUtils";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";

export interface CupMatchDisplay {
  id: string;
  home: string;
  away: string;
  homeScore?: number | null;
  awayScore?: number | null;
  date?: string;
  time?: string;
  location?: string;
  nextMatch?: string;
}

export interface TournamentData {
  voorronde?: any[];
  achtste_finales?: any[];
  kwartfinales?: any[];
  halve_finales?: any[];
  finale?: any;
}

const formatMatchForDisplay = (match: any): CupMatchDisplay => {
  // Use isoToLocalDateTime to properly format date and time like other services
  const { date, time } = match.match_date ? isoToLocalDateTime(match.match_date) : { date: '', time: '' };
  
  return {
    id: match.match_id.toString(),
    home: match.home_team_name || 'TBD',
    away: match.away_team_name || 'TBD',
    homeScore: match.home_score,
    awayScore: match.away_score,
    date: match.match_date, // Keep ISO string for date formatting
    time: time, // Extracted time string
    location: match.location
  };
};

export const useCupData = () => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const query = useQuery({
    queryKey: withOrgQueryKey(['cupMatches'], organizationId),
    queryFn: () => cupService.getCupMatches(organizationId!),
    enabled: orgQueryEnabled,
    staleTime: 3 * 60 * 1000, // 3 minutes - tournament data doesn't change often
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });

  // Transform data to structured format
  const bracketData = query.data ? {
    prelims: query.data.voorronde?.map(formatMatchForDisplay) || [],
    eighthfinals: query.data.achtste_finales?.map(formatMatchForDisplay) || [],
    quarterfinals: query.data.kwartfinales?.map(formatMatchForDisplay) || [],
    semifinals: query.data.halve_finales?.map(formatMatchForDisplay) || [],
    final: query.data.finale ? formatMatchForDisplay(query.data.finale) : null
  } : null;

  const hasData = bracketData && (
    bracketData.prelims.length > 0 ||
    bracketData.eighthfinals.length > 0 ||
    bracketData.quarterfinals.length > 0 ||
    bracketData.semifinals.length > 0 ||
    bracketData.final
  );

  return {
    ...query,
    bracketData,
    hasData
  };
}; 