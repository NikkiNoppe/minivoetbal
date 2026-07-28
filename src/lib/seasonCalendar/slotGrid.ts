/** Effectieve slot-grid per speelweek (config-blokkades + occupancy). */

import { isTimeslotValidOnDate } from "@/lib/timeslotAvailability";
import { matchDateFromWeekMonday } from "@/lib/cupBracketPlan";
import {
  isDateInVacationPeriod,
  toMondayIso,
  type VacationLike,
} from "@/lib/competitionPlanningEstimate";
import { normalizeVenueName } from "@/lib/utils";
import type { SlotUnavailability } from "@/types/slotUnavailability";
import type {
  EffectiveSlot,
  OccupancyMatchLike,
  OccupancyPhase,
  SlotDetailLike,
  SlotStatus,
  WeekSlotGrid,
} from "./types";

function normalizeTime(value: string | null | undefined): string {
  if (!value) return "";
  const raw = value.includes("T") ? value.split("T")[1] ?? value : value;
  return raw.slice(0, 5);
}

function phaseFromMatch(match: OccupancyMatchLike): OccupancyPhase {
  if (match.is_playoff_match) return "playoff";
  if (match.is_cup_match) return "cup";
  return "competition";
}

function occupiedStatus(phase: OccupancyPhase): SlotStatus {
  if (phase === "cup") return "occupied_cup";
  if (phase === "playoff") return "occupied_playoff";
  return "occupied_competition";
}

function isUnavailabilityActive(
  blocks: SlotUnavailability[],
  date: string,
  venueId: number,
  timeslotId: number,
): boolean {
  const normalized = date.split("T")[0];
  return blocks.some(
    (b) =>
      b.is_active &&
      b.date.split("T")[0] === normalized &&
      b.venue_id === venueId &&
      b.timeslot_id === timeslotId,
  );
}

/** Bouw config-grid (zonder match-occupancy). */
export function buildConfigWeekGrid(
  weekMonday: string,
  slotDetails: SlotDetailLike[],
  blocks: SlotUnavailability[] = [],
  vacations: VacationLike[] = [],
  playableVacationWeeks: string[] = [],
): WeekSlotGrid {
  const monday = toMondayIso(weekMonday);
  const vacationExceptions = new Set(
    playableVacationWeeks.map((d) => toMondayIso(d)),
  );
  const ignoreVacation = vacationExceptions.has(monday);
  const slots: EffectiveSlot[] = slotDetails.map((row, index) => {
    const ts = row.timeslot;
    if (!ts) {
      return { index, status: "blocked_config" as const };
    }
    const matchDate = matchDateFromWeekMonday(monday, ts.day_of_week);
    const venueId = typeof ts.venue_id === "number" ? ts.venue_id : -1;
    const timeslotId = typeof ts.timeslot_id === "number" ? ts.timeslot_id : -1;
    const invalid = !isTimeslotValidOnDate(ts, matchDate);
    const onVacation =
      !ignoreVacation && isDateInVacationPeriod(matchDate, vacations);
    const blocked =
      invalid ||
      onVacation ||
      (venueId >= 0 &&
        timeslotId >= 0 &&
        isUnavailabilityActive(blocks, matchDate, venueId, timeslotId));

    return {
      index,
      status: blocked ? ("blocked_config" as const) : ("available" as const),
      venue: row.venue,
      dayOfWeek: ts.day_of_week,
      startTime: ts.start_time ?? null,
      matchDate,
    };
  });

  const blockedConfig = slots.filter((s) => s.status === "blocked_config").length;
  const configAvailableCount = slots.length - blockedConfig;

  return {
    weekMonday: monday,
    slots,
    configAvailableCount,
    freeCount: configAvailableCount,
    occupiedCompetition: 0,
    occupiedCup: 0,
    occupiedPlayoff: 0,
    blockedConfig,
  };
}

/** Match een bestaande wedstrijd op een slot-index (datum + venue + tijd). */
export function findSlotIndexForMatch(
  match: OccupancyMatchLike,
  slotDetails: SlotDetailLike[],
  weekMonday: string,
): number | null {
  const matchDate = match.match_date?.split("T")[0];
  if (!matchDate) return null;
  const monday = toMondayIso(weekMonday);
  if (toMondayIso(matchDate) !== monday) return null;

  const venue = normalizeVenueName(String(match.location ?? ""));
  const time =
    normalizeTime(match.match_time) ||
    normalizeTime(match.match_date?.includes("T") ? match.match_date : null);

  for (let i = 0; i < slotDetails.length; i++) {
    const row = slotDetails[i];
    const ts = row.timeslot;
    if (!ts) continue;
    const slotDate = matchDateFromWeekMonday(monday, ts.day_of_week);
    if (slotDate !== matchDate) continue;
    const slotVenue = normalizeVenueName(row.venue);
    if (venue && slotVenue && venue !== slotVenue) continue;
    const slotTime = normalizeTime(ts.start_time);
    if (time && slotTime && time !== slotTime) continue;
    return i;
  }
  return null;
}

