import { describe, expect, it } from "vitest";
import { buildSeasonPlan } from "./index";
import { buildSlotDetailsFromSeasonData } from "./buildSlotDetails";

describe("kuurne week 21 dec met kerst vanaf 22/12", () => {
  it("toont 4 vrije maandagslots, niet Geblokkeerd 0/0", () => {
    const seasonData = {
      venues: [{ venue_id: 1, name: "Sportpark Kuurne" }],
      venue_timeslots: [1, 2, 4, 5].flatMap((dow, di) =>
        [18, 19, 20, 21].map((h, hi) => ({
          timeslot_id: di * 4 + hi + 1,
          venue_id: 1,
          venue_name: "Sportpark Kuurne",
          day_of_week: dow,
          start_time: `${h}:00`,
          priority: di * 4 + hi + 1,
          valid_from: "2026-08-17",
          valid_until: "2027-06-21",
        })),
      ),
    };
    const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
    const plan = buildSeasonPlan({
      seasonStart: "2026-08-17",
      seasonEnd: "2027-06-30",
      vacations: [
        { start_date: "2026-12-22", end_date: "2027-01-03", is_active: true },
      ],
      timeslots: seasonData.venue_timeslots,
      slotDetails,
      competitionMatches: 100,
      cupTeamCount: 16,
      playoffMatchdays: 0,
    });
    const w = plan.weeks.find((x) => x.weekMonday === "2026-12-21");
    expect(w).toBeTruthy();
    expect(w!.configAvailableCount).toBe(4);
    expect(w!.freeCount).toBe(4);
    expect(w!.phases.includes("blocked")).toBe(false);
  });
});
