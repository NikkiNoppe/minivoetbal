import { describe, expect, it } from "vitest";
import {
  buildClosedCalendarPreviewRows,
  buildEmptyFreePreviewRows,
} from "./buildUnifiedPreview";
import type { SeasonPlan, SlotDetailLike } from "@/lib/seasonCalendar";
import { toMondayIso } from "@/lib/competitionPlanningEstimate";

function slot(
  venue: string,
  dayOfWeek: number,
  startTime: string,
): SlotDetailLike {
  return {
    venue,
    timeslot: {
      day_of_week: dayOfWeek,
      start_time: startTime,
      venue_id: 1,
      timeslot_id: dayOfWeek * 10 + Number(startTime.slice(0, 2)),
      valid_from: null,
      valid_until: null,
    },
  };
}

describe("buildEmptyFreePreviewRows", () => {
  const slotDetails: SlotDetailLike[] = [
    slot("Hal A", 1, "19:00"),
    slot("Hal A", 1, "20:00"),
    slot("Hal B", 5, "19:00"),
    slot("Hal B", 5, "20:00"),
  ];

  it("lijst resterende vrije slots op weken met preview-wedstrijden", () => {
    const free = buildEmptyFreePreviewRows({
      occupiedRows: [
        {
          phase: "cup",
          speeldag: "1/8",
          homeLabel: "A",
          awayLabel: "B",
          match_date: "2026-09-07", // maandag
          match_time: "19:00",
          venue: "Hal A",
          homeTeamId: 1,
          awayTeamId: 2,
        },
        {
          phase: "competition",
          speeldag: "Speeldag 1",
          homeLabel: "C",
          awayLabel: "D",
          match_date: "2026-09-11", // vrijdag
          match_time: "19:00",
          venue: "Hal B",
          homeTeamId: 3,
          awayTeamId: 4,
        },
      ],
      slotDetails,
    });

    expect(free).toHaveLength(2);
    expect(free.every((r) => r.phase === "free")).toBe(true);
    expect(free.map((r) => `${r.match_date}|${r.match_time}|${r.venue}`).sort()).toEqual([
      "2026-09-07|20:00|Hal A",
      "2026-09-11|20:00|Hal B",
    ]);
  });

  it("geeft niets terug zonder bezette rijen of extra weken", () => {
    expect(
      buildEmptyFreePreviewRows({
        occupiedRows: [],
        slotDetails,
      }),
    ).toEqual([]);
  });

  it("toont vrije slots op extra weekmaandagen zonder wedstrijden", () => {
    const free = buildEmptyFreePreviewRows({
      occupiedRows: [],
      slotDetails,
      extraWeekMondays: ["2026-09-14"],
    });
    expect(free.length).toBe(4);
    expect(free.every((r) => r.phase === "free")).toBe(true);
    expect(free.every((r) => r.match_date && toMondayIso(r.match_date) === "2026-09-14")).toBe(
      true,
    );
  });

  it("negeert BYE-rijen bij occupancy", () => {
    const free = buildEmptyFreePreviewRows({
      occupiedRows: [
        {
          phase: "competition",
          speeldag: "Speeldag 1",
          homeLabel: "A",
          awayLabel: "BYE",
          match_date: "2026-09-07",
          match_time: "00:00",
          venue: "BYE",
          homeTeamId: 1,
          awayTeamId: null,
        },
      ],
      slotDetails,
    });
    expect(free).toEqual([]);
  });
});

describe("buildClosedCalendarPreviewRows", () => {
  it("zet vakantie- en gesloten weken in de preview", () => {
    const plan = {
      weeks: [
        {
          weekMonday: "2026-11-02",
          phases: ["vacation"],
          freeCount: 0,
          configAvailableCount: 0,
          label: "Herfstvakantie",
        },
        {
          weekMonday: "2026-11-09",
          phases: ["competition"],
          freeCount: 8,
          configAvailableCount: 8,
        },
        {
          weekMonday: "2026-08-17",
          phases: ["blocked"],
          freeCount: 0,
          configAvailableCount: 0,
          label: "buiten speelperiode",
        },
      ],
    } as SeasonPlan;

    const rows = buildClosedCalendarPreviewRows(plan);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.phase).sort()).toEqual(["blocked", "vacation"]);
    expect(rows.find((r) => r.phase === "vacation")?.note).toMatch(/Herfst/);
  });
});
