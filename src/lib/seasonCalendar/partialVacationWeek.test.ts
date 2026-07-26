import { describe, expect, it } from "vitest";
import { buildConfigWeekGrid } from "./slotGrid";
import type { SlotDetailLike } from "./types";

function kuurneLikeSlots(): SlotDetailLike[] {
  return [
    ...[18, 19, 20, 21].map((h, i) => ({
      venue: "Sportpark Kuurne",
      timeslot: {
        timeslot_id: i + 1,
        venue_id: 1,
        day_of_week: 1,
        start_time: `${h}:00`,
        valid_from: "2026-08-17",
        valid_until: "2027-06-21",
      },
    })),
    ...[18, 19, 20, 21].map((h, i) => ({
      venue: "Sportpark Kuurne",
      timeslot: {
        timeslot_id: i + 5,
        venue_id: 1,
        day_of_week: 2,
        start_time: `${h}:00`,
        valid_from: "2026-08-17",
        valid_until: "2027-06-21",
      },
    })),
    ...[18, 19, 20, 21].map((h, i) => ({
      venue: "Sportpark Kuurne",
      timeslot: {
        timeslot_id: i + 9,
        venue_id: 1,
        day_of_week: 4,
        start_time: `${h}:00`,
        valid_from: "2026-08-17",
        valid_until: "2027-06-21",
      },
    })),
    ...[18, 19, 20, 21].map((h, i) => ({
      venue: "Sportpark Kuurne",
      timeslot: {
        timeslot_id: i + 13,
        venue_id: 1,
        day_of_week: 5,
        start_time: `${h}:00`,
        valid_from: "2026-08-17",
        valid_until: "2027-06-21",
      },
    })),
  ];
}

describe("partial vacation week Dec 21", () => {
  it("houdt 4 maandagslots vrij als kerst op di 22/12 begint (Kuurne-achtig)", () => {
    const vacations = [
      { start_date: "2026-12-22", end_date: "2027-01-03", is_active: true },
    ];
    const grid = buildConfigWeekGrid("2026-12-21", kuurneLikeSlots(), [], vacations);
    expect(grid.configAvailableCount).toBe(4);
    expect(grid.freeCount).toBe(4);
    expect(
      grid.slots.filter((s) => s.status === "available").every((s) => s.dayOfWeek === 1),
    ).toBe(true);
  });
});

describe("partial vacation week Hemelvaart — vrijdag 7 mei open", () => {
  it("houdt 4 vrijdagslots vrij als do + za–zo dicht zijn", () => {
    // Hemelvaart do 6/5 dicht, vrijdag 7/5 open (4 wedstrijden), za–zo verlengd weekend
    const vacations = [
      { start_date: "2027-05-06", end_date: "2027-05-06", is_active: true, name: "Hemelvaart" },
      {
        start_date: "2027-05-08",
        end_date: "2027-05-09",
        is_active: true,
        name: "Verlengd weekend Hemelvaart (za–zo)",
      },
    ];
    const grid = buildConfigWeekGrid("2027-05-03", kuurneLikeSlots(), [], vacations);
    expect(grid.configAvailableCount).toBe(12); // ma+di+vr
    const fridayFree = grid.slots.filter(
      (s) => s.status === "available" && s.dayOfWeek === 5 && s.matchDate === "2027-05-07",
    );
    expect(fridayFree).toHaveLength(4);
    expect(
      grid.slots.filter((s) => s.matchDate === "2027-05-06").every((s) => s.status === "blocked_config"),
    ).toBe(true);
  });
});
