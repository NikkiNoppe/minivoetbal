import { useState, useEffect, useCallback } from 'react';
import { getStoredAuthData } from '@/lib/authSession';
import {
  assignmentService,
  refereeAvailabilityService,
  monthScheduleService,
  buildMyAvailabilityMap,
  buildMatchPollGroupId,
  matchAvailabilityKey,
} from '@/services/scheidsrechter';
import { fetchRefereeAvailabilityForSession } from '@/services/scheidsrechter/scheidsSessionFetch';
import type {
  RefereeAssignment,
  AvailabilityInput,
} from '@/services/scheidsrechter/types';
import type { ScheduleCluster } from '@/services/scheidsrechter/monthScheduleService';
import { toast } from 'sonner';

export interface RefereeDashboardData {
  clusters: ScheduleCluster[];
  myAvailability: Map<string, boolean>;
  assignments: RefereeAssignment[];
  isLoadingSchedule: boolean;
  isLoadingAssignments: boolean;
  isSubmitting: boolean;
  userId: number;
  username: string;
  submitAvailability: (
    matchId: number,
    pollMonth: string,
    isAvailable: boolean | null,
  ) => Promise<void>;
  submitBulkAvailability: (pollMonth: string, availabilities: AvailabilityInput[]) => Promise<boolean>;
  submitBulkAvailabilityByMonth: (
    byMonth: Record<string, AvailabilityInput[]>,
  ) => Promise<boolean>;
  refreshData: () => Promise<void>;
}

export function useRefereeDashboard(): RefereeDashboardData {
  const auth = getStoredAuthData();
  const userId = auth?.user?.id ?? 0;
  const username = auth?.user?.username || 'Scheidsrechter';

  const [clusters, setClusters] = useState<ScheduleCluster[]>([]);
  const [myAvailability, setMyAvailability] = useState<Map<string, boolean>>(new Map());
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);

  const [assignments, setAssignments] = useState<RefereeAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchScheduleData = useCallback(async (opts?: { showLoading?: boolean }) => {
    if (!userId) return;
    const showLoading = opts?.showLoading !== false;
    if (showLoading) setIsLoadingSchedule(true);
    try {
      const upcoming = await monthScheduleService.getUpcomingClusters();
      const months = Array.from(new Set(upcoming.map((c) => c.poll_month)));
      const availabilityResults = await Promise.all(
        months.map((m) => fetchRefereeAvailabilityForSession(m)),
      );
      const availMap = buildMyAvailabilityMap(
        upcoming,
        availabilityResults.flat(),
        userId,
      );
      setClusters(upcoming);
      setMyAvailability(availMap);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      toast.error('Kon speelschema niet ophalen');
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [userId]);

  const fetchAssignments = useCallback(async () => {
    if (!userId) return;
    setIsLoadingAssignments(true);
    try {
      const data = await assignmentService.getAssignmentsForReferee(userId);
      const sorted = data.sort((a, b) => {
        const dateA = new Date(a.match_date || '').getTime();
        const dateB = new Date(b.match_date || '').getTime();
        return dateA - dateB;
      });
      setAssignments(sorted);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Kon toewijzingen niet ophalen');
    } finally {
      setIsLoadingAssignments(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchScheduleData();
    fetchAssignments();
  }, [fetchScheduleData, fetchAssignments]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAssignments();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAssignments]);

  const submitAvailability = useCallback(
    async (matchId: number, pollMonth: string, isAvailable: boolean | null) => {
      if (!userId) return;

      const matchKey = matchAvailabilityKey(matchId);
      const pollGroupId = buildMatchPollGroupId(pollMonth, matchId);

      setMyAvailability((prev) => {
        const next = new Map(prev);
        if (isAvailable === null) {
          next.delete(matchKey);
          next.delete(pollGroupId);
        } else {
          next.set(matchKey, isAvailable);
          next.set(pollGroupId, isAvailable);
        }
        return next;
      });

      try {
        const success = await refereeAvailabilityService.updateAvailability(
          userId,
          matchId,
          pollGroupId,
          pollMonth,
          isAvailable,
        );
        if (!success) {
          setMyAvailability((prev) => {
            const next = new Map(prev);
            next.delete(matchKey);
            next.delete(pollGroupId);
            return next;
          });
          toast.error('Kon beschikbaarheid niet opslaan');
        }
      } catch (error) {
        console.error('Error updating availability:', error);
        toast.error('Kon beschikbaarheid niet opslaan');
      }
    },
    [userId],
  );

  const submitBulkAvailability = useCallback(
    async (pollMonth: string, availabilities: AvailabilityInput[]): Promise<boolean> => {
      if (!userId) return false;
      setIsSubmitting(true);
      try {
        const result = await refereeAvailabilityService.submitAvailability(
          userId,
          pollMonth,
          availabilities,
        );
        if (result.success) {
          toast.success('Beschikbaarheid opgeslagen!');
          await fetchScheduleData({ showLoading: false });
          return true;
        }
        toast.error(result.error || 'Kon beschikbaarheid niet opslaan');
        return false;
      } catch (error) {
        console.error('Error submitting availability:', error);
        toast.error('Kon beschikbaarheid niet opslaan');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userId, fetchScheduleData],
  );

  const submitBulkAvailabilityByMonth = useCallback(
    async (byMonth: Record<string, AvailabilityInput[]>): Promise<boolean> => {
      if (!userId) return false;
      const entries = Object.entries(byMonth).filter(([, items]) => items.length > 0);
      if (entries.length === 0) return true;

      setMyAvailability((prev) => {
        const next = new Map(prev);
        for (const [, items] of entries) {
          for (const item of items) {
            if (item.match_id != null) {
              next.set(matchAvailabilityKey(item.match_id), item.is_available);
              if (item.poll_group_id) next.set(item.poll_group_id, item.is_available);
            } else if (item.poll_group_id) {
              next.set(item.poll_group_id, item.is_available);
            }
          }
        }
        return next;
      });

      setIsSubmitting(true);
      try {
        for (const [pollMonth, availabilities] of entries) {
          const result = await refereeAvailabilityService.submitAvailability(
            userId,
            pollMonth,
            availabilities,
          );
          if (!result.success) {
            toast.error(result.error || 'Kon beschikbaarheid niet opslaan');
            await fetchScheduleData({ showLoading: false });
            return false;
          }
        }
        toast.success('Beschikbaarheid opgeslagen!');
        await fetchScheduleData({ showLoading: false });
        return true;
      } catch (error) {
        console.error('Error submitting availability:', error);
        toast.error('Kon beschikbaarheid niet opslaan');
        await fetchScheduleData({ showLoading: false });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userId, fetchScheduleData],
  );

  const refreshData = useCallback(async () => {
    await Promise.all([
      fetchScheduleData({ showLoading: false }),
      fetchAssignments(),
    ]);
  }, [fetchScheduleData, fetchAssignments]);

  return {
    clusters,
    myAvailability,
    assignments,
    isLoadingSchedule,
    isLoadingAssignments,
    isSubmitting,
    userId,
    username,
    submitAvailability,
    submitBulkAvailability,
    submitBulkAvailabilityByMonth,
    refreshData,
  };
}
