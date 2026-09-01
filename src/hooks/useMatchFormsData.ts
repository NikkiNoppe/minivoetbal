import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { fetchUpcomingMatches } from "@/components/pages/admin/matches/services/matchesFormService";
import type { MatchFormData } from "@/components/pages/admin/matches/types";

type MatchFormsTab = "league" | "cup" | "playoff";

function buildTabFetchError(
  timedOut: boolean,
  queryError: unknown,
  timeoutMessage: string,
  errorMessage: string,
) {
  if (timedOut) {
    return { message: timeoutMessage, timeout: true as const };
  }
  if (queryError) {
    return { message: errorMessage, originalError: queryError, timeout: false as const };
  }
  return null;
}

export type MatchFormsTabType = 'league' | 'cup' | 'playoff';

export interface UseMatchFormsDataOptions {
  enabled?: boolean;
  loadTabs?: MatchFormsTabType[];
}

export interface MatchFormsFilters {
  searchTerm: string;
  dateFilter: string;
  matchdayFilter: string;
  teamFilter: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  hideCompletedMatches: boolean;
}

export const useMatchFormsData = (
  teamId: number,
  hasElevatedPermissions: boolean,
  refereeFilter?: { userId: number; username: string },
  options: UseMatchFormsDataOptions = {}
) => {
  const { enabled: queriesEnabled = true, loadTabs = ['league', 'cup', 'playoff'] } = options;
  const loadLeague = loadTabs.includes('league');
  const loadCup = loadTabs.includes('cup');
  const loadPlayoff = loadTabs.includes('playoff');

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const leagueQueryEnabled = queriesEnabled && loadLeague && orgQueryEnabled;
  const cupQueryEnabled = queriesEnabled && loadCup && orgQueryEnabled;
  const playoffQueryEnabled = queriesEnabled && loadPlayoff && orgQueryEnabled;

  const sharedQueryOptions = {
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false as const,
    networkMode: "online" as const,
    placeholderData: keepPreviousData,
  };

  // League matches query
  const leagueQuery = useQuery({
    queryKey: withOrgQueryKey(
      ['teamMatches', teamId, hasElevatedPermissions, 'league', refereeFilter?.userId],
      organizationId,
    ),
    queryFn: async () => {
      return fetchUpcomingMatches(
        hasElevatedPermissions ? 0 : teamId, 
        hasElevatedPermissions, 
        'league',
        refereeFilter
      );
    },
    enabled: leagueQueryEnabled,
    ...sharedQueryOptions,
  });

  // Cup matches query
  const cupQuery = useQuery({
    queryKey: withOrgQueryKey(
      ['teamMatches', teamId, hasElevatedPermissions, 'cup', refereeFilter?.userId],
      organizationId,
    ),
    queryFn: async () => {
      return fetchUpcomingMatches(
        hasElevatedPermissions ? 0 : teamId, 
        hasElevatedPermissions, 
        'cup',
        refereeFilter
      );
    },
    enabled: cupQueryEnabled,
    ...sharedQueryOptions,
  });

  // Playoff matches query
  const playoffQuery = useQuery({
    queryKey: withOrgQueryKey(
      ['teamMatches', teamId, hasElevatedPermissions, 'playoff', refereeFilter?.userId],
      organizationId,
    ),
    queryFn: async () => {
      return fetchUpcomingMatches(
        hasElevatedPermissions ? 0 : teamId, 
        hasElevatedPermissions, 
        'playoff',
        refereeFilter
      );
    },
    enabled: playoffQueryEnabled,
    ...sharedQueryOptions,
  });

  const leagueHasData = leagueQuery.data !== undefined;
  const cupHasData = cupQuery.data !== undefined;
  const playoffHasData = playoffQuery.data !== undefined;

  const leagueWaiting = leagueQueryEnabled && !leagueHasData && leagueQuery.isFetching;
  const cupWaiting = cupQueryEnabled && !cupHasData && cupQuery.isFetching;
  const playoffWaiting = playoffQueryEnabled && !playoffHasData && playoffQuery.isFetching;

  const leagueGate = useMinLoadingGate(leagueWaiting);
  const cupGate = useMinLoadingGate(cupWaiting);
  const playoffGate = useMinLoadingGate(playoffWaiting);

  const tabUiState = useMemo(() => {
    const leagueError = buildTabFetchError(
      leagueGate.timedOut,
      leagueQuery.error,
      "Het laden van de competitie wedstrijden duurt te lang (>5 seconden). Dit kan betekenen dat de data niet correct is binnengehaald. Probeer de pagina te vernieuwen of controleer je internetverbinding.",
      "Er is een fout opgetreden bij het laden van de competitie wedstrijden. De data is mogelijk niet correct binnengehaald. Probeer het opnieuw of neem contact op met de beheerder.",
    );
    const cupError = buildTabFetchError(
      cupGate.timedOut,
      cupQuery.error,
      "Het laden van de beker wedstrijden duurt te lang (>5 seconden). Dit kan betekenen dat de data niet correct is binnengehaald. Probeer de pagina te vernieuwen of controleer je internetverbinding.",
      "Er is een fout opgetreden bij het laden van de beker wedstrijden. De data is mogelijk niet correct binnengehaald. Probeer het opnieuw of neem contact op met de beheerder.",
    );
    const playoffError = buildTabFetchError(
      playoffGate.timedOut,
      playoffQuery.error,
      "Het laden van de playoff wedstrijden duurt te lang (>5 seconden). Dit kan betekenen dat de data niet correct is binnengehaald. Probeer de pagina te vernieuwen of controleer je internetverbinding.",
      "Er is een fout opgetreden bij het laden van de playoff wedstrijden. De data is mogelijk niet correct binnengehaald. Probeer het opnieuw of neem contact op met de beheerder.",
    );

    const leagueLoading =
      !leagueGate.timedOut &&
      !leagueHasData &&
      (leagueWaiting || !leagueGate.minReady);
    const cupLoading =
      !cupGate.timedOut && !cupHasData && (cupWaiting || !cupGate.minReady);
    const playoffLoading =
      !playoffGate.timedOut &&
      !playoffHasData &&
      (playoffWaiting || !playoffGate.minReady);

    const showLeagueError = !!leagueError && !leagueHasData && !leagueLoading;
    const showCupError = !!cupError && !cupHasData && !cupLoading;
    const showPlayoffError = !!playoffError && !playoffHasData && !playoffLoading;

    return {
      league: {
        isLoading: leagueLoading,
        error: showLeagueError ? leagueError : null,
        hasError: showLeagueError,
      },
      cup: {
        isLoading: cupLoading,
        error: showCupError ? cupError : null,
        hasError: showCupError,
      },
      playoff: {
        isLoading: playoffLoading,
        error: showPlayoffError ? playoffError : null,
        hasError: showPlayoffError,
      },
    };
  }, [
    leagueGate.timedOut,
    leagueGate.minReady,
    cupGate.timedOut,
    cupGate.minReady,
    playoffGate.timedOut,
    playoffGate.minReady,
    leagueHasData,
    cupHasData,
    playoffHasData,
    leagueWaiting,
    cupWaiting,
    playoffWaiting,
    leagueQuery.error,
    cupQuery.error,
    playoffQuery.error,
  ]);

  // Filter and sort matches based on current filters
  const filterAndSortMatches = (matches: MatchFormData[], filters: MatchFormsFilters) => {
    if (!matches) return [];

    // Filter matches
    const filteredMatches = matches.filter(match => {
      const matchesSearch = !filters.searchTerm || 
        match.homeTeamName.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        match.awayTeamName.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        match.uniqueNumber.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        match.matchday.toLowerCase().includes(filters.searchTerm.toLowerCase());

      const matchesDate = !filters.dateFilter || 
        match.date === filters.dateFilter ||
        match.date.startsWith(filters.dateFilter) ||
        match.date.includes(filters.dateFilter);

      const matchesMatchday = !filters.matchdayFilter || 
        match.matchday.toLowerCase().includes(filters.matchdayFilter.toLowerCase());

      const matchesTeam = !filters.teamFilter ||
        match.homeTeamName.toLowerCase() === filters.teamFilter.toLowerCase() ||
        match.awayTeamName.toLowerCase() === filters.teamFilter.toLowerCase();

      // Helper function to check if a score is valid
      const hasValidScore = (score: number | null | undefined): boolean => 
        score !== null && score !== undefined;
      
      // Filter completed matches - hide matches that are completed when toggle is enabled
      const isCompleted = hasValidScore(match.homeScore) && hasValidScore(match.awayScore);
      const showMatch = !filters.hideCompletedMatches || !isCompleted;

      return matchesSearch && matchesDate && matchesMatchday && matchesTeam && showMatch;
    });

    // Sort matches
    const sortedMatches = [...filteredMatches].sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'date':
          // Parse dates correctly and handle invalid dates
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'matchday':
          comparison = a.matchday.localeCompare(b.matchday);
          break;
        case 'week':
          // Extract week number from matchday or date
          const weekA = extractWeekNumber(a.matchday) || getWeekFromDate(a.date);
          const weekB = extractWeekNumber(b.matchday) || getWeekFromDate(b.date);
          comparison = weekA - weekB;
          break;
        case 'team':
          comparison = a.homeTeamName.localeCompare(b.homeTeamName);
          break;
        case 'status':
          // Sort by completion status (completed first, then pending)
          comparison = (a.isCompleted ? 1 : 0) - (b.isCompleted ? 1 : 0);
          break;
        default:
          // Default to date sorting
          const defaultDateA = parseDate(a.date);
          const defaultDateB = parseDate(b.date);
          comparison = defaultDateA.getTime() - defaultDateB.getTime();
      }
      
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return sortedMatches;
  };

  // Helper function to parse dates safely
  const parseDate = (dateString: string): Date => {
    // Handle different date formats
    if (dateString.includes('T')) {
      // ISO format
      return new Date(dateString);
    } else if (dateString.includes('-')) {
      // YYYY-MM-DD format
      return new Date(dateString + 'T00:00:00');
    } else {
      // Try to parse as local date
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
  };

  // Helper function to extract week number from matchday string
  const extractWeekNumber = (matchday: string): number | null => {
    const weekMatch = matchday.match(/week\s*(\d+)/i) || matchday.match(/speelweek\s*(\d+)/i);
    return weekMatch ? parseInt(weekMatch[1]) : null;
  };

  // Helper function to get week number from date
  const getWeekFromDate = (date: string): number => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Get current tab data with filters
  const getTabData = (tabType: MatchFormsTab, filters: MatchFormsFilters) => {
    const query =
      tabType === "cup" ? cupQuery : tabType === "playoff" ? playoffQuery : leagueQuery;
    const ui = tabUiState[tabType];
    const filteredMatches = filterAndSortMatches(query.data || [], filters);

    return {
      matches: filteredMatches,
      allMatches: query.data || [],
      isLoading: ui.isLoading,
      isError: ui.hasError,
      error: ui.error,
    };
  };

  // Instant refresh function for after form submissions
  const refreshInstantly = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ["teamMatches"] });
      const refetches = [];
      if (loadLeague) refetches.push(leagueQuery.refetch());
      if (loadCup) refetches.push(cupQuery.refetch());
      if (loadPlayoff) refetches.push(playoffQuery.refetch());
      await Promise.all(refetches);
      // Note: Toast notifications are handled by the submission hooks (e.g., useEnhancedMatchFormSubmission)
      // to avoid duplicate notifications
    } catch (error) {
      // Only show error toast if refresh fails, not success toast
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het bijwerken.",
        variant: "destructive"
      });
    }
  };

  // Statistics for dashboard
  const statistics = {
    totalLeagueMatches: leagueQuery.data?.length || 0,
    totalCupMatches: cupQuery.data?.length || 0,
    totalPlayoffMatches: playoffQuery.data?.length || 0,
    
    submittedLeague: leagueQuery.data?.filter(m => m.isCompleted).length || 0,
    submittedCup: cupQuery.data?.filter(m => m.isCompleted).length || 0,
    submittedPlayoff: playoffQuery.data?.filter(m => m.isCompleted).length || 0,
    
    pendingLeague: leagueQuery.data?.filter(m => !m.isCompleted).length || 0,
    pendingCup: cupQuery.data?.filter(m => !m.isCompleted).length || 0,
    pendingPlayoff: playoffQuery.data?.filter(m => !m.isCompleted).length || 0
  };

  return {
    // Raw data
    leagueMatches: leagueQuery.data || [],
    cupMatches: cupQuery.data || [],
    playoffMatches: playoffQuery.data || [],
    
    // Loading states
    leagueLoading: tabUiState.league.isLoading,
    cupLoading: tabUiState.cup.isLoading,
    playoffLoading: tabUiState.playoff.isLoading,
    isLoading:
      tabUiState.league.isLoading ||
      tabUiState.cup.isLoading ||
      tabUiState.playoff.isLoading,

    // Error states
    leagueError: tabUiState.league.error,
    cupError: tabUiState.cup.error,
    playoffError: tabUiState.playoff.error,
    hasError:
      tabUiState.league.hasError ||
      tabUiState.cup.hasError ||
      tabUiState.playoff.hasError,
    hasErrorForTab: (tabType: MatchFormsTabType) => tabUiState[tabType].hasError,
    
    // Statistics
    statistics,
    
    // Utility functions
    getTabData,
    filterAndSortMatches,
    refreshInstantly,
    
    // Direct query methods for manual control
    refetchLeague: leagueQuery.refetch,
    refetchCup: cupQuery.refetch,
    refetchPlayoff: playoffQuery.refetch,
    refetchAll: () => {
      const refetches = [];
      if (loadLeague) refetches.push(leagueQuery.refetch());
      if (loadCup) refetches.push(cupQuery.refetch());
      if (loadPlayoff) refetches.push(playoffQuery.refetch());
      return Promise.all(refetches);
    },
  };
}; 