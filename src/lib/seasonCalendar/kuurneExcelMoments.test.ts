import { describe, expect, it } from "vitest";
import { listPlayableMondays } from "@/lib/cupBracketPlan";
import { buildSeasonPlan } from "./index";
import { buildSlotDetailsFromSeasonData } from "./buildSlotDetails";

/** Timeslots zoals Voorstel dagen kalender.xlsx (372 M-momenten). */
function kuurneExcelSeasonData() {
  const hours = [18, 19, 20, 21];
  const ranges: Array<[number, string, string]> = [
    [1, "2026-08-24", "2027-06-21"],
    [4, "2026-08-27", "2027-06-24"],
    [5, "2027-04-23", "2027-06-25"],
    [2, "2027-04-20", "2027-06-22"],
    [2, "2026-12-15", "2026-12-15"],
    [5, "2027-01-22", "2027-01-22"],
  ];
  const venue_timeslots = ranges.flatMap(([dayOfWeek, valid_from, valid_until], rangeIndex) =>
    hours.map((hour, hourIndex) => ({
      timeslot_id: rangeIndex * 4 + hourIndex + 1,
      venue_id: 1,
      venue_name: "Sportpark Kuurne",
      day_of_week: dayOfWeek,
      start_time: `${hour}:00`,
      priority: hourIndex + 1,
      valid_from,
      valid_until,
    })),
  );
  return {
    venues: [{ venue_id: 1, name: "Sportpark Kuurne" }],
    venue_timeslots,
  };
}

const KUURNE_VACATIONS = [
  { id: 1, name: "Herfstvakantie", start_date: "2026-11-02", end_date: "2026-11-08", is_active: true },
  { id: 2, name: "Kerstvakantie", start_date: "2026-12-21", end_date: "2027-01-03", is_active: true },
  { id: 3, name: "Krokusvakantie", start_date: "2027-02-08", end_date: "2027-02-14", is_active: true },
  { id: 4, name: "Paasvakantie", start_date: "2027-03-29", end_date: "2027-04-11", is_active: true },
  { id: 5, name: "Hemelvaart", start_date: "2027-05-06", end_date: "2027-05-09", is_active: true },
  { id: 6, name: "Ezelweekend", start_date: "2026-10-05", end_date: "2026-10-06", is_active: true },
  { id: 7, name: "Personeelsreis", start_date: "2027-06-11", end_date: "2027-06-11", is_active: true },
  { id: 8, name: "Pinksteren", start_date: "2027-05-17", end_date: "2027-05-17", is_active: true },
];

describe("Kuurne Excel M-momenten (372)", () => {
  const seasonData = kuurneExcelSeasonData();
  const slotDetails = buildSlotDetailsFromSeasonData(seasonData);

  it("houdt gedeeltelijke vakantieweken speelbaar (Ezelweekend + Pinksteren)", () => {
    const playable = listPlayableMondays(
      "2026-08-17",
      "2027-06-28",
      KUURNE_VACATIONS,
    );
    expect(playable).toContain("2026-10-05");
    expect(playable).toContain("2027-05-17");
    expect(playable).not.toContain("2026-11-02");
    expect(playable).not.toContain("2026-12-21");
  });

  it("telt 372 speelmomenten, inclusief do 8 okt en pinksterweek", () => {
    const plan = buildSeasonPlan({
      seasonStart: "2026-08-17",
      seasonEnd: "2027-06-28",
      vacations: KUURNE_VACATIONS,
      timeslots: seasonData.venue_timeslots,
      slotDetails,
      competitionMatches: 330,
      cupTeamCount: 22,
      playoffMatchdays: 0,
    });
    const total = plan.weeks.reduce((sum, week) => sum + week.configAvailableCount, 0);
    expect(total).toBe(372);

    const ezel = plan.weeks.find((w) => w.weekMonday === "2026-10-05");
    expect(ezel?.configAvailableCount).toBe(4);
    expect(ezel?.phases).not.toContain("vacation");

    const pinksteren = plan.weeks.find((w) => w.weekMonday === "2027-05-17");
    expect(pinksteren?.configAvailableCount).toBe(12);
    expect(pinksteren?.phases).not.toContain("vacation");

    const herfst = plan.weeks.find((w) => w.weekMonday === "2026-11-02");
    expect(herfst?.phases).toEqual(["vacation"]);
    expect(herfst?.configAvailableCount).toBe(0);
  });
});
