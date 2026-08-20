import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchCompetitionMatches } from "@/services/match";
import { fetchRegularStandings } from "@/services/standings/standingsService";
import { useOrganization, useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";

export interface Team {
  id: number;
  name: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalDiff: number;
  points: number;
  division?: string | null;
}

export interface MatchData {
  matchId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number;
  awayScore?: number;
  date: string;
  time: string;
  location: string;
  matchday: string;
  uniqueNumber?: string;
}

const sharedQueryOptions = {
  staleTime: 0,
  gcTime: 10 * 60 * 1000,
  retry: 2,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 5000),
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  placeholderData: keepPreviousData,
  networkMode: "online" as const,
};

const fetchCompetitionStandings = async (
  organizationId: number,
): Promise<Team[]> => {
  const standings = await fetchRegularStandings(organizationId);
  return standings.map((s) => ({
    id: s.team_id,
    name: s.team_name,
    played: s.played,
    won: s.won,
    draw: s.draw,
    lost: s.lost,
    goalDiff: s.goal_diff,
    points: s.points,
    division: s.division,
  }));
};

export const useCompetitionStandings = () => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(["competitionStandings"], organizationId),
    queryFn: () => fetchCompetitionStandings(organizationId!),
    enabled: orgQueryEnabled,
    ...sharedQueryOptions,
  });
};

export const useCompetitionMatches = () => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(["competitionMatches"], organizationId),
    queryFn: () => fetchCompetitionMatches(organizationId!),
    enabled: orgQueryEnabled,
    ...sharedQueryOptions,
  });
};

export const useCompetitionData = () => {
  const standingsQuery = useCompetitionStandings();
  const matchesQuery = useCompetitionMatches();

  const hasStandingsData = standingsQuery.data !== undefined;
  const hasMatchesData = matchesQuery.data !== undefined;

  const processedMatches = useMemo(() => {
    if (!matchesQuery.data) return undefined;
    return {
      upcoming: matchesQuery.data.upcoming || [],
      past: matchesQuery.data.past || [],
      all: [
        ...(matchesQuery.data.upcoming || []),
        ...(matchesQuery.data.past || []),
      ],
    };
  }, [matchesQuery.data]);

  const matchdays = processedMatches
    ? [...new Set(processedMatches.all.map((match) => match.matchday))]
        .filter(Boolean)
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, "")) || 0;
          const numB = parseInt(b.replace(/\D/g, "")) || 0;
          return numA - numB;
        })
    : [];

  const teamNames = processedMatches
    ? [
        ...new Set([
          ...processedMatches.all.map((match) => match.homeTeamName),
          ...processedMatches.all.map((match) => match.awayTeamName),
        ]),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "nl"))
    : [];

  const standingsRefreshing =
    hasStandingsData && standingsQuery.isFetching && !standingsQuery.isLoading;
  const matchesRefreshing =
    hasMatchesData && matchesQuery.isFetching && !matchesQuery.isLoading;

  return {
    teams: standingsQuery.data,
    hasStandingsData,
    standingsLoading: standingsQuery.isLoading,
    standingsFetching: standingsQuery.isFetching,
    standingsFetched: standingsQuery.isFetched,
    standingsError: standingsQuery.error,
    standingsRefreshing,
    refetchStandings: standingsQuery.refetch,

    matches: processedMatches,
    hasMatchesData,
    matchesLoading: matchesQuery.isLoading,
    matchesFetching: matchesQuery.isFetching,
    matchesFetched: matchesQuery.isFetched,
    matchesError: matchesQuery.error,
    matchesRefreshing,
    refetchMatches: matchesQuery.refetch,

    matchdays,
    teamNames,

    isRefreshing: standingsRefreshing || matchesRefreshing,
    isLoading: standingsQuery.isLoading || matchesQuery.isLoading,
    hasError: !!standingsQuery.error || !!matchesQuery.error,
  };
};
