import { useQuery } from "@tanstack/react-query";
import {
  computeStats,
  fetchRegularMatches,
  fetchTeams,
  sortWithTiebreakers,
  type MatchRow,
  type SortableTeam,
  type TeamStats,
} from "@/services/standings/standingsService";
import { fetchPublicMatches, isPlayoffMatch } from "@/services/public/publicScheduleFetch";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";

export interface PlayoffTeam {
  team_id: number;
  team_name: string;
  regular_points: number;
  playoff_points: number;
  total_points: number;
  playoff_played: number;
  playoff_wins: number;
  playoff_draws: number;
  playoff_losses: number;
  playoff_goal_diff: number;
  playoff_goals_scored: number;
  playoff_goals_against: number;
  /** Totale wins (regulier + playoff), gebruikt voor tiebreakers. */
  total_wins: number;
  /** Totaal doelsaldo (regulier + playoff). */
  total_goal_diff: number;
  /** Totaal gemaakte doelpunten (regulier + playoff). */
  total_goals_scored: number;
  original_position: number;
  playoff_type: 'top' | 'bottom';
}

export interface PlayoffMatchData {
  match_id: number;
  speeldag: string;
  match_date: string;
  time: string;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name: string;
  away_team_name: string;
  home_position: number | null;
  away_position: number | null;
  home_score: number | null;
  away_score: number | null;
  location: string;
  playoff_type: 'top' | 'bottom';
  is_completed: boolean;
  is_finalized: boolean;
}

/** Eén onderlinge wedstrijd, zoals aan de UI doorgegeven. */
export interface HeadToHeadMatch {
  match_date: string | null;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  is_playoff: boolean;
}

const fetchPlayoffMatches = async (organizationId: number): Promise<any[]> => {
  return (await fetchPublicMatches(organizationId))
    .filter(isPlayoffMatch)
    .sort(
      (a, b) =>
        new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
    );
};

