import React, { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  RefreshCw,
  Check,
  X,
  Star,
  Minus,
  Wand2,
  Copy,
  Mail,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SectionCollapsibleCard } from '@/components/layout';
import { toast } from 'sonner';
import { getRpcSessionArgs } from '@/lib/authSession';
import { supabase } from '@/integrations/supabase/client';
import { assignmentService } from '@/services/scheidsrechter/assignmentService';
import {
  fetchRefereeAssignmentsForSession,
  fetchRefereeAvailabilityForSession,
  fetchRefereesForSession,
  fetchScheidsScheduleForMonth,
} from '@/services/scheidsrechter/scheidsSessionFetch';
import {
  suggestRefereesForSession,
  fetchWorkloadStats,
  type SuggestionCandidate,
} from '@/services/scheidsrechter/autoSuggestService';
import { useAuth } from '@/hooks/useAuth';
import { formatDateWithDay, formatTimeForDisplay } from '@/lib/dateUtils';
import { getLocationOrder } from '@/lib/matchSortingUtils';
import { notificationService } from '@/services/notificationService';

// Types
interface RefereeInfo {
  user_id: number;
  username: string;
}

interface AdminUserInfo {
  user_id: number;
  username: string;
  role: string;
}

interface SessionMatch {
  match_id: number;
  match_date: string;
  location: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  assigned_referee_id: number | null;
  home_team_name: string;
  away_team_name: string;
}

interface Session {
  key: string;
  date: string;
  dateOnly: string;
  location: string;
  matches: SessionMatch[];
}

interface AvailabilityData {
  user_id: number;
  match_id: number | null;
  poll_group_id: string;
  is_available: boolean;
}

interface AssignmentData {
  id: number;
  match_id: number;
  referee_id: number;
  assigned_by: number | null;
  assigned_at: string | null;
}

type AdminAvailabilityStatus = boolean | null;

interface RefereeCopyMessage {
  refereeId: number;
  refereeName: string;
  text: string;
  assignmentCount: number;
}

const getMonthOptions = () => {
  const months = [];
  const currentDate = new Date();
  for (let i = -1; i <= 6; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
    months.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: nl })
    });
  }
  return months;
};

interface AvailabilityMatrixProps {
  /** Verberg de header (maand-selector + refresh + counter) — handig wanneer parent al een toolbar heeft */
  hideHeader?: boolean;
  /** Externe maand-controle */
  selectedMonth?: string;
  onSelectedMonthChange?: (month: string) => void;
  /** Optionele externe plek voor matrixacties, zoals Auto-toewijzen naast de maandselector. */
  toolbarContainer?: HTMLElement | null;
}

const SESSION_COLUMN_WIDTH = 260;
const REFEREE_COLUMN_WIDTH = 64;
const SESSION_ROW_HEIGHT = 44;
const DAY_HEADER_HEIGHT = 32;

