import { describe, expect, it } from "vitest";
import { evaluateCupWeekSelection } from "./cupWeekSelection";
import type { SeasonWeekPlan } from "./types";

function week(
  monday: string,
  phases: SeasonWeekPlan["phases"],
  free = 8,
  config = 8,
): SeasonWeekPlan {
  return {
    weekMonday: monday,
    phases,
    freeCount: free,
    configAvailableCount: config,
  };
}

describe("evaluateCupWeekSelection", () => {
  it("blokkeert play-off en vakantie; stelt auto-voorstel voor", () => {
    const weeks = [
      week("2026-09-07", ["free"]),
      week("2026-09-14", ["competition"]),
      week("2026-09-21", ["vacation"], 0, 0),
      week("2026-09-28", ["playoff"], 8, 8),
      week("2026-10-05", ["free"]),
    ];
    const result = evaluateCupWeekSelection({
      weeks,
      preferredMondays: [],
      suggestedMondays: ["2026-09-07", "2026-10-05"],
      requiredWeeks: 2,
      minComfortableSlots: 4,
      daySeparation: {
        early: 1,
        late: 5,
        earlyLabel: "maandag",
        lateLabel: "vrijdag",
        separated: true,
      },
    });

    expect(result.byWeek.get("2026-09-21")?.selectability).toBe("blocked");
    expect(result.byWeek.get("2026-09-28")?.selectability).toBe("blocked");
    expect(result.byWeek.get("2026-09-07")?.selectability).toBe("suggested");
    expect(result.suggestionMondays).toEqual(["2026-09-07", "2026-10-05"]);
    expect(result.remaining).toBe(2);
  });

  it("waarschuwt bij competitie-overlap en krappe capaciteit", () => {
    const weeks = [
      week("2026-11-02", ["competition"], 8, 8),
      week("2026-11-09", ["free"], 2, 8),
    ];
    const result = evaluateCupWeekSelection({
      weeks,
      preferredMondays: ["2026-11-02"],
      suggestedMondays: [],
      requiredWeeks: 3,
      minComfortableSlots: 4,
      daySeparation: {
        early: 1,
        late: 5,
        earlyLabel: "maandag",
        lateLabel: "vrijdag",
        separated: true,
      },
    });

    const comp = result.byWeek.get("2026-11-02");
    expect(comp?.selectability).toBe("tight");
    expect(comp?.warningWhileSelected).toMatch(/dagscheiding/i);

    const tight = result.byWeek.get("2026-11-09");
    expect(tight?.warningOnSelect).toMatch(/2 vrije/);
    expect(result.selectedCount).toBe(1);
    expect(result.remaining).toBe(2);
  });

  it("toont overselectie in statusregel", () => {
    const weeks = [
      week("2026-09-07", ["free"]),
      week("2026-09-14", ["free"]),
      week("2026-09-21", ["free"]),
    ];
    const result = evaluateCupWeekSelection({
      weeks,
      preferredMondays: ["2026-09-07", "2026-09-14", "2026-09-21"],
      suggestedMondays: [],
      requiredWeeks: 2,
      minComfortableSlots: 4,
    });
    expect(result.overSelected).toBe(1);
    expect(result.statusLine).toMatch(/gespreid/);
  });
});