export const fetchPublicPlayoffData = async (organizationId: number) => {
  const [regularMatches, playoffMatchesRaw, teamMap] = await Promise.all([
    fetchRegularMatches(organizationId),
    fetchPlayoffMatches(organizationId),
    fetchTeams(organizationId),
  ]);

  const allTeamIds = new Set(teamMap.keys());

  const regularStats = computeStats(regularMatches, allTeamIds);
  const regularSortable: SortableTeam[] = Array.from(allTeamIds).map((id) => {
    const s = regularStats.get(id)!;
    return {
      team_id: id,
      team_name: teamMap.get(id) || 'Onbekend',
      points: s.points,
      wins: s.wins,
      goal_diff: s.goalsScored - s.goalsAgainst,
      goals_scored: s.goalsScored,
    };
  });
  const regularSorted = sortWithTiebreakers(regularSortable, regularMatches);
  const regularStandings = regularSorted.map((t, idx) => ({
    team_id: t.team_id,
    team_name: t.team_name,
    points: t.points,
    position: idx + 1,
  }));

  const po1RegularTeams = regularStandings.slice(0, 8);
  const po2RegularTeams = regularStandings.slice(8, 15);

  const playoffStats = computeStats(
    playoffMatchesRaw as MatchRow[],
    allTeamIds,
  );

  const combinedStats = new Map<number, TeamStats>();
  allTeamIds.forEach((id) => {
    const r = regularStats.get(id)!;
    const p = playoffStats.get(id)!;
    combinedStats.set(id, {
      played: r.played + p.played,
      wins: r.wins + p.wins,
      draws: r.draws + p.draws,
      losses: r.losses + p.losses,
      goalsScored: r.goalsScored + p.goalsScored,
      goalsAgainst: r.goalsAgainst + p.goalsAgainst,
      points: r.points + p.points,
    });
  });

  const playoffMatchRows: MatchRow[] = playoffMatchesRaw.map((m) => ({
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_score: m.home_score,
    away_score: m.away_score,
    is_submitted: m.is_submitted,
    match_date: m.match_date,
    is_playoff: true,
  }));

  const allMatchesForH2H: MatchRow[] = [...regularMatches, ...playoffMatchRows];

  const buildPlayoffTeams = (
    regularTeams: typeof regularStandings,
    type: 'top' | 'bottom',
  ): PlayoffTeam[] => {
    const teams: PlayoffTeam[] = regularTeams.map((team) => {
      const p = playoffStats.get(team.team_id)!;
      const c = combinedStats.get(team.team_id)!;
      return {
        team_id: team.team_id,
        team_name: team.team_name,
        regular_points: team.points,
        playoff_points: p.points,
        total_points: team.points + p.points,
        playoff_played: p.played,
        playoff_wins: p.wins,
        playoff_draws: p.draws,
        playoff_losses: p.losses,
        playoff_goal_diff: p.goalsScored - p.goalsAgainst,
        playoff_goals_scored: p.goalsScored,
        playoff_goals_against: p.goalsAgainst,
        total_wins: c.wins,
        total_goal_diff: c.goalsScored - c.goalsAgainst,
        total_goals_scored: c.goalsScored,
        original_position: team.position,
        playoff_type: type,
      };
    });

    const sortable: SortableTeam[] = teams.map((t) => ({
      team_id: t.team_id,
      team_name: t.team_name,
      points: t.total_points,
      wins: t.total_wins,
      goal_diff: t.total_goal_diff,
      goals_scored: t.total_goals_scored,
    }));
    const sorted = sortWithTiebreakers(sortable, allMatchesForH2H);
    const orderMap = new Map(sorted.map((t, i) => [t.team_id, i]));
    return teams.sort(
      (a, b) => orderMap.get(a.team_id)! - orderMap.get(b.team_id)!,
    );
  };

  const po1Teams = buildPlayoffTeams(po1RegularTeams, 'top');
  const po2Teams = buildPlayoffTeams(po2RegularTeams, 'bottom');

  const getTeamName = (teamId: number | null, position: number | null): string => {
    if (teamId && teamMap.has(teamId)) {
      return teamMap.get(teamId)!;
    }
    if (position) {
      return `Team pos. ${position}`;
    }
    return 'Onbekend';
  };

  const isFinalized = playoffMatchesRaw.some((m) => m.is_playoff_finalized === true);

  const playoffMatches: PlayoffMatchData[] = playoffMatchesRaw.map((match) => {
    const matchDate = new Date(match.match_date);
    const time = `${String(matchDate.getUTCHours()).padStart(2, '0')}:${String(matchDate.getUTCMinutes()).padStart(2, '0')}`;

    return {
      match_id: match.match_id,
      speeldag: match.speeldag || '',
      match_date: match.match_date,
      time,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      home_team_name: getTeamName(match.home_team_id, match.home_position),
      away_team_name: getTeamName(match.away_team_id, match.away_position),
      home_position: match.home_position,
      away_position: match.away_position,
      home_score: match.home_score,
      away_score: match.away_score,
      location: match.location || '',
      playoff_type: match.playoff_type === 'top' ? 'top' : 'bottom',
      is_completed: match.is_submitted && match.home_score !== null && match.away_score !== null,
      is_finalized: match.is_playoff_finalized ?? false,
    };
  });

  const now = new Date();
  const upcomingMatches = playoffMatches.filter((m) => !m.is_completed && new Date(m.match_date) >= now);
  const pastMatches = playoffMatches.filter((m) => m.is_completed);

  const headToHeadMatches: HeadToHeadMatch[] = allMatchesForH2H
    .filter(
      (m) =>
        m.is_submitted &&
        m.home_team_id !== null &&
        m.away_team_id !== null &&
        m.home_score !== null &&
        m.away_score !== null,
    )
    .map((m) => ({
      match_date: m.match_date ?? null,
      home_team_id: m.home_team_id as number,
      away_team_id: m.away_team_id as number,
      home_team_name: teamMap.get(m.home_team_id as number) || 'Onbekend',
      away_team_name: teamMap.get(m.away_team_id as number) || 'Onbekend',
      home_score: m.home_score as number,
      away_score: m.away_score as number,
      is_playoff: m.is_playoff === true,
    }));

  return {
    po1Teams,
    po2Teams,
    allMatches: playoffMatches,
    upcomingMatches,
    pastMatches,
    headToHeadMatches,
    hasData: playoffMatches.length > 0,
    isFinalized,
  };
};

export const usePublicPlayoffData = () => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  return useQuery({
    queryKey: withOrgQueryKey(['publicPlayoffData'], organizationId),
    queryFn: () => fetchPublicPlayoffData(organizationId!),
    enabled: orgQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};
