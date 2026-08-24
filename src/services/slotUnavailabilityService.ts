import {
  applyStandbySlotBlocks,
  isTimeslotValidOnDate,
} from '@/lib/timeslotAvailability';
import { matchDateFromWeekMonday } from '@/lib/cupBracketPlan';
import {
  isDateInVacationPeriod,
  type VacationLike,
} from '@/lib/competitionPlanningEstimate';
import type { SlotUnavailability } from '@/types/slotUnavailability';
import type { VenueTimeslotWithPriority } from '@/services/priorityOrderService';

export type SlotDetailRow = {
  venue: string;
  timeslot: VenueTimeslotWithPriority | null;
};

/** Kalenderdatum voor een priority-slot binnen een speelweek (maandag = weekstart). */
export function getCalendarDateForSlot(weekMonday: string, dayOfWeek: number): string {
  return matchDateFromWeekMonday(weekMonday, dayOfWeek);
}

export function isSlotUnavailabilityActive(
  blocks: SlotUnavailability[],
  date: string,
  venueId: number,
  timeslotId: number,
): boolean {
  const normalized = date.split('T')[0];
  return blocks.some(
    (b) =>
      b.is_active &&
      b.date.split('T')[0] === normalized &&
      b.venue_id === venueId &&
      b.timeslot_id === timeslotId,
  );
}

export function getBlockedSlotIndicesForWeek(
  weekMonday: string,
  slotDetails: SlotDetailRow[],
  blocks: SlotUnavailability[],
  vacations: VacationLike[] = [],
  playableVacationWeeks: string[] = [],
): Set<number> {
  const exceptions = new Set(
    playableVacationWeeks.map((d) => String(d).split("T")[0].slice(0, 10)),
  );
  const ignoreVacation = exceptions.has(weekMonday.slice(0, 10));
  const blocked = new Set<number>();
  slotDetails.forEach((row, index) => {
    const ts = row.timeslot;
    if (!ts) {
      blocked.add(index);
      return;
    }
    const matchDate = getCalendarDateForSlot(weekMonday, ts.day_of_week);
    if (!isTimeslotValidOnDate(ts, matchDate)) {
      blocked.add(index);
      return;
    }
    if (!ignoreVacation && isDateInVacationPeriod(matchDate, vacations)) {
      blocked.add(index);
      return;
    }
    if (isSlotUnavailabilityActive(blocks, matchDate, ts.venue_id, ts.timeslot_id)) {
      blocked.add(index);
    }
  });
  return applyStandbySlotBlocks(slotDetails, blocked);
}

export function getAvailableSlotIndicesForWeek(
  weekMonday: string,
  totalSlots: number,
  slotDetails: SlotDetailRow[],
  blocks: SlotUnavailability[],
  vacations: VacationLike[] = [],
  playableVacationWeeks: string[] = [],
): number[] {
  const blocked = getBlockedSlotIndicesForWeek(
    weekMonday,
    slotDetails,
    blocks,
    vacations,
    playableVacationWeeks,
  );
  return Array.from({ length: totalSlots }, (_, i) => i).filter((i) => !blocked.has(i));
}

/** Max. wedstrijden in een week na aftrek van geblokkeerde slots. */
export function getEffectiveWeeklyMatchCapacity(
  weekMonday: string,
  totalSlots: number,
  slotDetails: SlotDetailRow[],
  blocks: SlotUnavailability[],
  configuredMax: number,
  vacations: VacationLike[] = [],
  playableVacationWeeks: string[] = [],
): number {
  const available = getAvailableSlotIndicesForWeek(
    weekMonday,
    totalSlots,
    slotDetails,
    blocks,
    vacations,
    playableVacationWeeks,
  ).length;
  return Math.min(configuredMax, available);
}

export function filterActiveSlotUnavailability(
  blocks: SlotUnavailability[] | undefined | null,
): SlotUnavailability[] {
  return (blocks ?? []).filter((b) => b.is_active);
}
