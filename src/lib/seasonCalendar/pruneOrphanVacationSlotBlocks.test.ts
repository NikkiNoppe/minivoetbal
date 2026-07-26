import { describe, expect, it } from "vitest";
import { pruneOrphanVacationSlotBlocks } from "./pruneOrphanVacationSlotBlocks";
import type { SlotUnavailability } from "@/types/slotUnavailability";

describe("pruneOrphanVacationSlotBlocks", () => {
  it("verwijdert ma 21/12-blokkades als kerstvakantie pas op 22/12 begint", () => {
    const blocks: SlotUnavailability[] = [
      {
        id: 50,
        date: "2026-12-21",
        name: "Kerstvakantie",
        reason: "Kerstvakantie",
        venue_id: 1,
        timeslot_id: 1,
        is_active: true,
      },
      {
        id: 9,
        date: "2026-12-24",
        name: "Kerstavond",
        reason: "Kerstavond",
        venue_id: 1,
        timeslot_id: 9,
        is_active: true,
      },
      {
        id: 54,
        date: "2026-12-28",
        name: "Kerstvakantie",
        reason: "Kerstvakantie",
        venue_id: 1,
        timeslot_id: 1,
        is_active: true,
      },
    ];
    const vacations = [
      {
        name: "Kerstvakantie",
        start_date: "2026-12-22",
        end_date: "2027-01-03",
        is_active: true,
      },
    ];
    const { blocks: next, removed } = pruneOrphanVacationSlotBlocks(blocks, vacations);
    expect(removed).toHaveLength(1);
    expect(removed[0].date).toBe("2026-12-21");
    expect(next.map((b) => b.id).sort((a, b) => Number(a) - Number(b))).toEqual([9, 54]);
  });

  it("verwijdert vrijdag 7/5-blokkades als Hemelvaart-vakantie die dag openzet", () => {
    const blocks: SlotUnavailability[] = [
      {
        id: 87,
        date: "2027-05-07",
        name: "Verlengd Weekend",
        reason: "Verlengd Weekend",
        venue_id: 1,
        timeslot_id: 13,
        is_active: true,
      },
      {
        id: 35,
        date: "2027-05-06",
        name: "OLH Hemelvaart",
        reason: "OLH Hemelvaart",
        venue_id: 1,
        timeslot_id: 10,
        is_active: true,
      },
    ];
    const vacations = [
      {
        name: "Hemelvaart",
        start_date: "2027-05-06",
        end_date: "2027-05-06",
        is_active: true,
      },
      {
        name: "Verlengd weekend Hemelvaart (za–zo)",
        start_date: "2027-05-08",
        end_date: "2027-05-09",
        is_active: true,
      },
    ];
    const { blocks: next, removed } = pruneOrphanVacationSlotBlocks(blocks, vacations);
    expect(removed).toHaveLength(1);
    expect(removed[0].date).toBe("2027-05-07");
    expect(next.map((b) => b.id)).toEqual([35]);
  });
});
