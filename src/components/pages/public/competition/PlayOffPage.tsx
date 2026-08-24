import React, { memo, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Trophy, Info, Target} from "lucide-react";
import { usePublicPlayoffData, PlayoffTeam, PlayoffMatchData, HeadToHeadMatch } from "@/hooks/usePublicPlayoffData";
import { FilterSelect, FilterGroup } from "@/components/ui/filter-select";
import { PageHeader } from "@/components/layout";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import DownloadScheduleButton from "@/components/common/DownloadScheduleButton";
import {
  SCHEDULE_ACCORDION_ITEM,
  SCHEDULE_MATCH_META,
  SCHEDULE_MATCH_ROW,
  SCHEDULE_MATCH_SCORE,
  SCHEDULE_MATCH_TEAM,
  SCHEDULE_TRIGGER,
  SCHEDULE_TRIGGER_ACTIVE,
} from "@/components/common/scheduleControlStyles";
import ResponsiveStandingsTable, {
  type StandingsTeamRow,
} from "@/components/tables/ResponsiveStandingsTable";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrgQueryScope, withOrgQueryKey } from "@/hooks/useOrganization";
import { seasonService } from "@/services/seasonService";
import { deriveSeasonLabel } from "@/services/archiveService";
import { PUBLIC_ROUTES } from "@/config/routes";

