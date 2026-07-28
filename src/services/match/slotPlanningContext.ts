import { seasonService } from '@/services/seasonService';
import {
  filterActiveSlotUnavailability,
  getAvailableSlotIndicesForWeek,
  getBlockedSlotIndicesForWeek,
  getEffectiveWeeklyMatchCapacity,
  type SlotDetailRow,
} from '@/services/slotUnavailabilityService';
import type { SlotUnavailability } from '@/types/slotUnavailability';
import type { VenueTimeslotWithPriority } from '@/services/priorityOrderService';
import type { VacationLike } from '@/lib/competitionPlanningEstimate';

export interface SlotPlanningContext {
  blocks: SlotUnavailability[];
  vacations: VacationLike[];
  slotDetails: SlotDetailRow[];
  totalSlots: number;
  getWeekCapacity: (weekMonday: string, configuredMax?: number) => number;
  getAvailableSlotIndices: (weekMonday: string) => number[];
  getBlockedSlotIndices: (weekMonday: string) => Set<number>;
  /** Volgend priority-slot na reeds gebruikte slots (sla geblokkeerde over). */
  getSlotIndexForUsage: (weekMonday: string, slotsUsed: number) => number | null;
}

function normalizeVenueName(name: string): string {
  return name
    .replace(/^Sporthal\s+/i, '')
    .replace('De Dageraad Harelbeke', 'De Dageraad')
    .replace('De Vlasschaard Bavikhove', 'De Vlasschaard')
    .trim();
}

function buildSlotDetailsFromSeasonData(seasonData: {
  venues?: Array<{ venue_id: number; name: string }>;
  venue_timeslots?: Array<Record<string, unknown>>;
}): SlotDetailRow[] {
  const venues = seasonData.venues ?? [];
  const allTimeslots = [...(seasonData.venue_timeslots ?? [])]
    .map((slot) => {
      const venue = venues.find((v) => v.venue_id === slot.venue_id);
      const venueName = String(slot.venue_name ?? venue?.name ?? 'Onbekend');
      return {
        ...slot,
        venue_name: venueName,
        priority: typeof slot.priority === 'number' ? slot.priority : 999,
      } as VenueTimeslotWithPriority;
    })
    .sort((a, b) => a.priority - b.priority);

  return allTimeslots.map((ts) => ({
    venue: normalizeVenueName(ts.venue_name),
    timeslot: ts,
  }));
}

export async function loadSlotPlanningContext(
  organizationId?: number,
): Promise<SlotPlanningContext> {
  const seasonData = await seasonService.getSeasonData(organizationId);
  const blocks = filterActiveSlotUnavailability(seasonData.slot_unavailability);
  const vacations: VacationLike[] = seasonData.vacation_periods ?? [];
  const { normalizeSeasonSetup } = await import("@/lib/seasonSetup");
  const playableVacationWeeks =
    normalizeSeasonSetup(seasonData.season_setup).playableVacationWeeks ?? [];
  const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
  const totalSlots = Math.max(slotDetails.length, 1);

  return {
    blocks,
    vacations,
    slotDetails,
    totalSlots,
    getWeekCapacity: (weekMonday, configuredMax = totalSlots) =>
      getEffectiveWeeklyMatchCapacity(
        weekMonday,
        totalSlots,
        slotDetails,
        blocks,
        configuredMax,
        vacations,
        playableVacationWeeks,
      ),
    getAvailableSlotIndices: (weekMonday) =>
      getAvailableSlotIndicesForWeek(
        weekMonday,
        totalSlots,
        slotDetails,
        blocks,
        vacations,
        playableVacationWeeks,
      ),
    getBlockedSlotIndices: (weekMonday) =>
      getBlockedSlotIndicesForWeek(
        weekMonday,
        slotDetails,
        blocks,
        vacations,
        playableVacationWeeks,
      ),
    getSlotIndexForUsage: (weekMonday, slotsUsed) => {
      const available = getAvailableSlotIndicesForWeek(
        weekMonday,
        totalSlots,
        slotDetails,
        blocks,
        vacations,
        playableVacationWeeks,
      );
      if (slotsUsed >= available.length) return null;
      return available[slotsUsed];
    },
  };
}
