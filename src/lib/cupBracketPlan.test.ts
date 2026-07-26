import { describe, expect, it } from "vitest";
import {
  assignFirstRoundWeekIndex,
  buildCupRoundSpecs,
  getCupBracketPlan,
  getCupFirstRoundPairs,
  getKnockoutWeekIndices,
  matchDateFromWeekMonday,
  nextSlotAfterVoorronde,
  pickSpacedIndices,
  suggestIdealCupDates,
} from "./cupBracketPlan";

describe("matchDateFromWeekMonday", () => {
  it("mapt timeslot-dag naar juiste kalenderdatum (niet alleen ma/di)", () => {
    // ma 21/12/2026
    expect(matchDateFromWeekMonday("2026-12-21", 1)).toBe("2026-12-21");
    expect(matchDateFromWeekMonday("2026-12-21", 2)).toBe("2026-12-22");
    expect(matchDateFromWeekMonday("2026-12-21", 4)).toBe("2026-12-24");
    expect(matchDateFromWeekMonday("2026-12-21", 5)).toBe("2026-12-25");
  });
});

describe("getCupFirstRoundPairs", () => {
  it("16 teams → 8 paren (achtste)", () => {
    expect(getCupFirstRoundPairs(16)).toBe(8);
  });
  it("15 teams → 7 paren voorronde (naar 8)", () => {
    expect(getCupFirstRoundPairs(15)).toBe(7);
  });
  it("22 teams → 6 paren voorronde (naar 16), niet 11", () => {
    expect(getCupFirstRoundPairs(22)).toBe(6);
  });
  it("14 teams → 6 paren voorronde (naar 8)", () => {
    expect(getCupFirstRoundPairs(14)).toBe(6);
  });
});

describe("buildCupRoundSpecs / getCupBracketPlan", () => {
  it("22 teams: voorronde → 1/8 → QF → SF → F", () => {
    const rounds = buildCupRoundSpecs(22, 7);
    expect(rounds.map((r) => r.prefix)).toEqual(["VR", "1/8", "QF", "SF", "FINAL"]);
    expect(rounds[0]).toMatchObject({
      matchCount: 6,
      byeCount: 10,
      teamsExiting: 16,
    });
    expect(rounds[1].matchCount).toBe(8);
    expect(rounds[2].matchCount).toBe(4);
    expect(rounds[3].matchCount).toBe(2);
    expect(rounds[4].matchCount).toBe(1);

    const plan = getCupBracketPlan(22, 7);
    // VR 1w + 1/8 2w + QF + SF + F = 6
    expect(plan.firstRoundPairs).toBe(6);
    expect(plan.firstRoundWeeks).toBe(1);
    expect(plan.requiredWeeks).toBe(6);
    expect(plan.roundLabels.some((l) => l.name.startsWith("Voorronde"))).toBe(true);
    expect(plan.roundLabels.some((l) => l.name.includes("Achtste") || l.name === "Achtste Finales")).toBe(
      true,
    );
  });

  it("16 teams / 7 slots → 5 weken (2×1/8 + QF + SF + F)", () => {
    const plan = getCupBracketPlan(16, 7);
    expect(plan.firstRoundPairs).toBe(8);
    expect(plan.firstRoundWeeks).toBe(2);
    expect(plan.requiredWeeks).toBe(5);
    expect(plan.rounds.map((r) => r.prefix)).toEqual(["1/8", "QF", "SF", "FINAL"]);
  });

  it("14 teams → voorronde naar 8, daarna QF/SF/F (geen valse achtste)", () => {
    const plan = getCupBracketPlan(14, 7);
    expect(plan.rounds.map((r) => r.prefix)).toEqual(["VR", "QF", "SF", "FINAL"]);
    expect(plan.firstRoundPairs).toBe(6);
    expect(plan.requiredWeeks).toBe(4);
  });

  it("8 teams start bij kwartfinale", () => {
    const plan = getCupBracketPlan(8, 7);
    expect(plan.rounds.map((r) => r.prefix)).toEqual(["QF", "SF", "FINAL"]);
    expect(plan.requiredWeeks).toBe(3);
  });
});

describe("nextSlotAfterVoorronde", () => {
  it("22→16: 10 byes gespreid, VR-winnaars in vrije slots", () => {
    // Byes op even slots + 2 extra; winners: 5,7,9,11,13,15
    expect(nextSlotAfterVoorronde(1, 6, 8)).toEqual({
      slotIndex: 5,
      matchNumber: 3,
      isHome: false,
    });
    expect(nextSlotAfterVoorronde(2, 6, 8)).toEqual({
      slotIndex: 7,
      matchNumber: 4,
      isHome: false,
    });
    expect(nextSlotAfterVoorronde(6, 6, 8)).toEqual({
      slotIndex: 15,
      matchNumber: 8,
      isHome: false,
    });
  });
});

describe("assignFirstRoundWeekIndex", () => {
  it("vult weken opeenvolgend op slotcapaciteit", () => {
    expect(assignFirstRoundWeekIndex(0, 8, 2, 7)).toBe(0);
    expect(assignFirstRoundWeekIndex(6, 8, 2, 7)).toBe(0);
    expect(assignFirstRoundWeekIndex(7, 8, 2, 7)).toBe(1);
  });
});

describe("getKnockoutWeekIndices", () => {
  it("laatste 3 weken voor QF/SF/Finale (legacy)", () => {
    expect(getKnockoutWeekIndices(5)).toEqual({
      firstRoundWeeks: 2,
      quarterFinal: 2,
      semiFinal: 3,
      final: 4,
    });
  });
});

describe("matchDateFromWeekMonday", () => {
  it("maandag en vrijdag correct t.o.v. weekmaandag", () => {
    expect(matchDateFromWeekMonday("2026-09-07", 1)).toBe("2026-09-07");
    expect(matchDateFromWeekMonday("2026-09-07", 5)).toBe("2026-09-11");
  });
});

describe("pickSpacedIndices", () => {
  it("kiest gelijkmatig", () => {
    expect(pickSpacedIndices(10, 4)).toEqual([0, 3, 6, 9]);
  });
});

describe("suggestIdealCupDates", () => {
  it("vermijdt competitieweken wanneer mogelijk", () => {
    const suggestion = suggestIdealCupDates({
      requiredWeeks: 4,
      seasonStart: "2025-09-01",
      seasonEnd: "2026-05-31",
      competitionMondays: [
        "2025-09-08",
        "2025-09-15",
        "2025-09-22",
        "2025-09-29",
        "2025-10-06",
      ],
      timeslots: [{ day_of_week: 1 }, { day_of_week: 5 }],
    });
    expect(suggestion.dates).toHaveLength(4);
    expect(suggestion.overlappingMondays).toHaveLength(0);
    expect(suggestion.daySeparation.earlyLabel).toBe("Maandag");
    expect(suggestion.daySeparation.lateLabel).toBe("Vrijdag");
  });

  it("meldt overlap als er te weinig vrije weken zijn", () => {
    const suggestion = suggestIdealCupDates({
      requiredWeeks: 3,
      seasonStart: "2025-09-01",
      seasonEnd: "2025-09-22",
      vacations: [],
      competitionMondays: ["2025-09-01", "2025-09-08", "2025-09-15", "2025-09-22"],
      timeslots: [{ day_of_week: 1 }, { day_of_week: 5 }],
    });
    expect(suggestion.dates.length).toBeGreaterThan(0);
    expect(suggestion.overlappingMondays.length).toBeGreaterThan(0);
    expect(suggestion.notes.some((n) => n.includes("overlappen"))).toBe(true);
  });
});
