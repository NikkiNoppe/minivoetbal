import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { RefreshCw, Filter, UserCheck, Users, MapPin, Calendar, Shield } from 'lucide-react';
import { SectionIcon } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { assignmentService } from '@/services/scheidsrechter/assignmentService';
import {
  fetchRefereeAssignmentsForSession,
  fetchScheidsScheduleForMonth,
} from '@/services/scheidsrechter/scheidsSessionFetch';
import { refereeAvailabilityService } from '@/services/scheidsrechter/refereeAvailabilityService';
import type { RefereeAssignmentStats } from '@/services/scheidsrechter/types';
import AssignmentCard from './AssignmentCard';
import { formatDateWithDay, formatTimeForDisplay } from '@/lib/dateUtils';
import { getLocationOrder } from '@/lib/matchSortingUtils';

interface MatchWithAssignment {
  match_id: number;
  match_date: string;
  location: string | null;
  home_team_name: string;
  away_team_name: string;
  assigned_referee_id: number | null;
  current_referee_name?: string;
  current_assignment?: any;
}

// Helper: Generate month options
const getMonthOptions = () => {
  const months = [];
  const currentDate = new Date();
  for (let i = -1; i <= 6; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
    const value = format(date, 'yyyy-MM');
    const label = format(date, 'MMMM yyyy', { locale: nl });
    months.push({ value, label });
  }
  return months;
};

interface AssignmentManagementProps {
  /** Externe maand (YYYY-MM) — als gezet wordt de interne selector gehide. */
  selectedMonth?: string;
  onSelectedMonthChange?: (m: string) => void;
  /** Verberg interne header (parent toolbar levert al de maand-selector). */
  hideHeader?: boolean;
}

