import type { VenueTimeslot } from "@/services/competitionDataService";
import { normalizeCalendarDate } from "@/lib/timeslotAvailability";

/** Opeenvolgende wekelijkse dinsdagen (elk 7 dagen) — één periode volstaat. */
export const KUURNE_EXTRA_TUESDAY_PERIOD = {
  valid_from: "2027-04-20",
  valid_until: "2027-06-22",
} as const;

/** @deprecated Gebruik KUURNE_EXTRA_TUESDAY_PERIOD — alleen nog voor consolidatie. */
export const KUURNE_EXTRA_TUESDAY_DATES = [
  "2027-04-20",
  "2027-04-27",
  "2027-05-04",
  "2027-05-11",
  "2027-05-18",
  "2027-05-25",
  "2027-06-01",
  "2027-06-08",
  "2027-06-15",
  "2027-06-22",
] as const;

const TUESDAY = 2;
const TUESDAY_HOURS = [18, 19, 20, 21] as const;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_HOUR = 60;

export function parseTimeToMinutes(time: string): number {
  const normalized = time.includes("T") ? (time.split("T")[1] ?? time) : time;
  const [hours, minutes] = normalized.slice(0, 5).split(":").map(Number);
  return hours * MINUTES_PER_HOUR + (minutes || 0);
}

export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getTimeslotDurationMinutes(slot: VenueTimeslot): number | null {
  if (!slot.start_time || !slot.end_time) return null;
  const start = parseTimeToMinutes(slot.start_time);
  const end = parseTimeToMinutes(slot.end_time);
  if (end <= start) return null;
  return end - start;
}

/** Split één slot (bv. 18:00–22:00) in opeenvolgende uur-slots. */
export function buildHourlySlotsFromWideSlot(
  slot: VenueTimeslot,
  startTimeslotId: number,
  startPriority: number,
): VenueTimeslot[] {
  const duration = getTimeslotDurationMinutes(slot);
  if (!duration || duration <= MINUTES_PER_HOUR) return [slot];

  const startMin = parseTimeToMinutes(slot.start_time);
  const endMin = parseTimeToMinutes(slot.end_time);
  const hourly: VenueTimeslot[] = [];
  let timeslotId = startTimeslotId;
  let priority = startPriority;

  for (let minute = startMin; minute + MINUTES_PER_HOUR <= endMin; minute += MINUTES_PER_HOUR) {
    hourly.push({
      ...slot,
      timeslot_id: timeslotId,
      start_time: formatMinutesToTime(minute),
      end_time: formatMinutesToTime(minute + MINUTES_PER_HOUR),
      priority,
    });
    timeslotId += 1;
    priority += 1;
  }

  return hourly.length > 0 ? hourly : [slot];
}

/**
 * Splits brede tijdslots (meer dan 1 uur) in aparte speelmomenten per uur.
 * Bestaande uur-slots worden niet gedupliceerd.
 */
export function splitMultiHourTimeslots(
  slots: VenueTimeslot[],
): { slots: VenueTimeslot[]; splitCount: number; addedCount: number } {
  const keys = new Set(slots.map(timeslotIdentityKey));
  const toRemove = new Set<VenueTimeslot>();
  const toAdd: VenueTimeslot[] = [];
  let maxId = slots.reduce((m, s) => Math.max(m, s.timeslot_id ?? 0), 0);
  let maxPriority = slots.reduce((m, s) => Math.max(m, s.priority ?? 0), 0);

  for (const slot of slots) {
    const duration = getTimeslotDurationMinutes(slot);
    if (!duration || duration <= MINUTES_PER_HOUR) continue;

    const hourly = buildHourlySlotsFromWideSlot(
      slot,
      maxId + 1,
      slot.priority ?? maxPriority + 1,
    );
    if (hourly.length <= 1) continue;

    toRemove.add(slot);
    for (const hourSlot of hourly) {
      const key = timeslotIdentityKey(hourSlot);
      if (keys.has(key)) continue;
      keys.add(key);
      maxId = Math.max(maxId, hourSlot.timeslot_id ?? 0);
      maxPriority = Math.max(maxPriority, hourSlot.priority ?? 0);
      toAdd.push(hourSlot);
    }
  }

  if (toRemove.size === 0) {
    return { slots, splitCount: 0, addedCount: 0 };
  }

  const remaining = slots.filter((slot) => !toRemove.has(slot));
  return {
    slots: [...remaining, ...toAdd],
    splitCount: toRemove.size,
    addedCount: toAdd.length,
  };
}

export function timeslotIdentityKey(slot: VenueTimeslot): string {
  const from = slot.valid_from ? normalizeCalendarDate(slot.valid_from) : "";
  const until = slot.valid_until ? normalizeCalendarDate(slot.valid_until) : "";
  return [
    slot.venue_id,
    slot.day_of_week,
    slot.start_time,
    slot.end_time ?? "",
    from,
    until,
  ].join("|");
}

