import { describe, expect, it } from "vitest";
import {
  analyzePreviewTeamConflicts,
  conflictLookup,
  previewConflictCellKey,
} from "./previewScheduleConflicts";
import type { UnifiedPreviewRow } from "./buildUnifiedPreview";

function row(
  partial: Partial<UnifiedPreviewRow> &
    Pick<UnifiedPreviewRow, "phase" | "speeldag" | "match_date">,
): UnifiedPreviewRow {
  return {
    homeLabel: partial.homeLabel ?? "A",
    awayLabel: partial.awayLabel ?? "B",
    ...partial,
  };
}

describe("analyzePreviewTeamConflicts", () => {
  it("markeert oranje bij 2× dezelfde week", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "1/8 1",
        match_date: "2027-04-19",
        match_time: "21:00",
        homeTeamId: 1,
        awayTeamId: null,
        homeLabel: "Vagant",
        awayLabel: "—",
      }),
      row({
        phase: "competition",
        speeldag: "Speeldag 1",
        match_date: "2027-04-20",
        match_time: "20:00",
        homeTeamId: 1,
        awayTeamId: 2,
        homeLabel: "Vagant",
        awayLabel: "Other",
      }),
    ];
    const map = conflictLookup(analyzePreviewTeamConflicts(rows));
    expect(map.get(previewConflictCellKey(rows[0], "home", 1))?.kind).toBe("double");
    expect(map.get(previewConflictCellKey(rows[1], "home", 1))?.kind).toBe("double");
  });

  it("markeert groen alleen op competitie in de overlap-week, niet op vroege beker", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "1/8 4",
        match_date: "2027-04-19",
        match_time: "21:00",
        homeTeamId: 10,
        homeLabel: "De Vagant",
        awayLabel: "—",
      }),
      row({
        phase: "cup",
        speeldag: "QF 1",
        match_date: "2027-05-24",
        match_time: "20:00",
        homeTeamId: null,
        awayTeamId: null,
        homeLabel: "—",
        awayLabel: "—",
      }),
      row({
        phase: "competition",
        speeldag: "Speeldag 30",
        match_date: "2027-05-25",
        match_time: "19:00",
        homeTeamId: 10,
        awayTeamId: 11,
        homeLabel: "De Vagant",
        awayLabel: "Rival",
      }),
    ];
    const map = conflictLookup(analyzePreviewTeamConflicts(rows));
    expect(map.get(previewConflictCellKey(rows[0], "home", 10))).toBeUndefined();
    expect(map.get(previewConflictCellKey(rows[2], "home", 10))?.kind).toBe(
      "advance_risk",
    );
  });
});
