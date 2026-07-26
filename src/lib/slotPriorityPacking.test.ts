import { describe, expect, it } from "vitest";
import {
  comparePreviewChronological,
  pickPriorityCandidateSlots,
  slotPriorityScoreBonus,
} from "./slotPriorityPacking";

describe("pickPriorityCandidateSlots", () => {
  it("neemt meer dan strikt m slots (tot ~1.5×) voor betere vulling", () => {
    expect(pickPriorityCandidateSlots([0, 1, 2, 3, 4, 5, 6], 4)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("kiest alle slots als matchCount groot is", () => {
    expect(pickPriorityCandidateSlots([4, 1, 3, 0], 2)).toEqual([0, 1, 3]);
    expect(pickPriorityCandidateSlots([2, 5], 5)).toEqual([2, 5]);
  });

  it("slaat onbruikbare slots over en vult daarna aan", () => {
    expect(
      pickPriorityCandidateSlots([0, 1, 2, 3], 3, (c) => c !== 0),
    ).toEqual([1, 2, 3]);
  });
});

describe("slotPriorityScoreBonus", () => {
  it("geeft hogere bonus aan lagere index", () => {
    expect(slotPriorityScoreBonus(0, 16)).toBeGreaterThan(
      slotPriorityScoreBonus(15, 16),
    );
    expect(slotPriorityScoreBonus(15, 16)).toBe(0);
  });
});

describe("comparePreviewChronological", () => {
  it("sorteert op datum dan tijd", () => {
    const rows = [
      { match_date: "2026-01-26", match_time: "21:00" },
      { match_date: "2026-01-26", match_time: "18:00" },
      { match_date: "2026-01-25", match_time: "20:00" },
      { match_date: "2026-01-26", match_time: "19:00" },
    ];
    const sorted = [...rows].sort(comparePreviewChronological);
    expect(sorted.map((r) => `${r.match_date} ${r.match_time}`)).toEqual([
      "2026-01-25 20:00",
      "2026-01-26 18:00",
      "2026-01-26 19:00",
      "2026-01-26 21:00",
    ]);
  });
});