function isSingleDaySlot(slot: VenueTimeslot): boolean {
  const from = slot.valid_from ? normalizeCalendarDate(slot.valid_from) : "";
  const until = slot.valid_until ? normalizeCalendarDate(slot.valid_until) : "";
  return Boolean(from && until && from === until);
}

function isTuesdayDate(iso: string): boolean {
  const d = new Date(`${normalizeCalendarDate(iso)}T12:00:00`);
  return d.getDay() === TUESDAY;
}

/** Alle datums wekelijks 7 dagen uit elkaar (gesorteerd). */
export function areWeeklySameWeekday(dates: string[]): boolean {
  if (dates.length === 0) return false;
  const sorted = [...dates].map(normalizeCalendarDate).sort();
  if (!sorted.every(isTuesdayDate)) return false;
  if (sorted.length === 1) return true;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`).getTime();
    const curr = new Date(`${sorted[i]}T12:00:00`).getTime();
    if (Math.round((curr - prev) / MS_PER_DAY) !== 7) return false;
  }
  return true;
}

/** 4 dinsdag-slots (18–21u) voor één periode i.p.v. per kalenderdag. */
export function buildTuesdayPeriodSlots(input: {
  venueId: number;
  venueName: string;
  validFrom: string;
  validUntil: string;
  startPriority: number;
  startTimeslotId?: number;
}): VenueTimeslot[] {
  const from = normalizeCalendarDate(input.validFrom);
  const until = normalizeCalendarDate(input.validUntil);
  const slots: VenueTimeslot[] = [];
  let priority = input.startPriority;
  let timeslotId = input.startTimeslotId ?? Date.now();

  for (const hour of TUESDAY_HOURS) {
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00`;
    slots.push({
      timeslot_id: timeslotId,
      venue_id: input.venueId,
      venue_name: input.venueName,
      day_of_week: TUESDAY,
      start_time: start,
      end_time: end,
      priority,
      valid_from: from,
      valid_until: until,
    });
    priority += 1;
    timeslotId += 1;
  }
  return slots;
}

/**
 * Vervang losse ééndaagse dinsdag-slots (zelfde locatie/tijd, wekelijks patroon)
 * door één periode-slot per starttijd.
 */
export function consolidateTuesdaySingleDaySlots(
  slots: VenueTimeslot[],
): { slots: VenueTimeslot[]; removedCount: number; addedCount: number } {
  const singles = slots.filter(
    (s) => s.day_of_week === TUESDAY && isSingleDaySlot(s),
  );
  if (singles.length === 0) {
    return { slots, removedCount: 0, addedCount: 0 };
  }

  type GroupKey = string;
  const groups = new Map<GroupKey, VenueTimeslot[]>();
  for (const s of singles) {
    const key = [s.venue_id, s.start_time, s.end_time ?? ""].join("|");
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const toRemove = new Set<VenueTimeslot>();
  const toAdd: VenueTimeslot[] = [];
  let maxId = slots.reduce((m, s) => Math.max(m, s.timeslot_id ?? 0), 0);
  let maxPriority = slots.reduce((m, s) => Math.max(m, s.priority ?? 0), 0);

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const dates = group.map((s) => normalizeCalendarDate(s.valid_from!));
    if (!areWeeklySameWeekday(dates)) continue;

    const sorted = [...dates].sort();
    const from = sorted[0];
    const until = sorted[sorted.length - 1];
    const sample = group[0];

    const periodKey = timeslotIdentityKey({
      ...sample,
      valid_from: from,
      valid_until: until,
    });
    const periodExists = slots.some(
      (s) =>
        !toRemove.has(s) &&
        timeslotIdentityKey(s) === periodKey &&
        !isSingleDaySlot(s),
    );

    for (const s of group) toRemove.add(s);

    if (!periodExists) {
      maxId += 1;
      maxPriority += 1;
      toAdd.push({
        timeslot_id: maxId,
        venue_id: sample.venue_id,
        venue_name: sample.venue_name,
        day_of_week: TUESDAY,
        start_time: sample.start_time,
        end_time: sample.end_time,
        priority: maxPriority,
        valid_from: from,
        valid_until: until,
      });
    }
  }

  if (toRemove.size === 0) {
    return { slots, removedCount: 0, addedCount: 0 };
  }

  const remaining = slots.filter((s) => !toRemove.has(s));
  const merged = mergeMissingTimeslots(remaining, toAdd);
  return {
    slots: merged.merged,
    removedCount: toRemove.size,
    addedCount: merged.addedCount,
  };
}

