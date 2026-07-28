import { describe, expect, it } from "vitest";
import {
  applyKuurneTuesdayPeriodSlots,
  areWeeklySameWeekday,
  buildTuesdayPeriodSlots,
  consolidateTuesdaySingleDaySlots,
  KUURNE_EXTRA_TUESDAY_PERIOD,
  mergeMissingTimeslots,
  buildHourlySlotsFromWideSlot,
  splitMultiHourTimeslots,
  timeslotIdentityKey,
} from "./timeslotBulkPresets";
import type { VenueTimeslot } from "@/services/competitionDataService";

function singleTuesday(
  id: number,
  date: string,
  hour: number,
  priority: number,
): VenueTimeslot {
  const start = `${String(hour).padStart(2, "0")}:00`;
  const end = `${String(hour + 1).padStart(2, "0")}:00`;
  return {
    timeslot_id: id,
    venue_id: 1,
    venue_name: "Sportpark Kuurne",
    day_of_week: 2,
    start_time: start,
    end_time: end,
    priority,
    valid_from: date,
    valid_until: date,
  };
}

describe("timeslotBulkPresets", () => {
  it("bouwt 4 periode-slots voor dinsdag 18–21u", () => {
    const slots = buildTuesdayPeriodSlots({
      venueId: 1,
      venueName: "Sportpark Kuurne",
      validFrom: KUURNE_EXTRA_TUESDAY_PERIOD.valid_from,
      validUntil: KUURNE_EXTRA_TUESDAY_PERIOD.valid_until,
      startPriority: 10,
    });
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.day_of_week === 2)).toBe(true);
    expect(slots[0].valid_from).toBe("2027-04-20");
    expect(slots[0].valid_until).toBe("2027-06-22");
  });

  it("herkent wekelijkse dinsdagen", () => {
    expect(areWeeklySameWeekday(["2027-04-20", "2027-04-27", "2027-05-04"])).toBe(true);
    expect(areWeeklySameWeekday(["2027-04-20", "2027-05-04"])).toBe(false);
  });

  it("consolideert 3 losse dinsdagen naar 1 periode-slot per uur", () => {
    const existing = [
      singleTuesday(1, "2027-04-20", 18, 1),
      singleTuesday(2, "2027-04-27", 18, 2),
      singleTuesday(3, "2027-05-04", 18, 3),
    ];
    const { slots, removedCount, addedCount } = consolidateTuesdaySingleDaySlots(existing);
    expect(removedCount).toBe(3);
    expect(addedCount).toBe(1);
    expect(slots).toHaveLength(1);
    expect(slots[0].valid_from).toBe("2027-04-20");
    expect(slots[0].valid_until).toBe("2027-05-04");
    expect(slots[0].start_time).toBe("18:00");
  });

  it("applyKuurneTuesdayPeriodSlots voegt periode toe zonder duplicaten", () => {
    const { slots, addedCount } = applyKuurneTuesdayPeriodSlots([], {
      venue_id: 1,
      name: "Sportpark Kuurne",
    });
    expect(addedCount).toBe(4);
    expect(slots).toHaveLength(4);
    const again = applyKuurneTuesdayPeriodSlots(slots, {
      venue_id: 1,
      name: "Sportpark Kuurne",
    });
    expect(again.addedCount).toBe(0);
    expect(again.slots).toHaveLength(4);
  });

  it("applyKuurne consolideert bestaande losse dinsdagen en voegt ontbrekende uren toe", () => {
    const singles = [18, 19, 20, 21].flatMap((hour, hi) =>
      ["2027-04-20", "2027-04-27"].map((date, di) =>
        singleTuesday(hi * 10 + di + 1, date, hour, hi * 10 + di + 1),
      ),
    );
    const result = applyKuurneTuesdayPeriodSlots(singles, {
      venue_id: 1,
      name: "Sportpark Kuurne",
    });
    expect(result.consolidatedRemoved).toBe(12);
    expect(result.slots).toHaveLength(4);
    expect(new Set(result.slots.map(timeslotIdentityKey)).size).toBe(4);
  });

  it("splitst 18:00–22:00 in 4 uur-slots", () => {
    const wide: VenueTimeslot = {
      timeslot_id: 1,
      venue_id: 1,
      venue_name: "Sportpark Kuurne",
      day_of_week: 1,
      start_time: "18:00",
      end_time: "22:00",
      priority: 1,
      valid_from: "2026-08-17",
      valid_until: "2027-06-21",
    };
    const { slots, splitCount, addedCount } = splitMultiHourTimeslots([wide]);
    expect(splitCount).toBe(1);
    expect(addedCount).toBe(4);
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.start_time)).toEqual([
      "18:00",
      "19:00",
      "20:00",
      "21:00",
    ]);
    expect(slots.map((s) => s.end_time)).toEqual([
      "19:00",
      "20:00",
      "21:00",
      "22:00",
    ]);
  });

  it("splitMultiHourTimeslots slaat bestaande uur-slots over", () => {
    const wide: VenueTimeslot = {
      timeslot_id: 1,
      venue_id: 1,
      venue_name: "Sportpark Kuurne",
      day_of_week: 4,
      start_time: "18:00",
      end_time: "22:00",
      priority: 1,
    };
    const existingHour = buildHourlySlotsFromWideSlot(wide, 10, 1)[0];
    const { slots, splitCount, addedCount } = splitMultiHourTimeslots([
      wide,
      { ...existingHour, timeslot_id: 2 },
    ]);
    expect(splitCount).toBe(1);
    expect(addedCount).toBe(3);
    expect(slots).toHaveLength(4);
  });

  it("mergeMissingTimeslots slaat duplicaten over", () => {
    const a = buildTuesdayPeriodSlots({
      venueId: 1,
      venueName: "Sportpark Kuurne",
      validFrom: "2027-04-20",
      validUntil: "2027-06-22",
      startPriority: 1,
    });
    const { merged, addedCount } = mergeMissingTimeslots(a, a);
    expect(addedCount).toBe(0);
    expect(merged).toHaveLength(4);
  });
});