const AssignmentManagement: React.FC<AssignmentManagementProps> = ({
  selectedMonth: externalMonth,
  onSelectedMonthChange,
  hideHeader = false,
}) => {
  const [internalMonth, setInternalMonth] = useState(format(new Date(), 'yyyy-MM'));
  const selectedMonth = externalMonth ?? internalMonth;
  const setSelectedMonth = (m: string) => {
    if (onSelectedMonthChange) onSelectedMonthChange(m);
    else setInternalMonth(m);
  };
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [matches, setMatches] = useState<MatchWithAssignment[]>([]);
  const [stats, setStats] = useState<RefereeAssignmentStats[]>([]);
  const [availabilityStats, setAvailabilityStats] = useState<{
    total_referees: number;
    responded_count: number;
    available_by_date: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    console.log('[AssignmentManagement] Fetching data for month:', selectedMonth);
    try {
      const [year, monthNum] = selectedMonth.split('-').map(Number);
      const nextMonth = monthNum === 12 
        ? `${year + 1}-01` 
        : `${year}-${String(monthNum + 1).padStart(2, '0')}`;

      console.log('[AssignmentManagement] Date range:', `${selectedMonth}-01`, 'to', `${nextMonth}-01`);

      const [matchesData, assignments] = await Promise.all([
        fetchScheidsScheduleForMonth(selectedMonth),
        fetchRefereeAssignmentsForSession(selectedMonth),
      ]);

      console.log('[AssignmentManagement] Fetched matches:', matchesData.length);

      const assignmentMap = new Map(
        assignments.map((a) => [a.match_id, a]),
      );

      const enrichedMatches: MatchWithAssignment[] = matchesData.map((m) => ({
        match_id: m.match_id,
        match_date: m.match_date,
        location: m.location,
        home_team_name: m.home_team_name || 'Onbekend',
        away_team_name: m.away_team_name || 'Onbekend',
        assigned_referee_id: m.assigned_referee_id,
        current_referee_name: m.referee || undefined,
        current_assignment: assignmentMap.get(m.match_id),
      }));

      console.log('[AssignmentManagement] Enriched matches:', enrichedMatches.length);
      setMatches(enrichedMatches);

      // Fetch stats
      const [assignmentStats, availStats] = await Promise.all([
        assignmentService.getAssignmentStats(selectedMonth),
        refereeAvailabilityService.getAvailabilityStats(selectedMonth)
      ]);

      setStats(assignmentStats);
      setAvailabilityStats(availStats);
    } catch (error) {
      console.error('[AssignmentManagement] Error fetching data:', error);
      toast.error('Fout bij ophalen gegevens');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter matches
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if (statusFilter === 'assigned') return !!m.assigned_referee_id || !!m.current_referee_name;
      if (statusFilter === 'unassigned') return !m.assigned_referee_id && !m.current_referee_name;
      return true;
    });
  }, [matches, statusFilter]);

  // Group matches by speeldag (date + location)
  const groupedMatches = useMemo(() => {
    const groups: Map<string, { 
      dateKey: string; 
      date: string; 
      location: string; 
      matches: MatchWithAssignment[] 
    }> = new Map();

    filteredMatches.forEach(match => {
      // Extract date (YYYY-MM-DD) from ISO string
      const dateOnly = match.match_date.slice(0, 10);
      const location = match.location || 'Onbekende locatie';
      const groupKey = `${dateOnly}__${location}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          dateKey: dateOnly,
          date: match.match_date,
          location,
          matches: []
        });
      }
      groups.get(groupKey)!.matches.push(match);
    });

    // Sort groups by date, then by location (Harelbeke first), then by time
    return Array.from(groups.values()).sort((a, b) => {
      const dateCompare = a.dateKey.localeCompare(b.dateKey);
      if (dateCompare !== 0) return dateCompare;
      return getLocationOrder(a.location) - getLocationOrder(b.location);
    });
  }, [filteredMatches]);

  const assignedCount = matches.filter(m => m.assigned_referee_id || m.current_referee_name).length;
  const unassignedCount = matches.length - assignedCount;

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
              <SectionIcon icon={Shield} />
              Scheidsrechter Toewijzingen
            </h2>
            <p className="text-sm text-muted-foreground">
              Wijs scheidsrechters toe aan wedstrijden
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMonthOptions().map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="unstyled"
              className="btn btn--icon"
              onClick={fetchData}
              disabled={loading}
              aria-label="Vernieuwen"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-success/10">
                <UserCheck className="h-4 w-4 text-success" />
              </div>
              <div>
                <div className="text-2xl font-bold">{assignedCount}</div>
                <div className="text-xs text-muted-foreground">Toegewezen</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-warning/10">
                <Filter className="h-4 w-4 text-warning" />
              </div>
              <div>
                <div className="text-2xl font-bold">{unassignedCount}</div>
                <div className="text-xs text-muted-foreground">Open</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {availabilityStats?.responded_count || 0}/{availabilityStats?.total_referees || 0}
                </div>
                <div className="text-xs text-muted-foreground">Poll respons</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-muted">
                <Filter className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{matches.length}</div>
                <div className="text-xs text-muted-foreground">Wedstrijden</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          Alles ({matches.length})
        </Button>
        <Button
          variant={statusFilter === 'unassigned' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('unassigned')}
        >
          Open ({unassignedCount})
        </Button>
        <Button
          variant={statusFilter === 'assigned' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('assigned')}
        >
          Toegewezen ({assignedCount})
        </Button>
      </div>

      {/* Matches grouped by speeldag */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <div className="grid gap-4 md:grid-cols-2">
                <Card><CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-full" />
                </CardContent></Card>
                <Card><CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-full" />
                </CardContent></Card>
              </div>
            </div>
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-muted-foreground">
              {statusFilter === 'unassigned' 
                ? 'Alle wedstrijden zijn toegewezen!'
                : statusFilter === 'assigned'
                ? 'Nog geen wedstrijden toegewezen'
                : 'Geen wedstrijden gevonden voor deze maand'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedMatches.map((group) => (
            <div key={`${group.dateKey}__${group.location}`} className="space-y-3">
              {/* Speeldag header */}
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>{formatDateWithDay(group.date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{group.location}</span>
                </div>
                <Badge variant="outline" className="ml-auto">
                  {group.matches.length} {group.matches.length === 1 ? 'wedstrijd' : 'wedstrijden'}
                </Badge>
              </div>

              {/* One assignment card per match */}
              {group.matches
                .slice()
                .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.match_id - b.match_id)
                .map((match) => (
                  <AssignmentCard
                    key={match.match_id}
                    matches={[match]}
                    onAssignmentChange={fetchData}
                  />
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Referee Stats */}
      {stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Toewijzingen per Scheidsrechter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.map(referee => (
                <Badge 
                  key={referee.referee_id} 
                  variant="outline"
                  className="px-3 py-1"
                >
                  {referee.referee_name}: {referee.total_assignments}
                  {referee.pending_count > 0 && (
                    <span className="ml-1 text-warning">({referee.pending_count} ⏳)</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AssignmentManagement;
