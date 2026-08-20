import { describe, expect, it } from "vitest";
import type { UnifiedPreviewRow } from "./buildUnifiedPreview";
import {
  compareUnifiedPreviewRows,
  lastPlayableFriday,
  pinCupFinalToDate,
  relocateCupFinalToStandaloneDay,
  quietDayScore,
} from "./placeCupFinalOnQuietDay";

function row(
  partial: Partial<UnifiedPreviewRow> &
    Pick<UnifiedPreviewRow, "phase" | "speeldag" | "match_date">,
): UnifiedPreviewRow {
  return {
    homeLabel: partial.homeLabel ?? "A",
    awayLabel: partial.awayLabel ?? "B",
    match_time: partial.match_time ?? "20:00",
    ...partial,
  };
}

describe("compareUnifiedPreviewRows", () => {
  it("sorteert op datum, niet op ronde", () => {
    const r2 = row({
      phase: "competition",
      speeldag: "Speeldag 1",
      round: 2,
      match_date: "2026-10-01",
    });
    const r1 = row({
      phase: "competition",
      speeldag: "Speeldag 1",
      round: 1,
      match_date: "2026-12-01",
    });
    const finale = row({
      phase: "cup",
      speeldag: "Finale",
      match_date: "2026-09-01",
    });
    const sorted = [r2, finale, r1].sort(compareUnifiedPreviewRows);
    expect(sorted[0].speeldag).toBe("Finale");
    expect(sorted[1].round).toBe(2);
    expect(sorted[2].round).toBe(1);
  });
});

describe("relocateCupFinalToStandaloneDay", () => {
  it("verplaatst de finale naar een lege dag ná de halve finales", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "Halve Finale 1",
        match_date: "2027-06-07",
        match_time: "21:00",
      }),
      row({
        phase: "cup",
        speeldag: "Finale",
        match_date: "2027-06-07",
        match_time: "20:00",
      }),
      row({
        phase: "competition",
        speeldag: "Ronde 3 · Speeldag 10",
        match_date: "2027-06-07",
        round: 3,
      }),
      row({
        phase: "free",
        speeldag: "Vrij",
        match_date: "2027-06-21",
        match_time: "20:00",
        venue: "Sportpark Kuurne",
        homeLabel: "—",
        awayLabel: "—",
      }),
    ];
    const result = relocateCupFinalToStandaloneDay(rows);
    expect(result.moved).toBe(true);
    expect(result.toDate).toBe("2027-06-21");
    const finale = result.rows.find((r) => r.speeldag === "Finale");
    expect(finale?.match_date).toBe("2027-06-21");
    expect(result.rows.some((r) => r.phase === "free")).toBe(false);
  });

  it("laat de finale niet vóór de 1/8-finales zetten", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "Finale",
        match_date: "2026-12-07",
        match_time: "18:00",
      }),
      row({
        phase: "cup",
        speeldag: "1/8 Finale 1",
        match_date: "2026-12-14",
        match_time: "20:00",
      }),
      row({
        phase: "free",
        speeldag: "Vrij",
        match_date: "2027-06-21",
        match_time: "20:00",
        homeLabel: "—",
        awayLabel: "—",
      }),
    ];
    const result = relocateCupFinalToStandaloneDay(rows);
    expect(result.moved).toBe(true);
    expect(result.toDate).toBe("2027-06-21");
  });

  it("laat de finale staan als die dag al alleenstaand is", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "Halve Finale 1",
        match_date: "2027-06-07",
      }),
      row({
        phase: "cup",
        speeldag: "Finale",
        match_date: "2027-06-21",
        match_time: "21:00",
      }),
    ];
    const result = relocateCupFinalToStandaloneDay(rows);
    expect(result.moved).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it("zet de finale op het laatste vrije moment (vrijdag laat)", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "Halve Finale 1",
        match_date: "2027-06-07",
      }),
      row({
        phase: "cup",
        speeldag: "Finale",
        match_date: "2027-06-21",
        match_time: "20:00",
      }),
      row({
        phase: "free",
        speeldag: "Vrij",
        match_date: "2027-06-21",
        match_time: "21:00",
        homeLabel: "—",
        awayLabel: "—",
      }),
      row({
        phase: "free",
        speeldag: "Vrij",
        match_date: "2027-06-25",
        match_time: "18:00",
        homeLabel: "—",
        awayLabel: "—",
      }),
      row({
        phase: "free",
        speeldag: "Vrij",
        match_date: "2027-06-25",
        match_time: "21:00",
        homeLabel: "—",
        awayLabel: "—",
      }),
    ];
    const result = relocateCupFinalToStandaloneDay(rows);
    expect(result.moved).toBe(true);
    expect(result.toDate).toBe("2027-06-25");
    const finale = result.rows.find((r) => r.speeldag === "Finale");
    expect(finale?.match_time).toBe("21:00");
  });

  it("schuift de finale niet terug als die al later is dan het laatste vrije slot", () => {
    const rows: UnifiedPreviewRow[] = [
      row({
        phase: "cup",
        speeldag: "Finale",
        match_date: "2027-06-25",
        match_time: "21:00",
      }),
      row({
        phase: "free",
        speeldag: "Vrij",
        match_date: "2027-06-25",
        match_time: "18:00",
        homeLabel: "—",
        awayLabel: "—",
      }),
    ];
    const result = relocateCupFinalToStandaloneDay(rows);
    expect(result.moved).toBe(false);
  });
});

describe("lastPlayableFriday / pinCupFinalToDate", () => {
  it("neemt de vrijdag van de laatste speelweek", () => {
    expect(lastPlayableFriday(["2027-06-14", "2027-06-21"])).toBe("2027-06-25");
  });

  it("zet de finale op die vrijdag", () => {
    const plan = [
      {
        unique_number: "FINAL",
        speeldag: "Finale",
        match_date: "2027-06-07",
        match_time: "20:00",
        slot_index: 3,
      },
    ];
    expect(pinCupFinalToDate(plan, "2027-06-25")).toBe(true);
    expect(plan[0].match_date).toBe("2027-06-25");
    expect(plan[0].match_time).toBe("21:00");
    expect(plan[0].slot_index).toBe(-1);
  });
});

describe("quietDayScore", () => {
  it("kiest een lege dag boven een volle", () => {
    expect(quietDayScore("2027-06-21", 0, 4, true)).toBeGreaterThan(
      quietDayScore("2027-06-14", 8, 1, true),
    );
  });
});
