import React, { useMemo, useState, useEffect } from "react";
import MatchesCard from "./components/MatchesCard";
import { Lock, CheckCircle, Clock } from "lucide-react";
import { MatchFormData } from "./types";
import { Card, CardContent } from "@/components/ui/card";
import { MatchCardSkeleton } from "@/components/ui/skeleton";
import { 
  sortMatchesByDateAndTime, 
  getCupRoundName, 
  sortMatchesWithinGroups, 
  sortGroupKeys 
} from "@/lib/matchSortingUtils";
import { shouldAutoLockMatch } from "@/lib/matchLockUtils";
import { Accordion } from "@/components/ui/accordion";
import { SectionAccordionItem } from "@/components/layout";

interface MatchFormListProps {
  matches: MatchFormData[];
  isLoading: boolean;
  onSelectMatch: (match: MatchFormData) => void;
  searchTerm: string;
  dateFilter: string;
  matchdayFilter: string;
  teamFilter?: string;
  sortBy?: string;
  hasElevatedPermissions?: boolean;
  userRole?: string;
  teamId?: number;
}

// Helper function to check if a team manager can access a match
const canTeamManagerAccessMatch = (match: MatchFormData, userTeamId: number): boolean => {
  return match.homeTeamId === userTeamId || match.awayTeamId === userTeamId;
};


const getMatchStatus = (match: MatchFormData) => {
  const hasValidScore = (score: number | null | undefined): boolean => 
    score !== null && score !== undefined;
  
  if (hasValidScore(match.homeScore) && hasValidScore(match.awayScore)) {
    return {
      label: "Gespeeld",
      className: "bg-success text-success-foreground border border-success/30",
      icon: CheckCircle,
    };
  }
  
  const isAutoLocked = shouldAutoLockMatch(match.date, match.time);
  
  if (match.isLocked || isAutoLocked) {
    return {
      label: "Gesloten",
      className: "bg-destructive text-destructive-foreground border border-destructive/30",
      icon: Lock,
    };
  }
  
  return {
    label: "Open",
    className: "bg-accent text-accent-foreground border border-primary/25",
    icon: Clock,
  };
};