function MatrixStatusLegend({
  className,
  variant = 'default',
}: {
  className?: string;
  variant?: 'default' | 'embedded';
}) {
  const items = (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-success shadow-sm">
          <Star className="h-2.5 w-2.5 fill-white text-white" aria-hidden />
        </span>
        <span className="truncate">Toegewezen</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-success/40 bg-success/15">
          <Check className="h-2.5 w-2.5 text-success" aria-hidden />
        </span>
        <span className="truncate">Beschikbaar</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-muted">
          <X className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />
        </span>
        <span className="truncate">Niet beschikbaar</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-dashed border-border bg-card">
          <Minus className="h-2.5 w-2.5 text-muted-foreground/60" aria-hidden />
        </span>
        <span className="truncate">Geen reactie</span>
      </div>
    </>
  );

  if (variant === 'embedded') {
    return (
      <div
        className={`mx-auto flex max-w-[180px] flex-col gap-1 text-[10px] leading-tight ${className ?? ''}`}
        role="note"
        aria-label="Legenda beschikbaarheid"
      >
        <div className="flex flex-col gap-1">{items}</div>
        <p className="mt-1 border-t border-border/60 pt-1 text-[9px] font-normal italic text-muted-foreground">
          Klik op een cel om een van de 4 statussen te kiezen.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] leading-tight ${className ?? ''}`}
      role="note"
      aria-label="Legenda beschikbaarheid"
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">{items}</div>
      <p className="mt-2 border-t border-border/50 pt-2 text-[10px] font-normal italic text-muted-foreground">
        Tik op een scheidsrechter om een van de 4 statussen in te vullen.
      </p>
    </div>
  );
}

function sortRefereesForSession(
  refereeList: RefereeInfo[],
  session: Session,
  assignedRefId: number | null,
  isAvailable: (session: Session, refereeId: number) => boolean,
  hasResponded: (session: Session, refereeId: number) => boolean,
): RefereeInfo[] {
  const priority = (refereeId: number) => {
    if (assignedRefId === refereeId) return 0;
    if (isAvailable(session, refereeId)) return 1;
    if (hasResponded(session, refereeId)) return 2;
    return 3;
  };

  return [...refereeList].sort((a, b) => {
    const diff = priority(a.user_id) - priority(b.user_id);
    if (diff !== 0) return diff;
    return a.username.localeCompare(b.username);
  });
}

const formatSessionLocation = (location: string) => {
  const [place] = location.split(' - ');
  return place?.trim() || location;
};

function matchDateOnly(matchDate: string): string {
  return matchDate.slice(0, 10);
}

function formatSessionMatchPairing(session: Session): string {
  const match = session.matches[0];
  if (!match) return '';
  return `${match.home_team_name} – ${match.away_team_name}`;
}

function formatSessionCopyLine(session: Session): string {
  const start = new Date(session.date);
  const dateText = format(
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
    'EEEE d MMMM yyyy',
    { locale: nl },
  );
  const pairing = formatSessionMatchPairing(session);
  const parts = [
    dateText,
    formatTimeForDisplay(session.date),
    formatSessionLocation(session.location),
  ];
  if (pairing) parts.push(pairing);
  return parts.join(' – ');
}

interface SessionDayGroup {
  dateOnly: string;
  date: string;
  sharedLocation: string | null;
  sessions: Session[];
}

function groupSessionsByDay(sessions: Session[]): SessionDayGroup[] {
  const groups: SessionDayGroup[] = [];
  for (const session of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.dateOnly === session.dateOnly) {
      last.sessions.push(session);
    } else {
      groups.push({
        dateOnly: session.dateOnly,
        date: session.date,
        sharedLocation: null,
        sessions: [session],
      });
    }
  }

  return groups.map((group) => {
    const locations = [...new Set(group.sessions.map((s) => formatSessionLocation(s.location)))];
    return {
      ...group,
      sharedLocation: locations.length === 1 ? locations[0] : null,
    };
  });
}

/** Tailwind `lg` — voorkomt dubbele portaled dropdowns (CSS-hidden triggert nog steeds Content). */
const LG_BREAKPOINT_PX = 1024;
function useShowDesktopMatrix() {
  const [showDesktop, setShowDesktop] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= LG_BREAKPOINT_PX : true,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
    const onChange = () => setShowDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return showDesktop;
}

const AvailabilityMatrix: React.FC<AvailabilityMatrixProps> = ({
  hideHeader = false,
  selectedMonth: externalMonth,
  onSelectedMonthChange,
  toolbarContainer,
}) => {
  const { user } = useAuth();
  const showDesktopMatrix = useShowDesktopMatrix();
  const [internalMonth, setInternalMonth] = useState(format(new Date(), 'yyyy-MM'));
  const selectedMonth = externalMonth ?? internalMonth;
  const setSelectedMonth = (m: string) => {
    if (onSelectedMonthChange) onSelectedMonthChange(m);
    else setInternalMonth(m);
  };

  const [referees, setReferees] = useState<RefereeInfo[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [availability, setAvailability] = useState<AvailabilityData[]>([]);
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [usersById, setUsersById] = useState<Map<number, string>>(new Map());
  const [monthCounts, setMonthCounts] = useState<Map<number, number>>(new Map());
  const [seasonCounts, setSeasonCounts] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [copyMessagesOpen, setCopyMessagesOpen] = useState(false);
  const [menuCellKey, setMenuCellKey] = useState<string | null>(null);
  const [emailedMessageKeys, setEmailedMessageKeys] = useState<Set<string>>(() => new Set());
  const [emailSendingKey, setEmailSendingKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (!user?.id) {
        throw new Error('Niet ingelogd');
      }

      const [scheduleRows, refereesList, assignmentRows, availRows, usersRes] = await Promise.all([
        fetchScheidsScheduleForMonth(selectedMonth),
        fetchRefereesForSession(),
        fetchRefereeAssignmentsForSession(selectedMonth),
        fetchRefereeAvailabilityForSession(selectedMonth),
        supabase.rpc('get_all_users_for_admin', getRpcSessionArgs()),
      ]);

      if (usersRes.error) throw usersRes.error;

      const availData: AvailabilityData[] = availRows.map((r) => ({
        user_id: r.user_id,
        match_id: r.match_id,
        poll_group_id: r.poll_group_id,
        is_available: r.is_available,
      }));

      const refereesData = refereesList
        .map((u) => ({ user_id: u.user_id, username: u.username }))
        .sort((a, b) => a.username.localeCompare(b.username));

      const allUsersData = (usersRes.data || []) as AdminUserInfo[];
      const monthAssignments: AssignmentData[] = assignmentRows.map((a) => ({
        id: a.id,
        match_id: a.match_id,
        referee_id: a.referee_id,
        assigned_by: a.assigned_by,
        assigned_at: a.assigned_at,
      }));

      const sortedSessions: Session[] = scheduleRows
        .map((m) => {
          const loc = m.location || 'Onbekend';
          return {
            key: `match-${m.match_id}`,
            date: m.match_date,
            dateOnly: matchDateOnly(m.match_date),
            location: loc,
            matches: [
              {
                match_id: m.match_id,
                match_date: m.match_date,
                location: m.location,
                home_team_id: m.home_team_id,
                away_team_id: m.away_team_id,
                assigned_referee_id: m.assigned_referee_id,
                home_team_name: m.home_team_name || '?',
                away_team_name: m.away_team_name || '?',
              },
            ],
          };
        })
        .sort((a, b) => {
          const dc = a.date.localeCompare(b.date);
          if (dc !== 0) return dc;
          const loc = getLocationOrder(a.location) - getLocationOrder(b.location);
          if (loc !== 0) return loc;
          return a.matches[0].match_id - b.matches[0].match_id;
        });

      setReferees(refereesData);
      setSessions(sortedSessions);
      setAvailability(availData);
      setAssignments(monthAssignments);

      // Bouw users-by-id map: referees + assigners (voor audit-tooltip)
      const userIds = new Set<number>(refereesData.map((r) => r.user_id));
      monthAssignments.forEach((a) => {
        if (a.assigned_by) userIds.add(a.assigned_by);
      });
      if (userIds.size > 0) {
        const map = new Map<number, string>();
        allUsersData
          .filter((u) => userIds.has(u.user_id))
          .forEach((u) => map.set(u.user_id, u.username));
        setUsersById(map);
      } else {
        setUsersById(new Map());
      }

      // Workload stats voor auto-suggest
      const { monthCounts: mc, seasonCounts: sc } = await fetchWorkloadStats(selectedMonth);
      setMonthCounts(mc);
      setSeasonCounts(sc);
    } catch (error) {
      console.error('Error fetching matrix data:', error);
      toast.error('Fout bij ophalen gegevens');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setEmailedMessageKeys(new Set());
    setEmailSendingKey(null);
  }, [selectedMonth]);

  useEffect(() => {
    setMenuCellKey(null);
  }, [showDesktopMatrix]);

  const isRefereeAvailable = useCallback((session: Session, refereeId: number): boolean => {
    for (const match of session.matches) {
      const avail = availability.find(a => a.user_id === refereeId && a.match_id === match.match_id);
      if (avail) return avail.is_available;
    }
    const pollGroupId = `${selectedMonth}_${session.matches[0]?.match_id || 'general'}`;
    const byGroup = availability.find(a => a.user_id === refereeId && a.poll_group_id === pollGroupId);
    if (byGroup) return byGroup.is_available;
    return false;
  }, [availability, selectedMonth]);

  const hasRefereeResponded = useCallback((session: Session, refereeId: number): boolean => {
    if (session.matches.some(m =>
      availability.some(a => a.user_id === refereeId && a.match_id === m.match_id)
    )) return true;
    const pollGroupId = `${selectedMonth}_${session.matches[0]?.match_id || 'general'}`;
    return availability.some(a => a.user_id === refereeId && a.poll_group_id === pollGroupId);
  }, [availability, selectedMonth]);

  const getSessionAssignment = useCallback((session: Session, refereeId: number): AssignmentData | null => {
    for (const match of session.matches) {
      const assignment = assignments.find(a => a.match_id === match.match_id && a.referee_id === refereeId);
      if (assignment) return assignment;
      if (match.assigned_referee_id === refereeId) {
        return {
          id: -match.match_id,
          match_id: match.match_id,
          referee_id: refereeId,
          assigned_by: null,
          assigned_at: null,
        };
      }
    }
    return null;
  }, [assignments]);

  const getSessionAssignedReferee = useCallback((session: Session): number | null => {
    for (const match of session.matches) {
      if (match.assigned_referee_id) return match.assigned_referee_id;
      const assignment = assignments.find(a => a.match_id === match.match_id);
      if (assignment) return assignment.referee_id;
    }
    return null;
  }, [assignments]);

  const applyLocalSessionAssignment = useCallback((session: Session, refereeId: number) => {
    const matchIds = new Set(session.matches.map((match) => match.match_id));
    const assignedAt = new Date().toISOString();

    setSessions((current) =>
      current.map((item) =>
        item.key === session.key
          ? {
              ...item,
              matches: item.matches.map((match) => ({
                ...match,
                assigned_referee_id: refereeId,
              })),
            }
          : item
      )
    );

    setAssignments((current) => [
      ...current.filter((assignment) => !matchIds.has(assignment.match_id)),
      ...session.matches.map((match) => ({
        id: -match.match_id,
        match_id: match.match_id,
        referee_id: refereeId,
        assigned_by: user?.id ?? null,
        assigned_at: assignedAt,
      })),
    ]);
  }, [user?.id]);

  const clearLocalSessionAssignment = useCallback((session: Session) => {
    const matchIds = new Set(session.matches.map((match) => match.match_id));

    setSessions((current) =>
      current.map((item) =>
        item.key === session.key
          ? {
              ...item,
              matches: item.matches.map((match) => ({
                ...match,
                assigned_referee_id: null,
              })),
            }
          : item
      )
    );

    setAssignments((current) => current.filter((assignment) => !matchIds.has(assignment.match_id)));
  }, []);

  const bumpWorkloadCounts = useCallback((refereeId: number, session: Session, delta: number) => {
    setMonthCounts((prev) => {
      const next = new Map(prev);
      next.set(refereeId, Math.max(0, (next.get(refereeId) || 0) + delta));
      return next;
    });
    setSeasonCounts((prev) => {
      const next = new Map(prev);
      next.set(refereeId, Math.max(0, (next.get(refereeId) || 0) + delta));
      return next;
    });
  }, []);

  const openCellMenu = useCallback((cellKey: string) => {
    setMenuCellKey(cellKey);
  }, []);

  const closeCellMenu = useCallback(() => {
    setMenuCellKey(null);
  }, []);

  // Wijs een ref toe aan deze wedstrijd.
  // Als showUndo true is, toont een 5s undo-toast.
  const assignToSessionInternal = async (
    session: Session,
    refereeId: number,
    refereeName: string,
    showUndo: boolean,
  ): Promise<{ assignmentId?: number; anchorMatchId?: number; ok: boolean }> => {
    const targetMatch = session.matches.find((m) => !m.assigned_referee_id) ?? session.matches[0];
    if (!targetMatch) {
      toast.error('Geen wedstrijd gevonden');
      return { ok: false };
    }
    if (targetMatch.assigned_referee_id) {
      toast.error('Deze wedstrijd heeft al een scheidsrechter');
      return { ok: false };
    }
    const result = await assignmentService.assignReferee({
      match_id: targetMatch.match_id,
      referee_id: refereeId,
    });
    if (!result.success) {
      toast.error(result.error || 'Toewijzing mislukt');
      return { ok: false };
    }
    applyLocalSessionAssignment(session, refereeId);
    bumpWorkloadCounts(refereeId, session, 1);

    const pairing = formatSessionMatchPairing(session);
    const toastDescription = [
      formatDateWithDay(session.date),
      formatTimeForDisplay(session.date),
      pairing,
    ].filter(Boolean).join(' · ');

    // Haal enkel voor undo een vers assignment op; gewone toewijzing blijft volledig lokaal.
    const fresh = showUndo
      ? await assignmentService.getAssignmentForMatch(targetMatch.match_id)
      : null;
    if (fresh) {
      toast.success(`${refereeName} toegewezen`, {
        description: toastDescription,
        action: {
          label: 'Ongedaan maken',
          onClick: async () => {
            const ok = await assignmentService.removeMatchAssignment(fresh.match_id, user?.id || 0);
            if (ok) {
              toast.success('Toewijzing teruggedraaid');
              clearLocalSessionAssignment(session);
              bumpWorkloadCounts(refereeId, session, -1);
            } else {
              toast.error('Kon toewijzing niet ongedaan maken');
            }
          },
        },
        duration: 5000,
      });
    }
    return { ok: true, assignmentId: fresh?.id, anchorMatchId: targetMatch.match_id };
  };

  const handleAssign = async (session: Session, refereeId: number) => {
    if (getSessionAssignedReferee(session) !== null) {
      toast.error('Er is al een scheidsrechter toegewezen aan deze wedstrijd');
      return;
    }
    const targetMatch = session.matches.find((m) => !m.assigned_referee_id);
    if (!targetMatch) {
      toast.error('Deze wedstrijd is al toegewezen');
      return;
    }
    const refName = referees.find((r) => r.user_id === refereeId)?.username || 'Scheidsrechter';
    const cellKey = `${targetMatch.match_id}-${refereeId}`;
    setAssigning(cellKey);
    try {
      await assignToSessionInternal(session, refereeId, refName, true);
    } catch {
      toast.error('Onverwachte fout');
    } finally {
      setAssigning(null);
    }
  };

  /** Wijs toe; als er al iemand staat: die wordt beschikbaar, deze persoon krijgt de wedstrijd. */
  const handleAssignOrReassign = async (session: Session, refereeId: number): Promise<boolean> => {
    const previousRefereeId = getSessionAssignedReferee(session);
    if (previousRefereeId === refereeId) return true;

    const firstMatch = session.matches[0];
    if (!firstMatch) {
      toast.error('Geen wedstrijd gevonden');
      return false;
    }

    const refName = referees.find((r) => r.user_id === refereeId)?.username || 'Scheidsrechter';
    const cellKey = `${firstMatch.match_id}-${refereeId}`;
    setAssigning(cellKey);

    try {
      if (previousRefereeId != null) {
        const removed = await assignmentService.removeMatchAssignment(
          firstMatch.match_id,
          user?.id || 0,
        );
        if (!removed) {
          toast.error('Kon vorige toewijzing niet verwijderen');
          return false;
        }
        clearLocalSessionAssignment(session);
        bumpWorkloadCounts(previousRefereeId, session, -1);

        // Vorige scheids: terug naar beschikbaar (niet “geen reactie”)
        await handleSetAvailabilityStatus(session, previousRefereeId, true, {
          manageAssigning: false,
        });
      }

      const clearedSession: Session = {
        ...session,
        matches: session.matches.map((match) => ({
          ...match,
          assigned_referee_id: null,
        })),
      };

      const result = await assignToSessionInternal(clearedSession, refereeId, refName, true);
      return result.ok;
    } catch {
      toast.error('Onverwachte fout bij toewijzen');
      return false;
    } finally {
      setAssigning(null);
    }
  };

  const handleSetAvailabilityStatus = async (
    session: Session,
    refereeId: number,
    status: AdminAvailabilityStatus,
    options?: { manageAssigning?: boolean },
  ) => {
    const manageAssigning = options?.manageAssigning !== false;
    const firstMatch = session.matches[0];
    if (!firstMatch) {
      toast.error('Geen wedstrijd gevonden');
      return;
    }

    if (!user?.id) {
      toast.error('Geen admin gebruiker gevonden');
      return;
    }

    const cellKey = `${firstMatch.match_id}-${refereeId}`;
    const matchIds = new Set(session.matches.map((match) => match.match_id));
    const previousAvailability = availability;

    // Optimistic UI: meteen tonen, daarna server sync
    setAvailability((current) => {
      const withoutSession = current.filter(
        (item) =>
          !(
            item.user_id === refereeId &&
            (item.match_id != null
              ? matchIds.has(item.match_id)
              : session.matches.some(
                  (match) => item.poll_group_id === `${selectedMonth}_${match.match_id}`,
                ))
          ),
      );

      if (status === null) return withoutSession;

      return [
        ...withoutSession,
        ...session.matches.map((match) => ({
          user_id: refereeId,
          match_id: match.match_id,
          poll_group_id: `${selectedMonth}_${match.match_id}`,
          is_available: status === true,
        })),
      ];
    });

    if (manageAssigning) setAssigning(cellKey);
    try {
      const results = await Promise.all(
        session.matches.map((match) =>
          supabase.rpc('admin_set_referee_availability', {
            ...getRpcSessionArgs(),
            p_referee_id: refereeId,
            p_match_id: match.match_id,
            p_poll_group_id: `${selectedMonth}_${match.match_id}`,
            p_poll_month: selectedMonth,
            p_is_available: status === null ? null : status === true,
            p_notes: status === null
              ? null
              : `Door admin als ${status ? 'beschikbaar' : 'niet beschikbaar'} gemarkeerd`,
          })
        )
      );

      const failed = results.find((result) => result.error);
      if (failed) {
        console.error('Admin availability update failed:', failed.error);
        setAvailability(previousAvailability);
        const errorMessage = String(failed.error?.message || '');
        if (failed.error?.code === 'PGRST202' || errorMessage.includes('admin_set_referee_availability')) {
          toast.error('Database-migratie ontbreekt', {
            description: 'Pas eerst de admin_set_referee_availability migratie toe in Supabase.',
          });
        } else {
          toast.error('Kon beschikbaarheid niet opslaan', {
            description: errorMessage || 'Probeer opnieuw.',
          });
        }
      }
    } catch (error) {
      setAvailability(previousAvailability);
      toast.error('Onverwachte fout bij beschikbaar maken', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      if (manageAssigning) setAssigning(null);
    }
  };

  const handleRemove = async (assignment: AssignmentData): Promise<boolean> => {
    const session = sessions.find((item) =>
      item.matches.some((match) => match.match_id === assignment.match_id)
    );
    setAssigning(`${assignment.match_id}-${assignment.referee_id}`);
    try {
      const success = await assignmentService.removeMatchAssignment(assignment.match_id, user?.id || 0);
      if (success) {
        if (session) {
          clearLocalSessionAssignment(session);
          bumpWorkloadCounts(assignment.referee_id, session, -1);
        }
        return true;
      }
      toast.error('Kon toewijzing niet verwijderen');
      return false;
    } catch {
      toast.error('Onverwachte fout');
      return false;
    } finally {
      setAssigning(null);
    }
  };

  type CellStatusChoice = 'assigned' | 'available' | 'unavailable' | 'none';

  /** Zet één van de 4 celstatussen; Toegewezen hertoewijst (vorige → beschikbaar). */
  const applyRefereeCellChoice = async (
    session: Session,
    refereeId: number,
    choice: CellStatusChoice,
    context: {
      isAssigned: boolean;
      isOtherAssigned: boolean;
      assignment: AssignmentData | null;
    },
  ) => {
    if (choice === 'assigned') {
      if (context.isAssigned) return;
      await handleAssignOrReassign(session, refereeId);
      return;
    }

    if (context.isAssigned && context.assignment) {
      const removed = await handleRemove(context.assignment);
      if (!removed) return;
    }

    const status: AdminAvailabilityStatus =
      choice === 'available' ? true : choice === 'unavailable' ? false : null;
    await handleSetAvailabilityStatus(session, refereeId, status);
  };

  const renderRefereeCellMenuContent = (
    session: Session,
    refereeId: number,
    context: {
      available: boolean;
      isAssigned: boolean;
      isOtherAssigned: boolean;
      assignment: AssignmentData | null;
      hasResponded: boolean;
    },
  ) => {
    const keepOpenAndApply = (choice: CellStatusChoice) => (event: Event) => {
      // Blijf open tot buiten de menu of opnieuw op de cel wordt geklikt.
      event.preventDefault();
      void applyRefereeCellChoice(session, refereeId, choice, context);
    };

    return (
      <>
        <DropdownMenuItem
          disabled={context.isAssigned}
          onSelect={keepOpenAndApply('assigned')}
        >
          <Star className="mr-2 h-3.5 w-3.5 text-success" />
          Toegewezen
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={keepOpenAndApply('available')}>
          <Check className="mr-2 h-3.5 w-3.5 text-success" />
          Beschikbaar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={keepOpenAndApply('unavailable')}>
          <X className="mr-2 h-3.5 w-3.5 text-destructive/80" />
          Niet beschikbaar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={keepOpenAndApply('none')}>
          <Minus className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          Geen reactie
        </DropdownMenuItem>
      </>
    );
  };

  // Suggest: top kandidaat voor één sessie
  const getSuggestionForSession = useCallback(
    (session: Session): SuggestionCandidate | null => {
      if (getSessionAssignedReferee(session) !== null) return null;
      const list = suggestRefereesForSession({
        session: {
          sessionKey: session.key,
          matchIds: session.matches.map((m) => m.match_id),
          dateOnly: session.dateOnly,
        },
        referees,
        availability,
        assignments,
        pollMonth: selectedMonth,
        monthCounts,
        seasonCounts,
      });
      return list[0] || null;
    },
    [referees, availability, assignments, selectedMonth, monthCounts, seasonCounts, getSessionAssignedReferee],
  );

  const handleSuggestForSession = async (session: Session) => {
    const top = getSuggestionForSession(session);
    if (!top) {
      toast.error('Geen geschikte scheidsrechter gevonden', {
        description: 'Geen beschikbare ref of allemaal al ingezet',
      });
      return;
    }
    await handleAssign(session, top.user_id);
  };

  // Bulk: wijs alle nog-open sessies toe aan hun beste kandidaat,
  // met workload-spreiding (telling wordt incrementeel bijgewerkt).
  const handleBulkAutoAssign = async () => {
    setBulkAssigning(true);
    try {
      const openSessions = sessions.filter(
        (s) => getSessionAssignedReferee(s) === null,
      );
      if (openSessions.length === 0) {
        toast.info('Alle wedstrijden zijn al toegewezen');
        return;
      }

      // Lokale kopie van counts zodat spreiding ook intra-bulk geldt
      const localMonth = new Map(monthCounts);
      const localSeason = new Map(seasonCounts);
      const usedOnDate = new Map<string, Set<number>>(); // dateOnly -> refIds

      let assigned = 0;
      let skipped = 0;

      // Verzamel sessies voor één gegroepeerde undo
      const createdSessionMatchIds: number[] = [];
      const createdSessions: Session[] = [];

      for (const session of openSessions) {
        const list = suggestRefereesForSession({
          session: {
            sessionKey: session.key,
            matchIds: session.matches.map((m) => m.match_id),
            dateOnly: session.dateOnly,
          },
          referees,
          availability,
          assignments,
          pollMonth: selectedMonth,
          monthCounts: localMonth,
          seasonCounts: localSeason,
        });

        const dayUsed = usedOnDate.get(session.dateOnly) || new Set<number>();
        const top = list.find((c) => !dayUsed.has(c.user_id));
        if (!top) {
          skipped++;
          continue;
        }

        const refName = referees.find((r) => r.user_id === top.user_id)?.username || '';
        const result = await assignToSessionInternal(session, top.user_id, refName, false);
        if (result.ok) {
          assigned++;
          if (result.anchorMatchId) createdSessionMatchIds.push(result.anchorMatchId);
          createdSessions.push(session);
          localMonth.set(top.user_id, (localMonth.get(top.user_id) || 0) + 1);
          localSeason.set(top.user_id, (localSeason.get(top.user_id) || 0) + 1);
          dayUsed.add(top.user_id);
          usedOnDate.set(session.dateOnly, dayUsed);
        } else {
          skipped++;
        }
      }

      if (assigned > 0) {
        toast.success(`${assigned} toewijzing${assigned === 1 ? '' : 'en'} aangemaakt`, {
          description: skipped > 0 ? `${skipped} wedstrijd(en) overgeslagen — geen kandidaat` : undefined,
          duration: 10000,
          action:
            createdSessionMatchIds.length > 0
              ? {
                  label: 'Alles ongedaan',
                  onClick: async () => {
                    const results = await Promise.all(
                      createdSessionMatchIds.map((matchId) =>
                        assignmentService.removeMatchAssignment(matchId, user?.id || 0)
                      ),
                    );
                    const undone = results.filter(Boolean).length;
                    if (undone > 0) {
                      toast.success(`${undone} toewijzing${undone === 1 ? '' : 'en'} teruggedraaid`);
                      createdSessions.forEach(clearLocalSessionAssignment);
                    } else {
                      toast.error('Kon toewijzingen niet ongedaan maken');
                    }
                  },
                }
              : undefined,
        });
      } else {
        toast.warning('Geen wedstrijden konden automatisch toegewezen worden');
      }
    } catch (e) {
      console.error('Bulk assign error:', e);
      toast.error('Onverwachte fout bij auto-toewijzen');
    } finally {
      setBulkAssigning(false);
    }
  };

  const openSessionsCount = useMemo(
    () => sessions.filter((s) => getSessionAssignedReferee(s) === null).length,
    [sessions, getSessionAssignedReferee],
  );

  const totalSessions = sessions.length;
  const assignedSessions = sessions.filter(s => getSessionAssignedReferee(s) !== null).length;
  const sessionsByDay = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const matrixMinWidth = SESSION_COLUMN_WIDTH + referees.length * REFEREE_COLUMN_WIDTH;
  const refereeCopyMessages = useMemo<RefereeCopyMessage[]>(() => {
    return referees.map((referee) => {
      const assignedSessionsForReferee = sessions.filter(
        (session) => getSessionAssignedReferee(session) === referee.user_id
      );
      const lines = assignedSessionsForReferee.map((session) => formatSessionCopyLine(session));

      return {
        refereeId: referee.user_id,
        refereeName: referee.username,
        assignmentCount: lines.length,
        text: [
          `Beste ${referee.username}, je wedstrijden voor komende maand zijn:`,
          lines.length > 0 ? lines.join('\n') : 'Geen wedstrijden gevonden.',
        ].join('\n'),
      };
    });
  }, [referees, sessions, getSessionAssignedReferee]);

  const allSessionsCopyMessage = useMemo(() => {
    const sortedSessions = [...sessions].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      return formatSessionLocation(a.location).localeCompare(formatSessionLocation(b.location));
    });

    const lines = sortedSessions.map((session) => formatSessionCopyLine(session));

    const [year, monthNum] = selectedMonth.split('-').map(Number);
    const monthLabel = format(
      new Date(Date.UTC(year, (monthNum || 1) - 1, 1)),
      'MMMM yyyy',
      { locale: nl },
    );

    return {
      sessionCount: sortedSessions.length,
      text: [
        'Beste scheidsrechters, gelieve door te geven wanneer je beschikbaar bent.',
        '',
        `Overzicht speeldata voor ${monthLabel}:`,
        lines.length > 0 ? lines.join('\n') : 'Geen wedstrijden gevonden.',
      ].join('\n'),
    };
  }, [sessions, selectedMonth]);

  const autoAssignButton = sessions.length > 0 ? (
    <Button
      size="sm"
      onClick={handleBulkAutoAssign}
      disabled={bulkAssigning || openSessionsCount === 0 || referees.length === 0}
      className="btn btn--primary btn--sm min-h-[44px] h-11 w-full min-w-0 gap-1.5 !rounded-md px-3 shadow-sm sm:w-auto"
      title={openSessionsCount === 0 ? 'Alle wedstrijden zijn al toegewezen' : 'Wijs open wedstrijden automatisch toe'}
    >
      {bulkAssigning ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Wand2 className="h-3.5 w-3.5" />
      )}
      Auto-toewijzen
    </Button>
  ) : null;

  const toolbarPortal = toolbarContainer && autoAssignButton
    ? createPortal(autoAssignButton, toolbarContainer)
    : null;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Tekst gekopieerd');
    } catch {
      toast.error('Kopiëren mislukt');
    }
  };

  const markMessageEmailed = (key: string) => {
    setEmailedMessageKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const sendCopyMessageEmail = async (input: {
    key: string;
    title: string;
    message: string;
    targetUserIds: number[];
  }) => {
    if (input.targetUserIds.length === 0) {
      toast.error('Geen ontvangers gevonden');
      return;
    }
    if (!input.message.trim()) {
      toast.error('Bericht is leeg');
      return;
    }

    setEmailSendingKey(input.key);
    try {
      const result = await notificationService.sendAdminMessageEmails({
        title: input.title,
        message: input.message,
        target_user_ids: input.targetUserIds,
      });

      if (result.queued > 0) {
        markMessageEmailed(input.key);
        toast.success(
          result.queued === 1
            ? 'E-mail verzonden'
            : `${result.queued} e-mails verzonden`,
        );
        return;
      }

      if (result.totalRecipients === 0) {
        toast.error('Geen e-mailadres gevonden voor deze scheidsrechter(s)');
        return;
      }

      if (result.suppressed > 0 && result.queued === 0) {
        toast.error('E-mail geblokkeerd (onderdrukte adressen)');
        return;
      }

      toast.error('Kon e-mail niet verzenden');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kon e-mail niet verzenden');
    } finally {
      setEmailSendingKey(null);
    }
  };

  const monthEmailLabel = useMemo(() => {
    const [year, monthNum] = selectedMonth.split('-').map(Number);
    return format(
      new Date(Date.UTC(year, (monthNum || 1) - 1, 1)),
      'MMMM yyyy',
      { locale: nl },
    );
  }, [selectedMonth]);


  if (loading) {
    return (
      <div className="space-y-4">
        {!hideHeader && (
          <div className="flex gap-2 items-center">
            <Skeleton className="h-10 w-[160px]" />
            <Skeleton className="h-10 w-10" />
          </div>
        )}
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbarPortal}

      {hideHeader && sessions.length > 0 && referees.length > 0 && (
        <div className="flex flex-col gap-3 lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="min-h-[36px] px-3 text-xs sm:text-sm">
              {assignedSessions}/{totalSessions} wedstrijden toegewezen
            </Badge>
            <Button
              type="button"
              variant="unstyled"
              className="btn btn--icon shrink-0"
              onClick={() => void fetchData()}
              disabled={loading}
              aria-label="Gegevens vernieuwen"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </Button>
          </div>
          <MatrixStatusLegend />
        </div>
      )}

      {!hideHeader && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMonthOptions().map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="unstyled"
              className="btn btn--icon"
              onClick={fetchData}
              disabled={loading}
              aria-label="Gegevens vernieuwen"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </Button>
            {!toolbarContainer && autoAssignButton}
          </div>
          <Badge variant="outline">{assignedSessions}/{totalSessions} wedstrijden toegewezen</Badge>
        </div>
      )}

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Geen wedstrijden gevonden voor deze maand</p>
          </CardContent>
        </Card>
      ) : referees.length === 0 ? (
        <Card className="border border-destructive/30 bg-destructive/5">
          <CardContent className="p-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Geen scheidsrechters gevonden</h3>
              <p className="text-sm text-muted-foreground">
                Er zijn wedstrijden voor deze maand, maar er zijn geen gebruikers met de rol scheidsrechter gevonden.
                Voeg eerst scheidsrechters toe voor je deze matrix kan gebruiken.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {showDesktopMatrix ? (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table
                className="w-full table-fixed text-sm border-collapse"
                style={{ minWidth: `${matrixMinWidth}px` }}
              >
                <colgroup>
                  <col style={{ width: SESSION_COLUMN_WIDTH }} />
                  {referees.map(ref => (
                    <col key={ref.user_id} style={{ width: REFEREE_COLUMN_WIDTH }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card">
                    <th
                      aria-label="Sessie"
                      className="sticky left-0 z-30 bg-card text-left px-2 py-2 font-semibold border-r border-b-2 border-[hsl(var(--color-200))] text-foreground align-middle shadow-[0_1px_0_hsl(var(--color-200))]"
                      style={{
                        width: SESSION_COLUMN_WIDTH,
                        minWidth: SESSION_COLUMN_WIDTH,
                      }}
                    >
                      <MatrixStatusLegend variant="embedded" />
                    </th>
                    {referees.map(ref => (
                      <th
                        key={ref.user_id}
                        className="h-36 border-r border-b-2 border-[hsl(var(--color-200))] bg-card px-1 py-2 align-bottom font-semibold text-foreground shadow-[0_1px_0_hsl(var(--color-200))] last:border-r-0"
                        style={{
                          width: REFEREE_COLUMN_WIDTH,
                          minWidth: REFEREE_COLUMN_WIDTH,
                        }}
                      >
                        <div
                          className="text-xs leading-tight whitespace-nowrap mx-auto"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          title={ref.username}
                        >
                          {ref.username}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessionsByDay.map((day) => (
                    <Fragment key={day.dateOnly}>
                      <tr className="bg-muted">
                        <th
                          scope="rowgroup"
                          className="sticky left-0 z-10 border-r border-t-2 border-[hsl(var(--color-200))] bg-muted px-2 py-1.5 text-left align-middle font-semibold"
                          style={{
                            width: SESSION_COLUMN_WIDTH,
                            minWidth: SESSION_COLUMN_WIDTH,
                            height: DAY_HEADER_HEIGHT,
                          }}
                        >
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 text-xs text-foreground">
                              {formatDateWithDay(day.date)}
                            </span>
                            {day.sharedLocation ? (
                              <span className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
                                {day.sharedLocation}
                              </span>
                            ) : null}
                          </div>
                        </th>
                        {referees.map((ref) => (
                          <td
                            key={ref.user_id}
                            aria-hidden
                            className="border-t-2 border-r border-[hsl(var(--color-200))] bg-muted last:border-r-0"
                            style={{
                              width: REFEREE_COLUMN_WIDTH,
                              minWidth: REFEREE_COLUMN_WIDTH,
                              height: DAY_HEADER_HEIGHT,
                            }}
                          />
                        ))}
                      </tr>
                      {day.sessions.map((session, sessionIdx) => {
                    const assignedRefId = getSessionAssignedReferee(session);
                    const rowBg = sessionIdx % 2 === 0 ? 'bg-card' : 'bg-muted/20';
                    return (
                      <tr
                        key={session.key}
                        className={`group ${rowBg} hover:bg-muted transition-colors`}
                        style={{ height: SESSION_ROW_HEIGHT }}
                      >
                        <td
                          className={`sticky left-0 z-10 ${rowBg} group-hover:bg-muted border-r border-t border-border p-0 align-middle`}
                          style={{
                            width: SESSION_COLUMN_WIDTH,
                            minWidth: SESSION_COLUMN_WIDTH,
                            height: SESSION_ROW_HEIGHT,
                          }}
                        >
                          <div className="flex h-full min-w-0 items-center gap-2 px-2 text-left">
                            <span className="w-11 shrink-0 tabular-nums text-xs font-semibold text-foreground">
                              {formatTimeForDisplay(session.date)}
                            </span>
                            {!day.sharedLocation ? (
                              <span className="max-w-[5.5rem] shrink-0 truncate text-[10px] text-muted-foreground">
                                {formatSessionLocation(session.location)}
                              </span>
                            ) : null}
                            <span
                              className="min-w-0 truncate text-xs font-medium text-foreground"
                              title={formatSessionMatchPairing(session)}
                            >
                              {formatSessionMatchPairing(session)}
                            </span>
                          </div>
                        </td>
                        {referees.map(ref => {
                          const available = isRefereeAvailable(session, ref.user_id);
                          const hasResponded = hasRefereeResponded(session, ref.user_id);
                          const assignment = getSessionAssignment(session, ref.user_id);
                          const isAssigned = !!assignment;
                          const isOtherAssigned = assignedRefId !== null && assignedRefId !== ref.user_id;
                          const cellKey = `${session.matches[0]?.match_id}-${ref.user_id}`;
                          const isLoading = assigning === cellKey;

                          // Default: "Geen reactie" — admin zet eerst beschikbaarheid, daarna pas toewijzen.
                          let cellClass = 'bg-card hover:bg-primary/10 cursor-pointer';
                          let cellContent: React.ReactNode = (
                            <Minus className="h-3.5 w-3.5 mx-auto text-muted-foreground/60" />
                          );
                          let tooltipText = `${ref.username} – Geen reactie · Klik om status te kiezen`;
                          let clickable = true;

                          if (isAssigned) {
                            cellClass = 'bg-success hover:bg-success/90 cursor-pointer ring-2 ring-success/30 ring-inset';
                            cellContent = <Star className="h-4 w-4 mx-auto text-white fill-white" />;
                            tooltipText = (() => {
                              const assignerName = assignment?.assigned_by ? usersById.get(assignment.assigned_by) : null;
                              const whenStr = assignment?.assigned_at
                                ? format(new Date(assignment.assigned_at), 'd MMM HH:mm', { locale: nl })
                                : null;
                              const parts: string[] = [];
                              if (assignerName) parts.push(`door ${assignerName}`);
                              if (whenStr) parts.push(`op ${whenStr}`);
                              const suffix = parts.length ? ` · ${parts.join(' ')}` : '';
                              return `${ref.username} – Toegewezen${suffix} · Klik om status te kiezen`;
                            })();
                            clickable = true;
                          } else if (isOtherAssigned) {
                            // Andere scheids toegewezen: cel blijft klikbaar; Toegewezen hertoewijst.
                            cellClass = available
                              ? 'bg-success/10 hover:bg-success/20 cursor-pointer opacity-80'
                              : hasResponded
                                ? 'bg-destructive/5 hover:bg-destructive/15 cursor-pointer opacity-80'
                                : 'bg-muted/30 hover:bg-primary/10 cursor-pointer opacity-80';
                            cellContent = available ? (
                              <Check className="h-3.5 w-3.5 mx-auto text-success/80" />
                            ) : hasResponded ? (
                              <X className="h-3.5 w-3.5 mx-auto text-destructive/70" />
                            ) : (
                              <Minus className="h-3.5 w-3.5 mx-auto text-muted-foreground/60" />
                            );
                            tooltipText = `${ref.username} – Andere scheids al toegewezen · Klik om te hertoewijzen of status te zetten`;
                            clickable = true;
                          } else if (available) {
                            cellClass = 'bg-success/15 hover:bg-success/30 cursor-pointer';
                            cellContent = <Check className="h-4 w-4 mx-auto text-success" />;
                            tooltipText = `${ref.username} – Beschikbaar · Klik om status te kiezen`;
                            clickable = true;
                          } else if (hasResponded) {
                            // Ref is expliciet niet-beschikbaar — admin kan hem eerst beschikbaar zetten.
                            cellClass = 'bg-destructive/5 hover:bg-destructive/15 cursor-pointer';
                            cellContent = <X className="h-3.5 w-3.5 mx-auto text-destructive/70" />;
                            tooltipText = `${ref.username} – Niet beschikbaar · Klik om status te kiezen`;
                            clickable = true;
                          }

                          if (isLoading) {
                            cellContent = <RefreshCw className="h-4 w-4 mx-auto animate-spin text-foreground" />;
                          }

                          const cellContext = {
                            isAssigned,
                            isOtherAssigned,
                            available,
                            hasResponded,
                            assignment,
                          };

                          return (
                            <td
                              key={ref.user_id}
                              className="border-r border-t border-border p-0 align-middle last:border-r-0"
                              style={{
                                width: REFEREE_COLUMN_WIDTH,
                                minWidth: REFEREE_COLUMN_WIDTH,
                                height: SESSION_ROW_HEIGHT,
                              }}
                            >
                              <DropdownMenu
                                open={menuCellKey === cellKey}
                                onOpenChange={(open) => {
                                  if (open) openCellMenu(cellKey);
                                  else closeCellMenu();
                                }}
                              >
                                <DropdownMenuTrigger
                                  asChild
                                  disabled={!clickable || (isLoading && menuCellKey !== cellKey)}
                                >
                                  <button
                                    type="button"
                                    title={tooltipText}
                                    aria-pressed={clickable ? isAssigned : undefined}
                                    aria-label={tooltipText}
                                    aria-haspopup="menu"
                                    className={`flex h-full w-full items-center justify-center transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed ${cellClass}`}
                                    style={{ height: SESSION_ROW_HEIGHT }}
                                  >
                                    {cellContent}
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  side="bottom"
                                  align="center"
                                  sideOffset={4}
                                  collisionPadding={12}
                                  onCloseAutoFocus={(event) => event.preventDefault()}
                                  className="z-[80] w-48 border border-[hsl(var(--color-200))] shadow-sm"
                                >
                                  {renderRefereeCellMenuContent(session, ref.user_id, cellContext)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          ) : (
          <div className="space-y-5">
            {sessionsByDay.map((day) => (
              <section key={day.dateOnly} className="space-y-2" aria-label={formatDateWithDay(day.date)}>
                <h3 className="flex min-h-[32px] items-baseline gap-2 px-0.5 text-sm font-semibold">
                  <span>{formatDateWithDay(day.date)}</span>
                  {day.sharedLocation ? (
                    <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                      {day.sharedLocation}
                    </span>
                  ) : null}
                </h3>
                <div className="space-y-2">
            {day.sessions.map((session) => {
              const assignedRefId = getSessionAssignedReferee(session);
              const assignedRef = assignedRefId
                ? referees.find((ref) => ref.user_id === assignedRefId)
                : undefined;
              const sortedRefs = sortRefereesForSession(
                referees,
                session,
                assignedRefId,
                isRefereeAvailable,
                hasRefereeResponded,
              );

              return (
                <Card key={session.key} className="border-border/80 shadow-sm">
                  <CardContent className="space-y-3 p-3 sm:p-4">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 tabular-nums text-sm font-semibold">
                        {formatTimeForDisplay(session.date)}
                      </span>
                      {!day.sharedLocation ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatSessionLocation(session.location)}
                        </span>
                      ) : null}
                      <p className="min-w-0 truncate text-sm font-medium leading-snug">
                        {formatSessionMatchPairing(session)}
                      </p>
                    </div>

                    {assignedRef ? (
                      <div className="flex min-h-[44px] items-center gap-2 rounded-lg border border-success/40 bg-success/15 px-3 py-2">
                        <Star className="h-4 w-4 shrink-0 fill-success text-success" aria-hidden />
                        <span className="min-w-0 truncate text-sm font-medium">{assignedRef.username}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">Toegewezen</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        Nog geen scheidsrechter toegewezen
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sortedRefs.map((ref) => {
                        const available = isRefereeAvailable(session, ref.user_id);
                        const hasResponded = hasRefereeResponded(session, ref.user_id);
                        const assignment = getSessionAssignment(session, ref.user_id);
                        const isAssigned = !!assignment;
                        const isOtherAssigned = assignedRefId !== null && assignedRefId !== ref.user_id;
                        const cellKey = `${session.matches[0]?.match_id}-${ref.user_id}`;
                        const isLoadingCell = assigning === cellKey;

                        // Pill-stijl op basis van status
                        let pillClass = 'bg-card border border-border/60 text-muted-foreground'; // geen reactie
                        if (isAssigned) pillClass = 'pill-success-strong shadow-sm';
                        else if (available) pillClass = 'bg-success/15 border border-success/40 text-foreground';
                        else if (hasResponded) pillClass = 'bg-destructive/5 border border-destructive/30 text-foreground';

                        const statusLabel = isAssigned
                          ? 'toegewezen'
                          : !hasResponded
                            ? 'geen reactie'
                            : available
                              ? 'beschikbaar'
                              : 'niet beschikbaar';

                        const mobileCellContext = {
                          available,
                          isAssigned,
                          isOtherAssigned,
                          assignment,
                          hasResponded,
                        };

                        return (
                          <DropdownMenu
                            key={ref.user_id}
                            open={menuCellKey === cellKey}
                            onOpenChange={(open) => {
                              if (open) openCellMenu(cellKey);
                              else closeCellMenu();
                            }}
                          >
                            <DropdownMenuTrigger
                              asChild
                              disabled={isLoadingCell && menuCellKey !== cellKey}
                            >
                              <button
                                type="button"
                                title={`${ref.username} – ${statusLabel}`}
                                aria-label={`${ref.username} – ${statusLabel}`}
                                aria-haspopup="menu"
                                className={`
                                  inline-flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium
                                  transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
                                  ${pillClass}
                                  ${isOtherAssigned && !isAssigned ? 'opacity-70' : ''}
                                  disabled:cursor-not-allowed
                                `}
                              >
                                {isLoadingCell ? (
                                  <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                                ) : isAssigned ? (
                                  <Star className="h-4 w-4 shrink-0 fill-white" />
                                ) : !hasResponded ? (
                                  <Minus className="h-4 w-4 shrink-0 opacity-60" />
                                ) : !available ? (
                                  <X className="h-4 w-4 shrink-0 opacity-60" />
                                ) : (
                                  <Check className="h-4 w-4 shrink-0 text-success" />
                                )}
                                <span className="truncate">{ref.username}</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              side="bottom"
                              align="start"
                              sideOffset={4}
                              collisionPadding={12}
                              onCloseAutoFocus={(event) => event.preventDefault()}
                              className="z-[80] w-48 border border-[hsl(var(--color-200))] shadow-sm"
                            >
                              {renderRefereeCellMenuContent(session, ref.user_id, mobileCellContext)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
                </div>
              </section>
            ))}
          </div>
          )}

          <SectionCollapsibleCard
            title={
              <span className="flex flex-col gap-0.5 min-w-0 text-left">
                <span>Copy/paste &amp; mail berichten</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Kopieer of mail de tekst per scheidsrechter. Een vinkje toont dat de mail verzonden is.
                </span>
              </span>
            }
            open={copyMessagesOpen}
            onOpenChange={setCopyMessagesOpen}
            contentClassName="space-y-3"
          >
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        Overzicht alle te spelen wedstrijden
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {allSessionsCopyMessage.sessionCount} wedstrijdblok
                        {allSessionsCopyMessage.sessionCount === 1 ? '' : 'ken'} · vraag beschikbaarheid op
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {emailedMessageKeys.has('all') ? (
                        <span
                          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 text-xs font-medium text-success"
                          aria-label="E-mail verzonden"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Verzonden
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 min-h-8 gap-1.5 px-2"
                        onClick={() => copyText(allSessionsCopyMessage.text)}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Kopieer
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 min-h-8 gap-1.5 px-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                        disabled={
                          emailSendingKey === 'all' ||
                          referees.length === 0 ||
                          allSessionsCopyMessage.sessionCount === 0
                        }
                        onClick={() =>
                          void sendCopyMessageEmail({
                            key: 'all',
                            title: `Beschikbaarheid opvragen – ${monthEmailLabel}`,
                            message: allSessionsCopyMessage.text,
                            targetUserIds: referees.map((ref) => ref.user_id),
                          })
                        }
                      >
                        {emailSendingKey === 'all' ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Mail className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {emailSendingKey === 'all' ? 'Versturen…' : 'Mail'}
                      </Button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={allSessionsCopyMessage.text}
                    className="min-h-[140px] w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>
                {refereeCopyMessages.map((message) => {
                  const messageKey = `referee-${message.refereeId}`;
                  const wasEmailed = emailedMessageKeys.has(messageKey);
                  const isSending = emailSendingKey === messageKey;

                  return (
                    <div key={message.refereeId} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{message.refereeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {message.assignmentCount} wedstrijdblok{message.assignmentCount === 1 ? '' : 'ken'}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {wasEmailed ? (
                            <span
                              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 text-xs font-medium text-success"
                              aria-label={`E-mail verzonden naar ${message.refereeName}`}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Verzonden
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 min-h-8 gap-1.5 px-2"
                            onClick={() => copyText(message.text)}
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                            Kopieer
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 min-h-8 gap-1.5 px-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                            disabled={isSending}
                            onClick={() =>
                              void sendCopyMessageEmail({
                                key: messageKey,
                                title: `Wedstrijden scheidsrechter – ${monthEmailLabel}`,
                                message: message.text,
                                targetUserIds: [message.refereeId],
                              })
                            }
                          >
                            {isSending ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Mail className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {isSending ? 'Versturen…' : 'Mail'}
                          </Button>
                        </div>
                      </div>
                      <textarea
                        readOnly
                        value={message.text}
                        className="min-h-[96px] w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </div>
                  );
                })}
          </SectionCollapsibleCard>
        </>
      )}
    </div>
  );
};

export default AvailabilityMatrix;
