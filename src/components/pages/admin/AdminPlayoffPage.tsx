import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SectionCollapsibleCard, SectionIcon } from "@/components/layout";
import { AppAlertModal, InfoConfirmDescription } from "@/components/modals";
import { Loader2, Trophy, AlertCircle, Calendar, CheckCircle, Clock, Undo2, ChevronRight, Settings, MapPin, Palmtree, Archive, Target } from "lucide-react";
import ArchivePlayoffModal from "@/components/modals/admin/ArchivePlayoffModal";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { playoffService, PlayoffMatch } from "@/services/match/playoffService";
import { fetchRegularStandings } from "@/services/standings/standingsService";
import { teamService } from "@/services/core/teamService";
import { seasonService } from "@/services/seasonService";
import { fetchCupMatchesForSession } from "@/services/core/matchesSessionFetch";
import { cn } from "@/lib/utils";

interface TeamStanding {
  team_id: number;
  team_name: string;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  position: number;
}

interface VacationPeriod {
  start_date: string;
  end_date: string;
  name?: string;
}

interface WeekData {
  weekStart: string;
  weekLabel: string;
  status: 'playoff' | 'vacation' | 'cup';
  matches?: PlayoffMatch[];
}

type PlayoffStatus = 'none' | 'concept' | 'finalized';
type ConfirmAction = 'finalize' | 'unfinalize' | null;

// Helper functions - gebruik UTC voor consistentie met database opslag
const getWeekMonday = (dateStr: string): string => {
  const date = new Date(dateStr);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + diff
  ));
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
};