/** Dynamisch seizoenlabel ("Seizoen 2026-2027") uit de seizoensinstellingen. */
function useSeasonSubtitle(): string | undefined {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { data } = useQuery({
    queryKey: withOrgQueryKey(["seasonData"], organizationId),
    queryFn: () => seasonService.getSeasonData(organizationId!),
    enabled: orgQueryEnabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return data
    ? `Seizoen ${deriveSeasonLabel(data.season_start_date, data.season_end_date)}`
    : undefined;
}


function mapPlayoffToStandingsRows(teams: PlayoffTeam[]): StandingsTeamRow[] {
  return teams.map((team) => ({
    id: team.team_id,
    name: team.team_name,
    played: team.playoff_played,
    won: team.playoff_wins,
    draw: team.playoff_draws,
    lost: team.playoff_losses,
    goalDiff: team.playoff_goal_diff,
    points: team.total_points,
  }));
}

// Detect groups of teams with equal total points (potential tiebreaker cases)
const findTiedGroups = (teams: PlayoffTeam[]): PlayoffTeam[][] => {
  const groups: PlayoffTeam[][] = [];
  let current: PlayoffTeam[] = [];
  teams.forEach((t, i) => {
    if (i === 0 || t.total_points !== teams[i - 1].total_points) {
      if (current.length > 1) groups.push(current);
      current = [t];
    } else {
      current.push(t);
    }
  });
  if (current.length > 1) groups.push(current);
  return groups;
};

// Bepaal welk criterium de doorslag gaf binnen een tied groep
type DecidingCriterion =
  | { type: 'wins' }
  | { type: 'h2h' }
  | { type: 'goal_diff' }
  | { type: 'goals_scored' }
  | { type: 'alphabetical' };

const getDecidingCriterion = (group: PlayoffTeam[]): DecidingCriterion => {
  const allEqual = <K extends keyof PlayoffTeam>(k: K) =>
    group.every(t => t[k] === group[0][k]);
  if (!allEqual('total_wins')) return { type: 'wins' };
  // Wins gelijk → head-to-head (punten + doelsaldo in onderlinge wedstrijden)
  // We tonen dit als de eerstvolgende toegepaste tiebreaker. Als ook algemeen
  // saldo & gemaakte goals identiek zijn, was het effectief alfabetisch.
  if (!allEqual('total_goal_diff') || !allEqual('total_goals_scored')) {
    return { type: 'h2h' };
  }
  return { type: 'alphabetical' };
};

// Format match date as "do 14 mei" (UTC, mobile-first compact)
const formatMatchDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('nl-BE', { weekday: 'short', timeZone: 'UTC' });
  const day = d.toLocaleDateString('nl-BE', { day: 'numeric', timeZone: 'UTC' });
  const month = d.toLocaleDateString('nl-BE', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${day} ${month}`;
};

function formatTiedTeamNames(teams: PlayoffTeam[]): string {
  return teams.map((t) => t.team_name).join(" & ");
}

function formatWinsBreakdown(teams: PlayoffTeam[]): string {
  return teams.map((t) => `${t.team_name} ${t.total_wins}`).join(", ");
}

const tiebreakerDetailsSummaryClass =
  "cursor-pointer select-none text-primary underline underline-offset-2 min-h-[36px] inline-flex items-center justify-center touch-manipulation list-none [&::-webkit-details-marker]:hidden";

// Onderlinge wedstrijden + mini-stand — alleen zichtbaar in uitklap
const H2HBlock = memo(({
  group,
  matches,
}: {
  group: PlayoffTeam[];
  matches: HeadToHeadMatch[];
}) => {
  const groupIds = new Set(group.map((t) => t.team_id));
  const between = matches
    .filter((m) => groupIds.has(m.home_team_id) && groupIds.has(m.away_team_id))
    .sort((a, b) => (a.match_date || "").localeCompare(b.match_date || ""));

  if (between.length === 0) {
    return (
      <p className="mt-1.5 italic text-muted-foreground">
        Geen onderlinge wedstrijden tussen deze teams.
      </p>
    );
  }

  const mini = new Map<number, { pts: number; gf: number; ga: number }>();
  group.forEach((t) => mini.set(t.team_id, { pts: 0, gf: 0, ga: 0 }));
  between.forEach((m) => {
    const h = mini.get(m.home_team_id)!;
    const a = mini.get(m.away_team_id)!;
    h.gf += m.home_score;
    h.ga += m.away_score;
    a.gf += m.away_score;
    a.ga += m.home_score;
    if (m.home_score > m.away_score) h.pts += 3;
    else if (m.home_score < m.away_score) a.pts += 3;
    else {
      h.pts += 1;
      a.pts += 1;
    }
  });

  return (
    <div className="mt-1.5 space-y-1.5 text-center overflow-x-auto">
      <div className="rounded border border-primary/20 min-w-[min(100%,16rem)] mx-auto text-left">
        {between.map((m, i) => (
          <div
            key={i}
            className="grid grid-cols-[4.75rem_minmax(0,1fr)_3.5rem_minmax(0,1fr)_2.25rem] items-center gap-x-2 gap-y-0 px-2 py-1 border-b border-primary/15 last:border-b-0 text-[11px] sm:text-xs text-left"
          >
            <span className="tabular-nums text-muted-foreground shrink-0">
              {formatMatchDate(m.match_date)}
            </span>
            <span className="truncate text-right text-foreground">{m.home_team_name}</span>
            <span
              className="grid grid-cols-[1.25rem_0.625rem_1.25rem] items-center font-semibold tabular-nums text-foreground shrink-0 justify-self-center"
              aria-label={`${m.home_score} – ${m.away_score}`}
            >
              <span className="text-right">{m.home_score}</span>
              <span className="text-center leading-none">–</span>
              <span className="text-left">{m.away_score}</span>
            </span>
            <span className="truncate text-left text-foreground">{m.away_team_name}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 text-right">
              {m.is_playoff ? "PO" : "comp."}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-center text-muted-foreground">
        <span className="font-medium text-foreground">Onderlinge stand:</span>{' '}
        {group.map((t, i) => {
          const s = mini.get(t.team_id)!;
          const diff = s.gf - s.ga;
          return (
            <span key={t.team_id}>
              {t.team_name} <strong className="text-foreground">{s.pts}</strong> pt
              (saldo {diff > 0 ? "+" : ""}{diff})
              {i < group.length - 1 ? " · " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
});
H2HBlock.displayName = "H2HBlock";

const TiebreakerNotice = memo(({
  teams,
  headToHeadMatches,
}: {
  teams: PlayoffTeam[];
  headToHeadMatches: HeadToHeadMatch[];
}) => {
  const tied = findTiedGroups(teams);
  if (tied.length === 0) return null;

  return (
    <div
      className="mt-3 space-y-3 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-center text-muted-foreground"
      role="note"
    >
      {tied.map((group, idx) => {
        const criterion = getDecidingCriterion(group);
        const points = group[0].total_points;
        const teamNames = formatTiedTeamNames(group);

        return (
          <div key={idx} className="space-y-1.5">
            <p className="text-foreground leading-snug">
              <Info
                className="inline-block w-3.5 h-3.5 mr-1 align-middle text-primary"
                aria-hidden="true"
              />
              <span className="font-medium">Gelijke stand op {points} punten:</span>{" "}
              {teamNames}
            </p>

            {criterion.type === "wins" && (
              <ol className="list-none space-y-1 leading-snug mx-auto max-w-full">
                <li>
                  <span className="font-medium text-foreground">1. Aantal gewonnen wedstrijden.</span>{" "}
                  Volgorde via wins ({formatWinsBreakdown(group)}).
                </li>
                <li>
                  <details className="inline-block text-center">
                    <summary className={tiebreakerDetailsSummaryClass}>
                      Toon onderlinge wedstrijden (ter info)
                    </summary>
                    <H2HBlock group={group} matches={headToHeadMatches} />
                  </details>
                </li>
              </ol>
            )}

            {criterion.type === "h2h" && (
              <ol className="list-none space-y-1 leading-snug mx-auto max-w-full">
                <li>
                  <span className="font-medium text-foreground">1. Aantal gewonnen wedstrijden.</span>{" "}
                  Gelijk ({group[0].total_wins} elk, competitie + play-offs).
                </li>
                <li>
                  <span className="font-medium text-foreground">2. Onderlinge wedstrijden.</span>{" "}
                  Volgorde bepaald via onderlinge resultaten.
                  <details className="mt-1 text-center">
                    <summary className={tiebreakerDetailsSummaryClass}>
                      Toon wedstrijden
                    </summary>
                    <H2HBlock group={group} matches={headToHeadMatches} />
                  </details>
                </li>
              </ol>
            )}

            {criterion.type === "alphabetical" && (
              <p className="leading-snug">
                Alle criteria gelijk — voorlopig alfabetisch weergegeven (reglement: testmatch of
                loting).
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
});
TiebreakerNotice.displayName = "TiebreakerNotice";

const ScheduleSkeleton = memo(() => (
  <div className="space-y-3">
    {[...Array(5)].map((_, index) => (
      <div key={index} className="p-3 border border-border rounded-lg">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-5 w-full" />
      </div>
    ))}
  </div>
));
ScheduleSkeleton.displayName = 'ScheduleSkeleton';

const PlayoffLoading = memo(() => (
  <div className="space-y-6 motion-safe:animate-slide-up">
    <PageHeader
      title="Play-Off"
        icon={Target}
      subtitle="Seizoen 2025-2026"
    />
    <section aria-labelledby="po1-loading-heading">
      <h2
        id="po1-loading-heading"
        className="text-lg font-semibold text-[var(--color-700)] mb-3 flex items-center gap-2"
      >
        <Trophy className="w-5 h-5 text-primary" aria-hidden="true" />
        Play-Off 1
      </h2>
      <ResponsiveStandingsTable isLoading embeddedInCard />
    </section>
  </div>
));
PlayoffLoading.displayName = 'PlayoffLoading';

const PlayoffError = memo(({ onRetry }: { onRetry: () => void }) => (
  <div className="space-y-6 animate-slide-up">
    <PageHeader 
      title="Play-Off Klassement"
        icon={Target} 
      subtitle="Seizoen 2025-2026"
    />
    <Card>
      <CardContent className="py-12">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">Fout bij laden</h3>
          <p className="mb-4" style={{ color: 'var(--accent)' }}>
            Kon playoff gegevens niet laden
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
));
PlayoffError.displayName = 'PlayoffError';

const PlayoffEmptyState = memo(() => (
  <div className="space-y-6 animate-slide-up">
    <PageHeader 
      title="Play-Off Klassement"
        icon={Target} 
      subtitle="Seizoen 2025-2026"
    />
    <Card>
      <CardContent className="py-12">
        <div className="text-center">
          <Trophy className="h-8 w-8 mx-auto mb-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-semibold mb-2">Geen Play-Off Data</h3>
          <p style={{ color: 'var(--accent)' }}>
            Er zijn momenteel geen play-off gegevens beschikbaar.
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
));
PlayoffEmptyState.displayName = 'PlayoffEmptyState';

// Compact match list item - 2 lines max with perfect time centering
const MatchListItem = memo(({ match }: { match: any }) => {
  const isCompleted = match.isCompleted;

  return (
    <div className={SCHEDULE_MATCH_ROW}>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-1">
        <div className={cn("text-sm font-medium leading-tight text-left truncate", SCHEDULE_MATCH_TEAM)}>
          {match.homeTeamName}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted && match.homeScore !== undefined && match.awayScore !== undefined ? (
            <>
              <span className={cn("text-sm font-bold min-w-[20px] text-center tabular-nums", SCHEDULE_MATCH_SCORE)}>
                {match.homeScore}
              </span>
              <span className={cn("text-sm", SCHEDULE_MATCH_META)}>-</span>
              <span className={cn("text-sm font-bold min-w-[20px] text-center tabular-nums", SCHEDULE_MATCH_SCORE)}>
                {match.awayScore}
              </span>
            </>
          ) : (
            <span className={cn("text-sm font-medium", SCHEDULE_MATCH_META)}>vs</span>
          )}
        </div>
        <div className={cn("text-sm font-medium leading-tight text-right truncate", SCHEDULE_MATCH_TEAM)}>
          {match.awayTeamName}
        </div>
      </div>
      <div className={cn("grid grid-cols-3 gap-2 text-xs font-medium", SCHEDULE_MATCH_META)}>
        <span className="text-left truncate">{match.date}</span>
        <span className="text-center tabular-nums">{match.time || ""}</span>
        <span className="text-right truncate">{match.location || ""}</span>
      </div>
    </div>
  );
});
MatchListItem.displayName = 'MatchListItem';

// Group matches by speeldag
const MatchGroup = memo(({ speeldag, matches, playoffType }: {
  speeldag: string;
  matches: any[];
  playoffType: "PO1" | "PO2" | "mixed";
}) => (
  <AccordionItem value={speeldag} className={SCHEDULE_ACCORDION_ITEM}>
    <AccordionTrigger
      variant="plain"
      className={cn(SCHEDULE_TRIGGER, SCHEDULE_TRIGGER_ACTIVE, "px-4 gap-3")}
    >
      <span className="text-left flex-1">{speeldag}</span>
      {playoffType !== "mixed" && (
        <Badge variant="outline" className="shrink-0 text-xs mr-1">
          {playoffType}
        </Badge>
      )}
    </AccordionTrigger>
    <AccordionContent className="!p-0 border-t border-brand-light bg-card">
      {matches.map((match) => (
        <MatchListItem key={match.matchId} match={match} />
      ))}
    </AccordionContent>
  </AccordionItem>
));
MatchGroup.displayName = 'MatchGroup';

// Main component - Mobile-first
const PlayOffPage: React.FC = () => {
  const { data, isLoading, error, refetch } = usePublicPlayoffData();
  const [selectedDivision, setSelectedDivision] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [openSpeeldagen, setOpenSpeeldagen] = useState<string[]>([]);

  // Convert matches to schedule format
  const scheduleMatches = useMemo(() => {
    if (!data?.allMatches) return [];
    return data.allMatches.map(match => {
      const matchDate = new Date(match.match_date);
      
      // Format date with weekday: "ma 19 jan"
      const weekday = matchDate.toLocaleDateString('nl-BE', { weekday: 'short' });
      const day = matchDate.toLocaleDateString('nl-BE', { day: 'numeric' });
      const month = matchDate.toLocaleDateString('nl-BE', { month: 'short' });
      const dateStr = `${weekday} ${day} ${month}`;
      
      const poLabel = match.playoff_type === 'top' ? 'PO1' : 'PO2';
      const speeldagNum = match.speeldag ? match.speeldag.match(/(\d+)/) : null;
      const speeldagClean = speeldagNum ? speeldagNum[1] : null;
      
      return {
        matchId: match.match_id,
        matchday: speeldagClean || poLabel,
        playoffType: poLabel,
        speeldagNumber: speeldagClean,
        date: dateStr,
        rawDate: match.match_date.split('T')[0], // YYYY-MM-DD for downloads
        time: match.time,
        homeTeamName: match.home_team_name,
        awayTeamName: match.away_team_name,
        homeScore: match.home_score ?? undefined,
        awayScore: match.away_score ?? undefined,
        location: match.location,
        isCompleted: match.is_completed
      };
    });
  }, [data?.allMatches]);

  // Get unique team names for filter
  const teamNames = useMemo(() => {
    const names = new Set<string>();
    scheduleMatches.forEach(m => {
      if (m.homeTeamName) names.add(m.homeTeamName);
      if (m.awayTeamName) names.add(m.awayTeamName);
    });
    return Array.from(names).sort((a, b) => {
      const posA = a.match(/Team pos\. (\d+)/);
      const posB = b.match(/Team pos\. (\d+)/);
      if (posA && posB) return parseInt(posA[1]) - parseInt(posB[1]);
      if (posA) return -1;
      if (posB) return 1;
      return a.localeCompare(b, 'nl');
    });
  }, [scheduleMatches]);

  // Filter matches
  const filteredMatches = useMemo(() => {
    return scheduleMatches.filter(m => {
      if (selectedDivision !== "all" && m.playoffType !== selectedDivision) return false;
      if (selectedTeam !== "all" && m.homeTeamName !== selectedTeam && m.awayTeamName !== selectedTeam) return false;
      return true;
    });
  }, [scheduleMatches, selectedDivision, selectedTeam]);

  // Group matches by speeldag
  const groupedMatches = useMemo(() => {
    const groups: { [key: string]: { matches: any[]; playoffType: 'PO1' | 'PO2' | 'mixed' } } = {};
    
    filteredMatches.forEach(match => {
      const key = match.matchday;
      if (!groups[key]) {
        groups[key] = { matches: [], playoffType: match.playoffType as 'PO1' | 'PO2' };
      } else if (groups[key].playoffType !== match.playoffType) {
        groups[key].playoffType = 'mixed';
      }
      groups[key].matches.push(match);
    });

    // Sort groups by speeldag number
    return Object.entries(groups).sort(([a], [b]) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
  }, [filteredMatches]);

  // Find the first speeldag that is not fully completed (like beker and competitie)
  const defaultOpenSpeeldag = useMemo(() => {
    for (const [speeldag, { matches }] of groupedMatches) {
      const isCompleted = matches.every(match => 
        match.homeScore !== undefined && 
        match.homeScore !== null && 
        match.awayScore !== undefined && 
        match.awayScore !== null
      );
      if (!isCompleted && matches.length > 0) {
        return speeldag;
      }
    }
    // If all are completed, return the last one
    return groupedMatches.length > 0 ? groupedMatches[groupedMatches.length - 1][0] : undefined;
  }, [groupedMatches]);

  // Update open speeldagen based on team selection
  // Use a ref to track if we should allow manual changes
  const isManualChangeRef = React.useRef(false);
  const prevSelectedTeamRef = React.useRef(selectedTeam);
  
  React.useEffect(() => {
    // Only update if selectedTeam actually changed
    const selectedTeamChanged = prevSelectedTeamRef.current !== selectedTeam;
    
    // Don't override manual changes unless filter actually changed
    if (isManualChangeRef.current && !selectedTeamChanged) {
      isManualChangeRef.current = false;
      return;
    }
    
    // Update ref
    if (selectedTeamChanged) {
      prevSelectedTeamRef.current = selectedTeam;
    }
    
    if (selectedTeam === "all") {
      // Default: only first incomplete speeldag
      if (defaultOpenSpeeldag) {
        setOpenSpeeldagen([defaultOpenSpeeldag]);
      } else {
        setOpenSpeeldagen([]);
      }
    } else {
      // When a team is selected: open all speeldagen
      const allSpeeldagen = groupedMatches.map(([speeldag]) => speeldag);
      setOpenSpeeldagen(allSpeeldagen);
    }
    
    isManualChangeRef.current = false;
  }, [selectedTeam, defaultOpenSpeeldag]);

  // Handle manual accordion changes
  const handleAccordionChange = React.useCallback((value: string[]) => {
    isManualChangeRef.current = true;
    setOpenSpeeldagen(value);
  }, []);

  if (isLoading) {
    return <PlayoffLoading />;
  }

  if (error) {
    return <PlayoffError onRetry={() => refetch()} />;
  }

  if (!data?.hasData) {
    return <PlayoffEmptyState />;
  }

  const { po1Teams, po2Teams, headToHeadMatches = [] } = data;

  const teamFilterValue =
    selectedTeam === "all" || teamNames.includes(selectedTeam)
      ? selectedTeam
      : "all";

  const scheduleMatchesForExport = filteredMatches.map((m) => ({
    matchId: m.matchId,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    date: m.rawDate,
    time: m.time,
    location: m.location,
    matchday: m.matchday,
  }));

  return (
    <div className="space-y-6 motion-safe:animate-slide-up">
      <PageHeader
        title="Play-Off"
        icon={Target}
        subtitle="Seizoen 2025-2026"
      />

      <section role="region" aria-labelledby="po1-heading">
        <h2
          id="po1-heading"
          className="text-lg font-semibold text-[var(--color-700)] mb-3 flex items-center gap-2"
        >
          <Trophy className="w-5 h-5 text-primary" aria-hidden="true" />
          Play-Off 1
        </h2>
        <ResponsiveStandingsTable
          teams={mapPlayoffToStandingsRows(po1Teams)}
          embeddedInCard
        />
        <TiebreakerNotice
          teams={po1Teams}
          headToHeadMatches={headToHeadMatches}
        />
      </section>

      <section role="region" aria-labelledby="po2-heading">
        <h2
          id="po2-heading"
          className="text-lg font-semibold text-[var(--color-700)] mb-3"
        >
          Play-Off 2
        </h2>
        <ResponsiveStandingsTable
          teams={mapPlayoffToStandingsRows(po2Teams)}
          embeddedInCard
        />
        <TiebreakerNotice
          teams={po2Teams}
          headToHeadMatches={headToHeadMatches}
        />
      </section>

      {/* Schedule */}
      <section role="region" aria-labelledby="schedule-heading">
        <h2
          id="schedule-heading"
          className="text-lg font-semibold text-[var(--color-700)] mb-3"
        >
          Speelschema
        </h2>

        <FilterGroup columns={1} className="mb-4 w-full">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 w-full">
            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              <FilterSelect
                label="Divisie"
                value={selectedDivision}
                onValueChange={setSelectedDivision}
                placeholder="Alle divisies"
                variant="schedule"
                options={[
                  { value: "all", label: "Alle divisies" },
                  { value: "PO1", label: "Play-Off 1" },
                  { value: "PO2", label: "Play-Off 2" },
                ]}
              />
              <FilterSelect
                label="Team"
                value={teamFilterValue}
                onValueChange={setSelectedTeam}
                placeholder="Selecteer team"
                variant="schedule"
                options={[
                  { value: "all", label: "Alle teams" },
                  ...teamNames.map((t) => ({ value: t, label: t })),
                ]}
              />
            </div>
            <div className="w-full sm:w-1/4 sm:shrink-0">
              <DownloadScheduleButton
                matches={scheduleMatchesForExport}
                selectedTeamLabel={
                  selectedTeam !== "all" ? selectedTeam : undefined
                }
                filename={
                  selectedTeam !== "all"
                    ? `playoff-${selectedTeam.toLowerCase().replace(/\s+/g, "-")}`
                    : selectedDivision !== "all"
                      ? `playoff-${selectedDivision.toLowerCase()}`
                      : "playoff-schema"
                }
                calendarName={
                  selectedTeam !== "all"
                    ? `Play-Off - ${selectedTeam}`
                    : selectedDivision !== "all"
                      ? `Play-Off ${selectedDivision}`
                      : "Play-Off Speelschema"
                }
                competitionType="playoff"
              />
            </div>
          </div>
        </FilterGroup>

        {groupedMatches.length > 0 ? (
          <Accordion
            type="multiple"
            value={openSpeeldagen}
            onValueChange={handleAccordionChange}
            className="space-y-3"
          >
            {groupedMatches.map(([speeldag, { matches, playoffType }]) => (
              <MatchGroup
                key={speeldag}
                speeldag={speeldag}
                matches={matches}
                playoffType={playoffType}
              />
            ))}
          </Accordion>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Geen wedstrijden gevonden met de huidige filters
          </div>
        )}
      </section>

    </div>
  );
};

export default PlayOffPage;
