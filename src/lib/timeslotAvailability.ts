/** Kalenderdatum YYYY-MM-DD normaliseren. */
export function normalizeCalendarDate(date: string): string {
  return date.split('T')[0];
}

export type TimeslotDateRange = {
  valid_from?: string | null;
  valid_until?: string | null;
};

/** Leeg = heel seizoen; anders inclusief van/tot. */
export function isTimeslotValidOnDate(
  timeslot: TimeslotDateRange,
  date: string,
): boolean {
  const normalized = normalizeCalendarDate(date);
  const from = timeslot.valid_from ? normalizeCalendarDate(timeslot.valid_from) : null;
  const until = timeslot.valid_until ? normalizeCalendarDate(timeslot.valid_until) : null;

  if (!from && !until) return true;
  if (from && normalized < from) return false;
  if (until && normalized > until) return false;
  return true;
}

export function formatTimeslotPeriod(
  timeslot: TimeslotDateRange,
  locale = 'nl-BE',
): string {
  const from = timeslot.valid_from ? normalizeCalendarDate(timeslot.valid_from) : null;
  const until = timeslot.valid_until ? normalizeCalendarDate(timeslot.valid_until) : null;

  if (!from && !until) return 'Heel seizoen';

  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  if (from && until) return `${fmt(from)} – ${fmt(until)}`;
  if (from) return `Vanaf ${fmt(from)}`;
  return `Tot ${fmt(until!)}`;
}

export function normalizeTimeslotDateRange(
  validFrom?: string | null,
  validUntil?: string | null,
): { valid_from?: string; valid_until?: string } {
  const from =
    typeof validFrom === "string"
      ? validFrom.trim()
      : validFrom != null
        ? String(validFrom).trim()
        : "";
  const until =
    typeof validUntil === "string"
      ? validUntil.trim()
      : validUntil != null
        ? String(validUntil).trim()
        : "";
  return {
    ...(from ? { valid_from: normalizeCalendarDate(from) } : {}),
    ...(until ? { valid_until: normalizeCalendarDate(until) } : {}),
  };
}

export function normalizeTimeField(value?: string | null): string {
  if (!value) return "";
  const raw = String(value);
  const timePart = raw.includes("T") ? (raw.split("T")[1] ?? raw) : raw;
  return timePart.slice(0, 5);
}

export function normalizeOptionalDateField(value?: string | null): string {
  if (value == null || value === "") return "";
  return normalizeCalendarDate(String(value).trim());
}

/** Tijdslot met begrensde periode (niet heel seizoen) — bv. extra dinsdagen in het voorjaar. */
export function isPeriodBoundedTimeslot(timeslot: TimeslotDateRange): boolean {
  const from = timeslot.valid_from
    ? normalizeCalendarDate(timeslot.valid_from)
    : "";
  const until = timeslot.valid_until
    ? normalizeCalendarDate(timeslot.valid_until)
    : "";
  return Boolean(from && until);
}

export function normalizeVenueTimeslotForSave(
  slot: {
    timeslot_id: number;
    venue_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    priority?: number;
    venue_name?: string;
    valid_from?: string;
    valid_until?: string;
  },
  venueName: string,
) {
  const dateRange = normalizeTimeslotDateRange(
    normalizeOptionalDateField(slot.valid_from) || undefined,
    normalizeOptionalDateField(slot.valid_until) || undefined,
  );
  const priority =
    typeof slot.priority === "number" && Number.isFinite(slot.priority)
      ? slot.priority
      : undefined;

  return {
    timeslot_id: Number(slot.timeslot_id),
    venue_id: Number(slot.venue_id),
    venue_name: venueName,
    day_of_week: Number(slot.day_of_week),
    start_time: normalizeTimeField(slot.start_time),
    end_time: normalizeTimeField(slot.end_time),
    ...(priority != null ? { priority } : {}),
    ...dateRange,
  };
}
