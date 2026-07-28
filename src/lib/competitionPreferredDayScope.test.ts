import { describe, expect, it } from "vitest";
import {
  appendPeriodBoundedSlots,
  scopeSlotsByCupDayPreference,
  scopeSlotsByPreferredDayDistance,
} from "./competitionPreferredDayScope";

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

describe("appendPeriodBoundedSlots", () => {
  it("voegt periode-slots toe ook als voorkeursdagen al volstaan", () => {
    const dayOfWeekBySlot = new Map<number, number>([
      [0, 5],
      [1, 5],
      [2, 4],
      [3, 4],
      [4, 2],
      [5, 2],
    ]);
    const available = [0, 1, 2, 3, 4, 5];
    const scoped = scopeSlotsByPreferredDayDistance(
      available,
      5,
      2,
      (idx) => dayOfWeekBySlot.get(idx),
    );
    expect(scoped).toEqual([0, 1]);
    const merged = appendPeriodBoundedSlots(
      scoped,
      available,
      (idx) => idx >= 4,
    );
    expect(merged).toEqual([0, 1, 4, 5]);
  });
});

describe("scopeSlotsByCupDayPreference", () => {
  // Kuurne: 4× maandag, 4× donderdag, 4× vrijdag; beker mag maandag → donderdag.
  const kuurneDays = new Map<number, number>([
    [0, 1],
    [1, 4],
    [2, 5],
    [3, 1],
    [4, 4],
    [5, 5],
    [6, 1],
    [7, 4],
    [8, 5],
    [9, 1],
    [10, 4],
    [11, 5],
  ]);
  const allSlots = Array.from({ length: 12 }, (_, i) => i);
  const dayOfWeekForSlot = (idx: number) => kuurneDays.get(idx);

  it("blijft binnen de bekerdag als die volstaat", () => {
    const scoped = scopeSlotsByCupDayPreference(
      allSlots,
      4,
      dayOfWeekForSlot,
      [1, 4],
    );
    expect(scoped).toEqual([0, 3, 6, 9]);
  });

  it("wijkt pas naar de volgende voorkeursdag uit bij plaatsgebrek", () => {
    const scoped = scopeSlotsByCupDayPreference(
      allSlots,
      6,
      dayOfWeekForSlot,
      [1, 4],
    );
    expect(scoped.slice(0, 4)).toEqual([0, 3, 6, 9]);
    expect(scoped).toEqual([0, 3, 6, 9, 1, 4, 7, 10]);
    expect(scoped).not.toContain(2);
  });

  it("valt terug op de overige dagen als de voorkeursdagen te klein zijn", () => {
    const scoped = scopeSlotsByCupDayPreference(
      allSlots,
      10,
      dayOfWeekForSlot,
      [1, 4],
    );
    expect(scoped).toHaveLength(12);
    expect(scoped.slice(0, 8)).toEqual([0, 3, 6, 9, 1, 4, 7, 10]);
  });

  it("geeft niets terug zonder wedstrijden of slots", () => {
    expect(scopeSlotsByCupDayPreference(allSlots, 0, dayOfWeekForSlot, [1])).toEqual([]);
    expect(scopeSlotsByCupDayPreference([], 3, dayOfWeekForSlot, [1])).toEqual([]);
  });
});
