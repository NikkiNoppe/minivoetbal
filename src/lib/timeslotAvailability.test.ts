import { describe, expect, it } from "vitest";
import {
  applyStandbySlotBlocks,
  normalizeVenueTimeslotForSave,
} from "./timeslotAvailability";

describe("applyStandbySlotBlocks", () => {
  const slots = [
    { timeslot: { timeslot_id: 8 } },
    { timeslot: { timeslot_id: 9, available_when_blocked_timeslot_id: 8 } },
  ];

  it("houdt het reserve-slot dicht zolang 21u beschikbaar is", () => {
    const blocked = applyStandbySlotBlocks(slots, new Set());
    expect(blocked.has(0)).toBe(false);
    expect(blocked.has(1)).toBe(true);
  });

  it("opent Vlasschaard 18u als Dageraad 21u geblokkeerd is", () => {
    const blocked = applyStandbySlotBlocks(slots, new Set([0]));
    expect(blocked.has(0)).toBe(true);
    expect(blocked.has(1)).toBe(false);
  });
});

describe("normalizeVenueTimeslotForSave", () => {
  it("bewaart de reserve-koppeling", () => {
    const saved = normalizeVenueTimeslotForSave(
      {
        timeslot_id: 9,
        venue_id: 2,
        day_of_week: 1,
        start_time: "18:00",
        end_time: "19:00",
        priority: 9,
        available_when_blocked_timeslot_id: 8,
      },
      "Bavikhove - Vlasschaard",
    );
    expect(saved.available_when_blocked_timeslot_id).toBe(8);
  });

  it("laat de koppeling weg als die naar zichzelf wijst", () => {
    const saved = normalizeVenueTimeslotForSave(
      {
        timeslot_id: 9,
        venue_id: 2,
        day_of_week: 1,
        start_time: "18:00",
        end_time: "19:00",
        available_when_blocked_timeslot_id: 9,
      },
      "Bavikhove - Vlasschaard",
    );
    expect(saved.available_when_blocked_timeslot_id).toBeUndefined();
  });
});