const formatWeekLabel = (weekStart: string): string => {
  // Parse lokaal voor weergave
  const [year, month, day] = weekStart.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 6);
  
  const startDay = start.getDate();
  const endDay = end.getDate();
  const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const startMonth = monthNames[start.getMonth()];
  const endMonth = monthNames[end.getMonth()];
  
  if (startMonth === endMonth) {
    return `${startDay}-${endDay} ${startMonth}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
};

const formatMatchTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  // Gebruik UTC om consistentie te behouden met hoe data is opgeslagen
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

const formatMatchDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const dayNames = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  
  // Gebruik UTC voor consistentie
  const dayName = dayNames[date.getUTCDay()];
  const day = date.getUTCDate();
  const month = monthNames[date.getUTCMonth()];
  
  return `${dayName} ${day} ${month}`;
};

// Workflow Stepper Component
const WorkflowStepper = ({
  status
}: {
  status: PlayoffStatus;
}) => {
  const steps = [{
    id: 'none',
    label: 'Configureer',
    shortLabel: '1',
    icon: Settings
  }, {
    id: 'concept',
    label: 'Concept',
    shortLabel: '2',
    icon: Clock
  }, {
    id: 'finalized',
    label: 'Definitief',
    shortLabel: '3',
    icon: CheckCircle
  }];
  const getStepState = (stepId: string) => {
    const statusOrder = ['none', 'concept', 'finalized'];
    const currentIndex = statusOrder.indexOf(status);
    const stepIndex = statusOrder.indexOf(stepId);
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };
  return <div className="flex items-center justify-center gap-1 sm:gap-2 p-3 bg-muted/30 rounded-lg">
      {steps.map((step, i) => {
      const state = getStepState(step.id);
      const Icon = step.icon;
      return <React.Fragment key={step.id}>
            <div className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm transition-colors", state === 'current' && "bg-[hsl(var(--color-500))] text-white", state === 'completed' && "bg-[hsl(var(--color-100))] text-[hsl(var(--color-700))]", state === 'pending' && "bg-muted text-muted-foreground")}>
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.shortLabel}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />}
          </React.Fragment>;
    })}
    </div>;
};

// Mobile Standings Card Component
const MobileStandingsCard = ({
  team,
  isTopTeam,
  isBottomTeam
}: {
  team: TeamStanding;
  isTopTeam: boolean;
  isBottomTeam: boolean;
}) => <div className={cn("p-3 rounded-lg flex items-center justify-between", isTopTeam && "bg-green-50 dark:bg-green-950/30", isBottomTeam && "bg-amber-50 dark:bg-amber-950/30", !isTopTeam && !isBottomTeam && "bg-muted/50")}>
    <div className="flex items-center gap-3 min-w-0">
      <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0", isTopTeam && "bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100", isBottomTeam && "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100", !isTopTeam && !isBottomTeam && "bg-muted-foreground/20 text-muted-foreground")}>
        {team.position}
      </span>
      <span className="font-medium truncate">{team.team_name}</span>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="font-semibold text-sm">{team.points} ptn</span>
      {isTopTeam && <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-[10px] px-1.5">
          Top
        </Badge>}
      {isBottomTeam && <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 text-[10px] px-1.5">
          Bottom
        </Badge>}
    </div>
  </div>;

// Compact Match Chip Component
// Helper to get short location name
const getLocationShort = (location: string | null): string => {
  if (!location) return '?';
  const loc = location.toLowerCase();
  
  if (loc.includes('dageraad') || loc.includes('harelbeke')) {
    return 'Harelb.';
  }
  if (loc.includes('vlasschaard') || loc.includes('bavikhove')) {
    return 'Bavik.';
  }
  
  // Fallback: last word (often the place name)
  const parts = location.split(' ');
  return parts[parts.length - 1].substring(0, 6) + '.';
};

const CompactMatchChip = ({
  match,
  getTeamDisplay
}: {
  match: PlayoffMatch;
  getTeamDisplay: (match: PlayoffMatch, isHome: boolean) => string;
}) => {
  const locationShort = getLocationShort(match.location);
  
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1.5 bg-background border rounded text-xs">
      <span className="font-medium truncate max-w-[50px] sm:max-w-[70px]">
        {getTeamDisplay(match, true)}
      </span>
      <span className="text-muted-foreground">v</span>
      <span className="font-medium truncate max-w-[50px] sm:max-w-[70px]">
        {getTeamDisplay(match, false)}
      </span>
      <span className="text-muted-foreground text-[10px] ml-1 flex items-center gap-0.5">
        <Clock className="h-2.5 w-2.5" />
        {formatMatchTime(match.match_date)}
      </span>
      <span className="text-muted-foreground text-[10px] flex items-center gap-0.5">
        <MapPin className="h-2.5 w-2.5" />
        {locationShort}
      </span>
      <span className="text-muted-foreground text-[10px]">
        {formatMatchDate(match.match_date)}
      </span>
    </div>
  );
};

// Compact Week Card Component with BYE indication
const CompactWeekCard = ({
  week,
  getTeamDisplay,
  byePosition,
  standings
}: {
  week: WeekData;
  getTeamDisplay: (match: PlayoffMatch, isHome: boolean) => string;
  byePosition?: number;
  standings: TeamStanding[];
}) => {
  const topMatches = week.matches?.filter(m => m.playoff_type === 'top') || [];
  const bottomMatches = week.matches?.filter(m => m.playoff_type === 'bottom') || [];
  
  // Get bye team name if finalized
  const byeTeamName = byePosition 
    ? standings.find(s => s.position === byePosition)?.team_name 
    : null;
  const byeDisplay = byeTeamName || (byePosition ? `${byePosition}e` : null);

  return (
    <Card className="overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{week.weekLabel}</span>
        </div>
        {byeDisplay && (
          <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200">
            Bye: {byeDisplay}
          </Badge>
        )}
      </div>
      
      {/* Compact match grid */}
      <div className="p-2 space-y-1.5">
        {/* PO1 matches */}
        {topMatches.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-[9px] h-5 px-1.5 flex-shrink-0">
              PO1
            </Badge>
            {topMatches.map(match => (
              <CompactMatchChip key={match.match_id} match={match} getTeamDisplay={getTeamDisplay} />
            ))}
          </div>
        )}
        
        {/* PO2 matches */}
        {bottomMatches.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 text-[9px] h-5 px-1.5 flex-shrink-0">
              PO2
            </Badge>
            {bottomMatches.map(match => (
              <CompactMatchChip key={match.match_id} match={match} getTeamDisplay={getTeamDisplay} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

// Vacation/Cup Week Card (compact)
const SkippedWeekCard = ({ week }: { week: WeekData }) => (
  <div className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg opacity-70">
    {week.status === 'vacation' && (
      <>
        <Palmtree className="h-4 w-4 text-amber-600" />
        <span className="text-sm text-muted-foreground">{week.weekLabel} - Verlof</span>
      </>
    )}
    {week.status === 'cup' && (
      <>
        <Trophy className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-muted-foreground">{week.weekLabel} - Beker</span>
      </>
    )}
  </div>
);

const AdminPlayoffPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [playoffStatus, setPlayoffStatus] = useState<PlayoffStatus>('none');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  
  // Additional data for week display
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [cupMatches, setCupMatches] = useState<{ match_date: string }[]>([]);

  // Configuration state
  const [topTeamCount, setTopTeamCount] = useState(8);
  const [bottomTeamCount, setBottomTeamCount] = useState(7);
  const [rounds, setRounds] = useState(2);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  useEffect(() => {
    if (!orgQueryEnabled) return;
    void loadInitialData();
  }, [orgQueryEnabled, organizationId]);

  const loadInitialData = async () => {
    if (!orgQueryEnabled || organizationId == null) return;
    try {
      setLoading(true);
      const teamsData = await teamService.getAllTeams();
      setTeams(teamsData);
      const calculatedStandings = await fetchRegularStandings(organizationId);
      setStandings(
        calculatedStandings.map((s) => ({
          team_id: s.team_id,
          team_name: s.team_name,
          points: s.points,
          matches_played: s.played,
          wins: s.won,
          draws: s.draw,
          losses: s.lost,
          goals_for: s.goals_for,
          goals_against: s.goals_against,
          goal_difference: s.goal_diff,
          position: s.position,
        })),
      );
      const playoffData = await playoffService.getPlayoffMatches();
      setPlayoffMatches(playoffData);
      if (playoffData.length === 0) {
        setPlayoffStatus('none');
      } else if (playoffData.some(m => m.is_playoff_finalized)) {
        setPlayoffStatus('finalized');
      } else {
        setPlayoffStatus('concept');
      }
      
      // Load vacation periods + seizoensopzet defaults
      try {
        const seasonData = await seasonService.getSeasonData(organizationId);
        setVacationPeriods(seasonData.vacation_periods || []);
        if (seasonData.season_start_date) setStartDate(seasonData.season_start_date);
        if (seasonData.season_end_date) setEndDate(seasonData.season_end_date);
        const setup = seasonData.season_setup;
        if (setup?.systems?.playoffs && setup.playoffs) {
          setTopTeamCount(setup.playoffs.topTeams);
          setBottomTeamCount(setup.playoffs.bottomTeams);
          setRounds(setup.playoffs.rounds);
        }
      } catch (e) {
        console.log('Could not load vacation periods');
      }
      
      // Load cup matches
      const cupFromForms = await fetchCupMatchesForSession();
      setCupMatches(cupFromForms.map((m) => ({ match_date: m.match_date })));
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: "Fout bij laden",
        description: "Er is een fout opgetreden bij het laden van de data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Group matches by week with vacation/cup indication
  const weeksWithMatches = useMemo<WeekData[]>(() => {
    if (playoffMatches.length === 0) return [];
    
    // Find date range from playoff matches
    const dates = playoffMatches.map(m => new Date(m.match_date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    // Get all weeks in range
    const weeks: WeekData[] = [];
    let currentWeekStr = getWeekMonday(minDate.toISOString());
    const endWeekStr = getWeekMonday(maxDate.toISOString());
    
    // Parse end week and add 7 days
    const [endY, endM, endD] = endWeekStr.split('-').map(Number);
    const endWeekDate = new Date(endY, endM - 1, endD + 7);
    
    while (true) {
      const [curY, curM, curD] = currentWeekStr.split('-').map(Number);
      const currentDate = new Date(curY, curM - 1, curD);
      
      if (currentDate > endWeekDate) break;
      
      const weekKey = currentWeekStr;
      const weekEndDate = new Date(curY, curM - 1, curD + 6);
      
      // Find matches for this week
      const weekMatches = playoffMatches.filter(m => {
        const matchWeek = getWeekMonday(m.match_date);
        return matchWeek === weekKey;
      }).sort((a, b) => {
        // Sort by playoff type (top first), then by date
        if (a.playoff_type !== b.playoff_type) {
          return a.playoff_type === 'top' ? -1 : 1;
        }
        return new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
      });
      
      if (weekMatches.length > 0) {
        weeks.push({
          weekStart: weekKey,
          weekLabel: formatWeekLabel(weekKey),
          status: 'playoff',
          matches: weekMatches
        });
      } else {
        // Check if vacation
        const isVacation = vacationPeriods.some(v => {
          const vStart = new Date(v.start_date);
          const vEnd = new Date(v.end_date);
          return currentDate <= vEnd && weekEndDate >= vStart;
        });
        
        // Check if cup matches this week
        const hasCupMatch = cupMatches.some(cup => {
          const cupWeek = getWeekMonday(cup.match_date);
          return cupWeek === weekKey;
        });
        
        if (isVacation) {
          weeks.push({
            weekStart: weekKey,
            weekLabel: formatWeekLabel(weekKey),
            status: 'vacation'
          });
        } else if (hasCupMatch) {
          weeks.push({
            weekStart: weekKey,
            weekLabel: formatWeekLabel(weekKey),
            status: 'cup'
          });
        }
      }
      
      // Ga naar volgende week
      const nextDate = new Date(curY, curM - 1, curD + 7);
      currentWeekStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    }
    
    return weeks;
  }, [playoffMatches, vacationPeriods, cupMatches]);

  // Calculate BYE info for each matchday (for bottom playoff with 7 teams)
  const byeInfoMap = useMemo<Map<number, number>>(() => {
    const bottomPositions = Array.from({ length: bottomTeamCount }, (_, i) => topTeamCount + i + 1);
    return playoffService.getByeInfoForPlayoffs(bottomPositions, rounds);
  }, [bottomTeamCount, topTeamCount, rounds]);

  // Extract matchday number from speeldag string
  const getMatchdayFromWeek = (week: WeekData): number | undefined => {
    const firstMatch = week.matches?.[0];
    if (!firstMatch?.speeldag) return undefined;
    const match = firstMatch.speeldag.match(/Speeldag (\d+)/);
    return match ? parseInt(match[1]) : undefined;
  };

  const handleGeneratePositionBasedPlayoffs = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Datums vereist",
        description: "Selecteer een geldige start- en einddatum voor de playoffs.",
        variant: "destructive"
      });
      return;
    }
    setActionLoading(true);
    try {
      const topPositions = Array.from({ length: topTeamCount }, (_, i) => i + 1);
      const bottomPositions = Array.from({ length: bottomTeamCount }, (_, i) => topTeamCount + i + 1);
      const result = await playoffService.generatePositionBasedPlayoffs(topPositions, bottomPositions, rounds, startDate, endDate);
      if (result.success) {
        toast({
          title: "Planning aangemaakt",
          description: result.message
        });
        await loadInitialData();
      } else {
        toast({
          title: "Fout bij genereren",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error generating playoffs:', error);
      toast({
        title: "Fout bij genereren",
        description: "Er is een fout opgetreden bij het genereren van de playoffs.",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalizePlayoffs = async () => {
    setActionLoading(true);
    try {
      const standingsMap = new Map<number, number>();
      standings.forEach(team => {
        standingsMap.set(team.position, team.team_id);
      });
      const result = await playoffService.finalizePlayoffs(standingsMap);
      if (result.success) {
        toast({
          title: "Playoffs gefinaliseerd",
          description: result.message
        });
        await loadInitialData();
      } else {
        toast({
          title: "Fout bij finaliseren",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error finalizing playoffs:', error);
      toast({
        title: "Fout bij finaliseren",
        description: "Er is een fout opgetreden bij het finaliseren.",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleUnfinalizePlayoffs = async () => {
    setActionLoading(true);
    try {
      const result = await playoffService.unfinalizePlayoffs();
      if (result.success) {
        toast({
          title: "Finalisatie ongedaan gemaakt",
          description: result.message
        });
        await loadInitialData();
      } else {
        toast({
          title: "Fout",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error unfinalizing playoffs:', error);
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden.",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleConfirmedAction = async () => {
    // Sla de huidige actie op VOORDAT we iets doen
    const action = confirmAction;
    if (!action) return;
    
    // Sluit dialoog NIET automatisch - laat de handlers dat doen
    // Voer de actie uit en wacht tot deze klaar is
    switch (action) {
      case 'finalize':
        await handleFinalizePlayoffs();
        break;
      case 'unfinalize':
        await handleUnfinalizePlayoffs();
        break;
    }
    
    // Sluit dialoog pas NA succesvolle uitvoering
    setConfirmAction(null);
  };

  const getTeamDisplay = (match: PlayoffMatch, isHome: boolean) => {
    if (isHome) {
      if (match.home_team_name) return match.home_team_name;
      if (match.home_position) return `${match.home_position}e`;
      return 'Onbekend';
    } else {
      if (match.away_team_name) return match.away_team_name;
      if (match.away_position) return `${match.away_position}e`;
      return 'Onbekend';
    }
  };

  const hasPlayoffMatches = playoffMatches.length > 0;
  
  const confirmDialogContent = {
    finalize: {
      title: 'Playoffs Finaliseren?',
      description: 'Teams worden definitief toegewezen op basis van de huidige stand. Zorg dat de competitie is afgelopen.',
      actionLabel: 'Finaliseer',
      variant: 'default' as const
    },
    unfinalize: {
      title: 'Finalisatie Ongedaan Maken?',
      description: 'Teams worden weer vervangen door posities. Je kunt later opnieuw finaliseren met een nieuwe stand.',
      actionLabel: 'Maak Ongedaan',
      variant: 'default' as const
    }
  };

  return <div className={cn("space-y-6", !embedded && "animate-slide-up")}>
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {!embedded ? (
            <PageHeader
              className="mb-0 min-w-0 flex-1"
              title="Playoffs"
              subtitle="Beheer de playoffs — genereren, finaliseren en overzicht"
              icon={Target}
            />
          ) : (
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-brand-dark">Play-offs</h2>
              <p className="text-sm text-muted-foreground">
                Genereren, finaliseren en overzicht binnen dit seizoen
              </p>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => setShowArchiveModal(true)}
            className="w-full shrink-0 border-amber-400/70 text-amber-950 hover:bg-amber-50 hover:text-amber-950 sm:w-auto"
          >
            <Archive className="w-4 h-4 mr-2" />
            Playoff archief
          </Button>
        </div>
        <WorkflowStepper status={playoffStatus} />
      </div>

      <ArchivePlayoffModal
        open={showArchiveModal}
        onOpenChange={setShowArchiveModal}
      />

      <section className="space-y-4 sm:space-y-6">
        {/* Competitie Stand */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <SectionIcon icon={Trophy} />
              Huidige Stand
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Posities voor playoff planning
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div> : isMobile ?
          // Mobile: Card-based layout
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {standings.map(team => <MobileStandingsCard key={team.team_id} team={team} isTopTeam={team.position <= topTeamCount} isBottomTeam={team.position > topTeamCount && team.position <= topTeamCount + bottomTeamCount} />)}
              </div> :
          // Desktop: Table layout
          <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-center">GS</TableHead>
                      <TableHead className="text-center">W</TableHead>
                      <TableHead className="text-center">G</TableHead>
                      <TableHead className="text-center">V</TableHead>
                      <TableHead className="text-center">DS</TableHead>
                      <TableHead className="text-center">Ptn</TableHead>
                      <TableHead className="text-center">Playoff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standings.map(team => {
                  const isTopTeam = team.position <= topTeamCount;
                  const isBottomTeam = team.position > topTeamCount && team.position <= topTeamCount + bottomTeamCount;
                  return <TableRow key={team.team_id} className={cn(isTopTeam && "bg-green-50 dark:bg-green-950/30", isBottomTeam && "bg-amber-50 dark:bg-amber-950/30")}>
                          <TableCell className="font-bold">{team.position}</TableCell>
                          <TableCell className="font-medium">{team.team_name}</TableCell>
                          <TableCell className="text-center">{team.matches_played}</TableCell>
                          <TableCell className="text-center">{team.wins}</TableCell>
                          <TableCell className="text-center">{team.draws}</TableCell>
                          <TableCell className="text-center">{team.losses}</TableCell>
                          <TableCell className="text-center">{team.goal_difference}</TableCell>
                          <TableCell className="text-center font-semibold">{team.points}</TableCell>
                          <TableCell className="text-center">
                            {isTopTeam && <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs">
                                Top
                              </Badge>}
                            {isBottomTeam && <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 text-xs">
                                Bottom
                              </Badge>}
                          </TableCell>
                        </TableRow>;
                })}
                  </TableBody>
                </Table>
              </div>}
          </CardContent>
        </Card>

        {/* Playoff Configuration & Generation */}
        {playoffStatus === 'none' && <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Planning Genereren</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Maak een concept planning aan op basis van posities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dates - Always visible */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Start
                  </Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Einde
                  </Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-11" />
                </div>
              </div>

              {/* Mobile: Collapsible advanced options */}
              <div className="sm:hidden">
                <SectionCollapsibleCard
                  title="Geavanceerde opties"
                  open={advancedOpen}
                  onOpenChange={setAdvancedOpen}
                  contentClassName="space-y-3"
                >
                    <div className="space-y-1.5">
                      <Label className="text-xs">Top Playoff Teams</Label>
                      <Select value={topTeamCount.toString()} onValueChange={v => setTopTeamCount(parseInt(v))}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[6, 7, 8].map(n => <SelectItem key={n} value={n.toString()}>{n} teams (pos 1-{n})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Bottom Playoff Teams</Label>
                      <Select value={bottomTeamCount.toString()} onValueChange={v => setBottomTeamCount(parseInt(v))}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[6, 7, 8].map(n => <SelectItem key={n} value={n.toString()}>{n} teams (pos {topTeamCount + 1}-{topTeamCount + n})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Aantal Rondes</Label>
                      <Select value={rounds.toString()} onValueChange={v => setRounds(parseInt(v))}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 ronde</SelectItem>
                          <SelectItem value="2">2 rondes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                </SectionCollapsibleCard>
              </div>

              {/* Desktop: Grid layout for advanced options */}
              <div className="hidden sm:grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Top Playoff Teams</Label>
                  <Select value={topTeamCount.toString()} onValueChange={v => setTopTeamCount(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[6, 7, 8].map(n => <SelectItem key={n} value={n.toString()}>{n} teams (pos 1-{n})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bottom Playoff Teams</Label>
                  <Select value={bottomTeamCount.toString()} onValueChange={v => setBottomTeamCount(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[6, 7, 8].map(n => <SelectItem key={n} value={n.toString()}>{n} teams (pos {topTeamCount + 1}-{topTeamCount + n})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Aantal Rondes</Label>
                  <Select value={rounds.toString()} onValueChange={v => setRounds(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 ronde</SelectItem>
                      <SelectItem value="2">2 rondes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Alert className="bg-muted/50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm">
                  De planning wordt aangemaakt met posities. Bij finalisatie worden echte teams toegewezen.
                </AlertDescription>
              </Alert>

              {/* Generate Button */}
              <Button onClick={handleGeneratePositionBasedPlayoffs} disabled={actionLoading || !startDate || !endDate} className="btn btn--primary btn--block h-12 text-base font-medium">
                {actionLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Trophy className="h-5 w-5 mr-2" />}
                Genereer Planning
              </Button>
            </CardContent>
          </Card>}

        {/* Playoffs Beheren */}
        {hasPlayoffMatches && (
          <Card>
            <CardHeader>
              <CardTitle>Playoffs Beheren</CardTitle>
              <CardDescription>Bekijk en beheer de huidige playoff planning</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {playoffStatus === 'concept' && (
                <>
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertDescription>
                      Concept planning actief met {playoffMatches.length} wedstrijden. Wachten op eindstand om te finaliseren.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <h4 className="font-medium">Playoff Statistieken:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Totaal wedstrijden: {playoffMatches.length}</li>
                      <li>• PO1 wedstrijden: {playoffMatches.filter(m => m.playoff_type === 'top').length}</li>
                      <li>• PO2 wedstrijden: {playoffMatches.filter(m => m.playoff_type === 'bottom').length}</li>
                    </ul>
                  </div>
                  <Button onClick={() => setConfirmAction('finalize')} disabled={actionLoading} className="w-full">
                    {actionLoading && confirmAction === 'finalize' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Finaliseer Playoffs
                  </Button>
                </>
              )}
              {playoffStatus === 'finalized' && (
                <>
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Playoffs gefinaliseerd met {playoffMatches.length} wedstrijden. Teams zijn toegewezen.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <h4 className="font-medium">Playoff Statistieken:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Totaal wedstrijden: {playoffMatches.length}</li>
                      <li>• PO1 wedstrijden: {playoffMatches.filter(m => m.playoff_type === 'top').length}</li>
                      <li>• PO2 wedstrijden: {playoffMatches.filter(m => m.playoff_type === 'bottom').length}</li>
                    </ul>
                  </div>
                  <Button variant="outline" onClick={() => setConfirmAction('unfinalize')} disabled={actionLoading} className="w-full">
                    {actionLoading && confirmAction === 'unfinalize' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
                    Terug naar Concept
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Planning per Week */}
        {hasPlayoffMatches && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SectionIcon icon={Calendar} />
                Planning per Week
              </CardTitle>
              <CardDescription>Overzicht van alle geplande playoff wedstrijden per speelweek</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {weeksWithMatches.map((week) => {
                if (week.status === 'playoff' && week.matches) {
                  const matchday = getMatchdayFromWeek(week);
                  const byePosition = matchday ? byeInfoMap.get(matchday) : undefined;
                  return (
                    <CompactWeekCard 
                      key={week.weekStart} 
                      week={week} 
                      getTeamDisplay={getTeamDisplay}
                      byePosition={byePosition}
                      standings={standings}
                    />
                  );
                }
                return <SkippedWeekCard key={week.weekStart} week={week} />;
              })}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!hasPlayoffMatches && playoffStatus === 'none' && !loading && (
          <Card>
            <CardHeader>
              <CardTitle>Playoffs Beheren</CardTitle>
              <CardDescription>Bekijk en beheer de huidige playoff planning</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Er is momenteel geen playoff planning actief. Configureer de instellingen hierboven en genereer een planning.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Confirmation Dialog */}
      <AppAlertModal
        open={confirmAction !== null}
        onOpenChange={open => {
          // Only close if not loading (prevents closing during async action)
          if (!open && !actionLoading) {
            setConfirmAction(null);
          }
        }}
        title={confirmAction ? confirmDialogContent[confirmAction].title : ''}
        description={
          confirmAction ? (
            <InfoConfirmDescription
              message={confirmDialogContent[confirmAction].description}
            />
          ) : null
        }
        confirmAction={{
          label: confirmAction ? confirmDialogContent[confirmAction].actionLabel : '',
          onClick: handleConfirmedAction,
          variant: 'primary',
          disabled: actionLoading,
          loading: actionLoading,
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: () => setConfirmAction(null),
          variant: "secondary",
          disabled: actionLoading,
        }}
        size="sm"
      />
    </div>;
};

export default AdminPlayoffPage;