/** Voeg alleen slots toe die nog niet bestaan (zelfde locatie/dag/tijd/periode). */
export function mergeMissingTimeslots(
  existing: VenueTimeslot[],
  toAdd: VenueTimeslot[],
): { merged: VenueTimeslot[]; addedCount: number } {
  const keys = new Set(existing.map(timeslotIdentityKey));
  const added: VenueTimeslot[] = [];
  for (const slot of toAdd) {
    const key = timeslotIdentityKey(slot);
    if (keys.has(key)) continue;
    keys.add(key);
    added.push(slot);
  }
  return { merged: [...existing, ...added], addedCount: added.length };
}

function isKuurneTuesdayHourSlot(slot: VenueTimeslot): boolean {
  if (slot.day_of_week !== TUESDAY) return false;
  const hour = Number.parseInt(slot.start_time?.slice(0, 2) ?? "", 10);
  return (TUESDAY_HOURS as readonly number[]).includes(hour);
}

function overlapsDateRange(
  from: string,
  until: string,
  rangeFrom: string,
  rangeUntil: string,
): boolean {
  return from <= rangeUntil && until >= rangeFrom;
}

/**
 * Consolideer losse dinsdagen + zorg dat de Kuurne-dinsdagperiode bestaat (4 slots).
 * Vervangt ook bestaande (deel)periodes in hetzelfde uurvenster.
 */
export function applyKuurneTuesdayPeriodSlots(
  existing: VenueTimeslot[],
  venue: { venue_id: number; name: string },
): {
  slots: VenueTimeslot[];
  consolidatedRemoved: number;
  addedCount: number;
} {
  const periodStart = KUURNE_EXTRA_TUESDAY_PERIOD.valid_from;
  const periodEnd = KUURNE_EXTRA_TUESDAY_PERIOD.valid_until;

  const afterSplit = splitMultiHourTimeslots(existing);
  const afterConsolidate = consolidateTuesdaySingleDaySlots(afterSplit.slots);

  const maxPriority = afterConsolidate.slots.reduce(
    (max, t) => Math.max(max, t.priority ?? 0),
    0,
  );
  const maxTimeslotId = afterConsolidate.slots.reduce(
    (max, t) => Math.max(max, t.timeslot_id ?? 0),
    0,
  );
  const proposed = buildTuesdayPeriodSlots({
    venueId: venue.venue_id,
    venueName: venue.name,
    validFrom: periodStart,
    validUntil: periodEnd,
    startPriority: maxPriority + 1,
    startTimeslotId: maxTimeslotId + 1,
  });
  const canonicalKeys = new Set(proposed.map(timeslotIdentityKey));

  const hasAllCanonical = proposed.every((slot) =>
    afterConsolidate.slots.some(
      (existingSlot) => timeslotIdentityKey(existingSlot) === timeslotIdentityKey(slot),
    ),
  );
  if (hasAllCanonical && afterConsolidate.removedCount === 0) {
    return {
      slots: afterConsolidate.slots,
      consolidatedRemoved: 0,
      addedCount: 0,
    };
  }

  let removedOverlap = 0;
  const withoutOverlappingTuesdayHours = afterConsolidate.slots.filter((slot) => {
    if (canonicalKeys.has(timeslotIdentityKey(slot))) return true;
    if (slot.venue_id !== venue.venue_id || !isKuurneTuesdayHourSlot(slot)) {
      return true;
    }
    const from = slot.valid_from
      ? normalizeCalendarDate(slot.valid_from)
      : periodStart;
    const until = slot.valid_until
      ? normalizeCalendarDate(slot.valid_until)
      : periodEnd;
    const overlaps = overlapsDateRange(from, until, periodStart, periodEnd);
    if (overlaps) removedOverlap += 1;
    return !overlaps;
  });

  const { merged, addedCount } = mergeMissingTimeslots(
    withoutOverlappingTuesdayHours,
    proposed,
  );
  return {
    slots: merged,
    consolidatedRemoved: afterConsolidate.removedCount + removedOverlap,
    addedCount,
  };
}

export function sortTimeslotsForDisplay(slots: VenueTimeslot[]): VenueTimeslot[] {
  return [...slots].sort((a, b) => {
    const dayA = a.day_of_week === 0 ? 7 : a.day_of_week;
    const dayB = b.day_of_week === 0 ? 7 : b.day_of_week;
    if (dayA !== dayB) return dayA - dayB;
    const fromA = a.valid_from?.slice(0, 10) ?? "";
    const fromB = b.valid_from?.slice(0, 10) ?? "";
    if (fromA !== fromB) return fromA.localeCompare(fromB);
    if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
    return (a.priority ?? 0) - (b.priority ?? 0);
  });
}
