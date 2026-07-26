import { describe, expect, it } from "vitest";
import { scopeSlotsByPreferredDayDistance } from "./competitionPreferredDayScope";

describe("scopeSlotsByPreferredDayDistance", () => {
  it("houdt dinsdag buiten als vrijdag+donderdag genoeg is", () => {
    const dayOfWeekBySlot = new Map<number, number>([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 4],
      [4, 4],
      [5, 4],
      [6, 4],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
    ]);
    const available = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const scoped = scopeSlotsByPreferredDayDistance(
      available,
      5,
      5,
      (idx) => dayOfWeekBySlot.get(idx),
    );
    expect(scoped.every((i) => i <= 6)).toBe(true);
    expect(scoped.some((i) => i >= 7)).toBe(false);
    expect(scoped.length).toBeGreaterThanOrEqual(5);
  });

  it("gebruikt alleen vrijdag als die volstaat", () => {
    const dayOfWeekBySlot = new Map<number, number>([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 4],
      [4, 2],
    ]);
    const scoped = scopeSlotsByPreferredDayDistance(
      [0, 1, 2, 3, 4],
      5,
      3,
      (idx) => dayOfWeekBySlot.get(idx),
    );
    expect(scoped.sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });
});
