/** Bouw SlotDetailLike[] uit season_data (zelfde volgorde als slotPlanningContext). */

import type { SlotDetailLike } from "@/lib/seasonCalendar";
import { normalizeVenueName } from "@/lib/utils";

export function buildSlotDetailsFromSeasonData(seasonData: {
  venues?: Array<{ venue_id: number; name: string }>;
  venue_timeslots?: Array<Record<string, unknown>>;
}): SlotDetailLike[] {
  const venues = seasonData.venues ?? [];
  const allTimeslots = [...(seasonData.venue_timeslots ?? [])]
    .map((slot) => {
      const venue = venues.find((v) => v.venue_id === slot.venue_id);
      const venueName = String(slot.venue_name ?? venue?.name ?? "Onbekend");
      return {
        ...slot,
        venue_name: venueName,
        priority: typeof slot.priority === "number" ? slot.priority : 999,
      };
    })
    .sort((a, b) => (a.priority as number) - (b.priority as number));

  return allTimeslots.map((tsRaw) => {
    const ts = tsRaw as Record<string, unknown>;
    return {
      venue: normalizeVenueName(String(ts.venue_name)),
      timeslot: {
        day_of_week: typeof ts.day_of_week === "number" ? ts.day_of_week : null,
        start_time: typeof ts.start_time === "string" ? ts.start_time : null,
        venue_id: typeof ts.venue_id === "number" ? ts.venue_id : undefined,
        timeslot_id: typeof ts.timeslot_id === "number" ? ts.timeslot_id : undefined,
        valid_from: (ts.valid_from as string | null | undefined) ?? null,
        valid_until: (ts.valid_until as string | null | undefined) ?? null,
      },
    };
  });
}