const MatchFormList: React.FC<MatchFormListProps> = ({
  matches,
  isLoading,
  onSelectMatch,
  searchTerm,
  dateFilter,
  matchdayFilter,
  teamFilter = "",
  sortBy,
  hasElevatedPermissions = false,
  userRole,
  teamId
}) => {
  const [openSpeeldagen, setOpenSpeeldagen] = useState<string[]>([]);
  const filteredMatches = useMemo(() => matches.filter(match => {
    const matchesSearch = searchTerm === "" || 
      match.uniqueNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.homeTeamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.awayTeamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (match.matchday && match.matchday.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDate = dateFilter === "" || match.date === dateFilter;
    return matchesSearch && matchesDate;
  }), [matches, searchTerm, dateFilter]);

  const isCupMatchList = useMemo(() => {
    if (filteredMatches.length === 0) return false;
    return filteredMatches.some((m) => {
      const unique = m.uniqueNumber || "";
      if (unique && getCupRoundName(unique) !== "Andere") return true;
      return Boolean(m.matchday?.includes("🏆"));
    });
  }, [filteredMatches]);

  const groupedMatches = useMemo(() => {
    const useWeekGrouping = !isCupMatchList && sortBy === 'week';

    const grouped = filteredMatches.reduce((groups, match) => {
      if (isCupMatchList) {
        const roundName = getCupRoundName(match.uniqueNumber);
        if (!groups[roundName]) groups[roundName] = [];
        groups[roundName].push(match);
        return groups;
      }

      if (useWeekGrouping) {
        const getISOWeekInfo = (dateStr: string) => {
          const d = new Date(dateStr);
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() + 4 - (d.getDay() || 7));
          const yearStart = new Date(d.getFullYear(), 0, 1);
          const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
          const year = d.getFullYear();
          return { year, week };
        };

        const { year, week } = getISOWeekInfo(match.date);
        const key = `${year}-W${String(week).padStart(2, '0')}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(match);
        return groups;
      }

      // Default to speeldag grouping for league matches
      const matchday = match.matchday || "Geen speeldag";
      if (!groups[matchday]) groups[matchday] = [];
      groups[matchday].push(match);
      return groups;
    }, {} as Record<string, MatchFormData[]>);

    // Sort matches within each group
    const sortedGroups = sortMatchesWithinGroups(grouped, isCupMatchList);

    // Determine group key order
    let sortedGroupKeys: string[] = [];
    if (useWeekGrouping) {
      sortedGroupKeys = Object.keys(sortedGroups).sort((a, b) => {
        const [ya, wa] = a.split('-W');
        const [yb, wb] = b.split('-W');
        const yearA = parseInt(ya, 10) || 0;
        const yearB = parseInt(yb, 10) || 0;
        const weekA = parseInt(wa, 10) || 0;
        const weekB = parseInt(wb, 10) || 0;
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
      });
    } else {
      sortedGroupKeys = sortGroupKeys(Object.keys(sortedGroups), isCupMatchList);
    }

    // Build display labels
    const groupLabels: Record<string, string> = {};
    const groupDates: Record<string, string> = {}; // Store dates separately for right alignment
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    
    if (useWeekGrouping) {
      sortedGroupKeys.forEach((key) => {
        const [_, wStr] = key.split('-W');
        const weekNum = parseInt(wStr, 10) || 0;
        const dates = sortedGroups[key].map(m => new Date(m.date)).sort((a, b) => a.getTime() - b.getTime());
        const minD = dates[0];
        const maxD = dates[dates.length - 1];
        if (minD && maxD) {
          groupLabels[key] = `Speelweek ${weekNum}`;
          groupDates[key] = minD.getTime() === maxD.getTime()
            ? fmt(minD)
            : `${fmt(minD)} — ${fmt(maxD)}`;
        } else {
          groupLabels[key] = `Speelweek ${weekNum}`;
          groupDates[key] = '';
        }
      });
    } else {
      // For speeldag/cup/playoff grouping, add dates with year
      sortedGroupKeys.forEach((key) => {
        groupLabels[key] = key; // Speeldag/cup round name
        const dates = sortedGroups[key].map(m => new Date(m.date)).sort((a, b) => a.getTime() - b.getTime());
        const minD = dates[0];
        const maxD = dates[dates.length - 1];
        if (minD && maxD) {
          groupDates[key] = minD.getTime() === maxD.getTime()
            ? fmt(minD)
            : `${fmt(minD)} — ${fmt(maxD)}`;
        } else {
          groupDates[key] = '';
        }
      });
    }

    return { sortedGroups, sortedGroupKeys, groupLabels, groupDates };
  }, [filteredMatches, isCupMatchList, sortBy]);

  // Find the first speeldag that is not fully completed
  const defaultOpenSpeeldag = useMemo(() => {
    for (const groupKey of groupedMatches.sortedGroupKeys) {
      const matchesInGroup = groupedMatches.sortedGroups[groupKey];
      const isCompleted = matchesInGroup.every(match => 
        match.homeScore !== undefined && 
        match.homeScore !== null && 
        match.awayScore !== undefined && 
        match.awayScore !== null
      );
      if (!isCompleted && matchesInGroup.length > 0) {
        return groupKey;
      }
    }
    // If all are completed, return the first one
    return groupedMatches.sortedGroupKeys.length > 0 ? groupedMatches.sortedGroupKeys[0] : undefined;
  }, [groupedMatches]);

  // Update open speeldagen based on team filter selection
  // Use a ref to track if we should allow manual changes
  const isManualChangeRef = React.useRef(false);
  const prevTeamFilterRef = React.useRef(teamFilter);
  
  useEffect(() => {
    // Only update if teamFilter actually changed
    const teamFilterChanged = prevTeamFilterRef.current !== teamFilter;
    
    // Don't override manual changes unless filter actually changed
    if (isManualChangeRef.current && !teamFilterChanged) {
      isManualChangeRef.current = false;
      return;
    }
    
    // Update ref
    if (teamFilterChanged) {
      prevTeamFilterRef.current = teamFilter;
    }
    
    if (teamFilter === "" || teamFilter === "all") {
      // Default: only first incomplete speeldag
      if (defaultOpenSpeeldag) {
        setOpenSpeeldagen([defaultOpenSpeeldag]);
      } else {
        setOpenSpeeldagen([]);
      }
    } else {
      // When a team is selected: open all speeldagen
      const allSpeeldagen = groupedMatches.sortedGroupKeys;
      setOpenSpeeldagen(allSpeeldagen);
    }
    
    isManualChangeRef.current = false;
  }, [teamFilter, defaultOpenSpeeldag, groupedMatches.sortedGroupKeys]);

  // Handle manual accordion changes
  const handleAccordionChange = (value: string[]) => {
    isManualChangeRef.current = true;
    setOpenSpeeldagen(value);
  };

const getGridClassName = (groupKey: string) => {
    // For cup matches, use specific grid layouts
    if (isCupMatchList) {
      switch (groupKey) {
        case 'Achtste Finales':
        case 'Kwart Finales':
          return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4';
        case 'Halve Finales':
          return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2';
        case 'Finale':
          return 'grid-cols-1 max-w-md mx-auto';
        default:
          return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      }
    }
    
    // Default grid for league and playoff matches
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  const createBadgeSlot = (match: MatchFormData) => {
    const status = getMatchStatus(match);
    const StatusIcon = status.icon;

    return (
      <span className="ml-auto flex items-center gap-2">
        <span
          className={`${status.className} text-xs font-semibold px-2 py-0.5 shadow-sm rounded flex items-center gap-1`}
        >
          <StatusIcon className="h-3 w-3 shrink-0" aria-hidden />
          {status.label}
        </span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Wedstrijden laden…</span>
        {[...Array(4)].map((_, index) => (
          <MatchCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (filteredMatches.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">Geen wedstrijden gevonden</p>
        </CardContent>
      </Card>
    );
  }

  // Use accordion structure for all match types (league, cup, playoff)
  return (
    <Accordion 
      type="multiple" 
      value={openSpeeldagen}
      onValueChange={handleAccordionChange}
      className="space-y-3"
    >
      {groupedMatches.sortedGroupKeys.map(groupKey => (
        <SectionAccordionItem
          key={groupKey}
          value={groupKey}
          triggerContent={
            <>
              <span className="text-left flex-1 min-w-0">
                {groupedMatches.groupLabels?.[groupKey] ?? groupKey}
              </span>
              {groupedMatches.groupDates?.[groupKey] && (
                <span className="text-xs font-normal text-muted-foreground shrink-0">
                  {groupedMatches.groupDates[groupKey]}
                </span>
              )}
            </>
          }
        >
            <div className={`grid gap-4 ${getGridClassName(groupKey)}`}>
              {groupedMatches.sortedGroups[groupKey].map(match => {
                const isTeamManager = userRole === 'player_manager';
                const canAccess = hasElevatedPermissions || (isTeamManager && teamId && canTeamManagerAccessMatch(match, teamId));
                
                return (
                  <button
                    key={match.matchId}
                    onClick={() => canAccess ? onSelectMatch(match) : null}
                    disabled={!canAccess}
                    className={`border-none bg-transparent p-0 transition-all duration-200 text-left w-full group ${
                      canAccess 
                        ? "hover:shadow-none hover:border-none hover:bg-transparent cursor-pointer" 
                        : "cursor-not-allowed opacity-50"
                    }`}
                    title={!canAccess ? "Alleen toegankelijk voor je eigen team" : undefined}
                  >
                    <MatchesCard
                      id={undefined}
                      home={match.homeTeamName}
                      away={match.awayTeamName}
                      homeScore={match.homeScore}
                      awayScore={match.awayScore}
                      date={match.date}
                      time={match.time}
                      location={match.location}
                      status={undefined}
                      badgeSlot={createBadgeSlot(match)}
                    />
                  </button>
                );
              })}
            </div>
        </SectionAccordionItem>
      ))}
    </Accordion>
  );
};

export default React.memo(MatchFormList);
