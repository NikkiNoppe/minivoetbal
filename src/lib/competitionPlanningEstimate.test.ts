import { describe, expect, it } from "vitest";
import {
  estimateCompetitionPlanning,
  estimateCupSpreadWeeks,
  getConfiguredPlayDays,
  orderCupDayPreference,
  pickSpacedPlayDayPair,
  uniqueMondaysFromDates,
} from "./competitionPlanningEstimate";

describe("pickSpacedPlayDayPair", () => {
  it("kiest maandag + vrijdag bij ma–vr slots", () => {
    const pair = pickSpacedPlayDayPair([1, 2, 3, 4, 5]);
    expect(pair.early).toBe(1);
    expect(pair.late).toBe(5);
    expect(pair.separated).toBe(true);
    expect(pair.earlyLabel).toBe("Maandag");
    expect(pair.lateLabel).toBe("Vrijdag");
  });

  it("kiest maandag + dinsdag bij alleen die dagen", () => {
    const pair = pickSpacedPlayDayPair([1, 2]);
    expect(pair.early).toBe(1);
    expect(pair.late).toBe(2);
  });
});

describe("orderCupDayPreference", () => {
  it("bij dichte maandag: dinsdag vóór donderdag (vermijd dag vóór vrijdag)", () => {
    // ma dicht → di/wo vóór do (eve van vr)
    const order = orderCupDayPreference(1, 5, [1, 2, 3, 4, 5]);
    expect(order[0]).toBe(1);
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(4));
    expect(order.indexOf(4)).toBe(order.length - 1); // donderdag laatst
    expect(order.includes(5)).toBe(false); // geen competitiedag
  });
});

describe("uniqueMondaysFromDates", () => {
  it("groepeert datums naar unieke maandagen", () => {
    expect(uniqueMondaysFromDates(["2026-09-01", "2026-09-04", "2026-09-08"])).toEqual([
      "2026-08-31",
      "2026-09-07",
    ]);
  });
});

describe("estimateCupSpreadWeeks", () => {
  it("spreidt 21 bekerwedstrijden over meer weken dan het minimum", () => {
    const spread = estimateCupSpreadWeeks({
      cupMatches: 21,
      slotsPerWeek: 7,
      maxAvailableWeeks: 46,
    });
    expect(spread.minWeeks).toBe(3);
    expect(spread.preferredWeeks).toBeGreaterThan(spread.minWeeks);
  });
});

describe("estimateCompetitionPlanning", () => {
  it("trekt bekerweken af en toont dubbele speelweken bij tekort", () => {
    const estimate = estimateCompetitionPlanning({
      totalMatches: 330,
      calendarWeeks: 46,
      timeslots: Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i < 4 ? 1 : 5,
      })),
      cupMatches: 21,
      cupWeeksReserved: 6,
      vacationWeeks: 0,
    });
    expect(estimate.cupMatches).toBe(21);
    expect(estimate.cupWeeksReserved).toBe(6);
    expect(estimate.availableWeeks).toBe(40);
    expect(estimate.weekDeficit).toBeGreaterThan(0);
    expect(estimate.feasibleWithDoublePlay).toBe(true);
    expect(estimate.dayPair.earlyLabel).toBe("Maandag");
    expect(estimate.dayPair.lateLabel).toBe("Vrijdag");
  });

  it("leest unieke speeldagen uit tijdslots", () => {
    expect(getConfiguredPlayDays([{ day_of_week: 1 }, { day_of_week: 5 }, { day_of_week: 1 }])).toEqual([
      1, 5,
    ]);
  });
});