/**
 * Pas match-occupancy toe op een config-grid.
 * Matches die niet op een specifiek slot mappen, verlagen freeCount via greedy claim op free slots.
 */
export function applyOccupancyToWeekGrid(
  grid: WeekSlotGrid,
  matches: OccupancyMatchLike[],
  slotDetails: SlotDetailLike[],
): WeekSlotGrid {
  const slots = grid.slots.map((s) => ({ ...s }));
  const weekMatches = matches.filter(
    (m) => m.match_date && toMondayIso(m.match_date) === grid.weekMonday,
  );

  const claimed = new Set<number>();
  const unmatched: OccupancyMatchLike[] = [];

  for (const match of weekMatches) {
    const idx = findSlotIndexForMatch(match, slotDetails, grid.weekMonday);
    if (idx != null && slots[idx]?.status === "available" && !claimed.has(idx)) {
      slots[idx] = { ...slots[idx], status: occupiedStatus(phaseFromMatch(match)) };
      claimed.add(idx);
    } else {
      unmatched.push(match);
    }
  }

  for (const match of unmatched) {
    const freeIdx = slots.findIndex((s) => s.status === "available");
    if (freeIdx < 0) break;
    slots[freeIdx] = {
      ...slots[freeIdx],
      status: occupiedStatus(phaseFromMatch(match)),
    };
  }

  const blockedConfig = slots.filter((s) => s.status === "blocked_config").length;
  const occupiedCompetition = slots.filter((s) => s.status === "occupied_competition").length;
  const occupiedCup = slots.filter((s) => s.status === "occupied_cup").length;
  const occupiedPlayoff = slots.filter((s) => s.status === "occupied_playoff").length;
  const freeCount = slots.filter((s) => s.status === "available").length;

  return {
    ...grid,
    slots,
    blockedConfig,
    occupiedCompetition,
    occupiedCup,
    occupiedPlayoff,
    freeCount,
    configAvailableCount: slots.length - blockedConfig,
  };
}

/** Bouw grids voor alle speelweken. */
export function buildSeasonSlotGrids(input: {
  weekMondays: string[];
  slotDetails: SlotDetailLike[];
  blocks?: SlotUnavailability[];
  matches?: OccupancyMatchLike[];
  vacations?: VacationLike[];
  /** Vakantieweken die uitzonderlijk speelbaar blijven. */
  playableVacationWeeks?: string[];
}): Map<string, WeekSlotGrid> {
  const map = new Map<string, WeekSlotGrid>();
  const blocks = input.blocks ?? [];
  const vacations = input.vacations ?? [];
  const matches = input.matches ?? [];
  const playableVacationWeeks = input.playableVacationWeeks ?? [];
  for (const week of input.weekMondays) {
    const config = buildConfigWeekGrid(
      week,
      input.slotDetails,
      blocks,
      vacations,
      playableVacationWeeks,
    );
    map.set(
      toMondayIso(week),
      applyOccupancyToWeekGrid(config, matches, input.slotDetails),
    );
  }
  return map;
}

export function capacityForWeek(
  grids: Map<string, WeekSlotGrid>,
  weekMonday: string,
): number {
  return grids.get(toMondayIso(weekMonday))?.freeCount ?? 0;
}

export function configCapacityForWeek(
  grids: Map<string, WeekSlotGrid>,
  weekMonday: string,
): number {
  return grids.get(toMondayIso(weekMonday))?.configAvailableCount ?? 0;
}

/** Mediaan / min van freeCount over weken met capacity > 0. */
export function summarizeEffectiveCapacity(grids: Map<string, WeekSlotGrid>): {
  maxFree: number;
  minPositiveFree: number;
  medianPositiveFree: number;
  usableWeekCount: number;
  zeroCapacityWeeks: number;
} {
  const positives: number[] = [];
  let zero = 0;
  for (const g of grids.values()) {
    if (g.freeCount > 0) positives.push(g.freeCount);
    else zero += 1;
  }
  positives.sort((a, b) => a - b);
  const mid = Math.floor(positives.length / 2);
  const median =
    positives.length === 0
      ? 0
      : positives.length % 2 === 0
        ? Math.floor((positives[mid - 1] + positives[mid]) / 2)
        : positives[mid];

  return {
    maxFree: positives.length ? positives[positives.length - 1] : 0,
    minPositiveFree: positives.length ? positives[0] : 0,
    medianPositiveFree: median,
    usableWeekCount: positives.length,
    zeroCapacityWeeks: zero,
  };
}
