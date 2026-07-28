import { describe, expect, it } from "vitest";
import { buildSeasonPlan } from "./index";
import { buildSlotDetailsFromSeasonData } from "./buildSlotDetails";
import { scopeSlotsByCupDayPreference } from "@/lib/competitionPreferredDayScope";
import {
  orderCupDayPreference,
  pickSpacedPlayDayPair,
} from "@/lib/competitionPlanningEstimate";
import { hasSufficientDayGapBetweenDates } from "@/lib/competitionWeekPacking";

/** Kuurne: 12 speelmomenten per week — 4× maandag, 4× donderdag, 4× vrijdag. */
function kuurneSeasonData() {
  return {
    venues: [{ venue_id: 1, name: "Sportpark Kuurne" }],
    venue_timeslots: [1, 4, 5].flatMap((dayOfWeek, dayIndex) =>
      [18, 19, 20, 21].map((hour, hourIndex) => ({
        timeslot_id: dayIndex * 4 + hourIndex + 1,
        venue_id: 1,
        venue_name: "Sportpark Kuurne",
        day_of_week: dayOfWeek,
        start_time: `${hour}:00`,
        priority: dayIndex * 4 + hourIndex + 1,
        valid_from: "2026-08-17",
        valid_until: "2027-06-21",
      })),
    ),
  };
}

describe("Kuurne-opzet: beker en competitie in dezelfde speelmomenten", () => {
  const seasonData = kuurneSeasonData();
  const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
  const playDays = seasonData.venue_timeslots.map((t) => t.day_of_week);

  it("kiest maandag voor de beker en vrijdag voor de competitie", () => {
    const separation = pickSpacedPlayDayPair(playDays);
    expect(separation.separated).toBe(true);
    expect(separation.early).toBe(1);
    expect(separation.late).toBe(5);
  });

  it("houdt de competitiedag buiten de bekervoorkeur", () => {
    const preference = orderCupDayPreference(1, 5, playDays);
    expect(preference[0]).toBe(1);
    expect(preference).not.toContain(5);
  });

  it("plaatst een voorronde van 6 wedstrijden op maandag en donderdag, nooit vrijdag", () => {
    const dayOfWeekForSlot = (idx: number) =>
      slotDetails[idx]?.timeslot?.day_of_week;
    const scoped = scopeSlotsByCupDayPreference(
      slotDetails.map((_, i) => i),
      6,
      dayOfWeekForSlot,
      orderCupDayPreference(1, 5, playDays),
    );
    // Eerst alle vier maandagmomenten, pas daarna donderdag.
    expect(scoped.slice(0, 4).map(dayOfWeekForSlot)).toEqual([1, 1, 1, 1]);
    expect(scoped.every((idx) => dayOfWeekForSlot(idx) !== 5)).toBe(true);
  });

  it("deelt bekerweken met de competitie en houdt ≥3 dagen tussen maandag en vrijdag", () => {
    const plan = buildSeasonPlan({
      seasonStart: "2026-08-17",
      seasonEnd: "2027-06-21",
      timeslots: seasonData.venue_timeslots,
      slotDetails,
      competitionMatches: 240,
      competitionMatchdays: 22,
      cupTeamCount: 22,
      playoffMatchdays: 2,
    });

    expect(plan.daySeparation.separated).toBe(true);
    // Geen enkele bekerronde vult 12 momenten, dus elke bekerweek houdt ruimte over.
    expect(plan.sharedCupMondays).toEqual(plan.cupDates);
    expect(
      plan.sharedCupMondays.every((d) => plan.competitionWeeks.includes(d)),
    ).toBe(true);

    // Beker maandag → competitie vrijdag in dezelfde week is toegestaan.
    const monday = plan.sharedCupMondays[0];
    const friday = new Date(`${monday}T12:00:00`);
    friday.setDate(friday.getDate() + 4);
    expect(
      hasSufficientDayGapBetweenDates(monday, friday.toISOString().slice(0, 10)),
    ).toBe(true);
  });
});
