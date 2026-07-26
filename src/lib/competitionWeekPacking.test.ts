import { describe, expect, it } from "vitest";
import {
  buildPackFailureSuggestions,
  formatPackFailureMessage,
  hasSufficientSameWeekDayGap,
  isPackNearMiss,
  packCompetitionMatchdays,
  rotateMatchdaysByPool,
  shuffleArray,
  sumWeekCapacities,
  type PackableMatch,
} from "./competitionWeekPacking";

/** Simuleer 2 reeksen × 11 ploegen × 3 rondes (33 speeldagen, 5 wedstrijden/speeldag). */
function buildTwoOddDivisions(): PackableMatch[] {
  const matches: PackableMatch[] = [];
  const pools = [
    { key: "d1", teams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { key: "d2", teams: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
  ];
  for (const pool of pools) {
    for (let md = 1; md <= 33; md++) {
      const bye = (md - 1) % 11;
      const playing = pool.teams.filter((_, i) => i !== bye);
      for (let i = 0; i < playing.length; i += 2) {
        matches.push({
          home: playing[i],
          away: playing[i + 1],
          matchday: md,
          matchdayKey: `${pool.key}-${md}`,
        });
      }
    }
  }
  return matches;
}

describe("packCompetitionMatchdays", () => {
  it("pakt 330 wedstrijden in ~360 slots met gedeelde bekerweken (gereduceerde capaciteit)", () => {
    const matches = buildTwoOddDivisions();
    expect(matches).toHaveLength(330);

    const cupWeeks = new Set([4, 9, 14, 19, 24, 29]);
    const weekCount = 39;
    const weekCapacity = (w: number) => (cupWeeks.has(w) ? 5 : 10);
    const totalCap = sumWeekCapacities(weekCount, weekCapacity);
    expect(totalCap).toBe(360);

    const result = packCompetitionMatchdays(matches, weekCount, weekCapacity);
    expect(result.ok).toBe(true);
    if (result.ok) {
      let used = 0;
      for (const list of result.weekToMatches.values()) used += list.length;
      expect(used).toBe(330);
      let cupUsed = 0;
      for (const w of cupWeeks) {
        cupUsed += result.weekToMatches.get(w)?.length ?? 0;
      }
      expect(cupUsed).toBeGreaterThan(0);
    }
  });

  it("vult bekerweek-gaten die een exclusief-eerst cursor zou overslaan", () => {
    const matches: PackableMatch[] = [];
    for (let md = 1; md <= 6; md++) {
      matches.push(
        { home: 1, away: 2, matchday: md, matchdayKey: `p-${md}` },
        { home: 3, away: 4, matchday: md, matchdayKey: `p-${md}` },
      );
    }
    const caps = [2, 2, 2, 2, 2, 2];
    const result = packCompetitionMatchdays(matches, caps.length, (w) => caps[w]);
    expect(result.ok).toBe(true);
  });

  it("faalt duidelijk als totale capaciteit te klein is", () => {
    const matches = buildTwoOddDivisions();
    const weekCapacity = () => 5;
    const result = packCompetitionMatchdays(matches, 20, weekCapacity, {
      enableRepair: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const msg = formatPackFailureMessage({
        matchLabel: "Tweede klasse – Speeldag 33",
        homeId: result.failedMatch.home,
        awayId: result.failedMatch.away,
        placedCount: result.placedCount,
        totalMatches: matches.length,
        totalCap: 100,
        weekCount: 20,
        diagnosis: result.diagnosis,
        softShare: true,
        homeName: "Alpha",
        awayName: "Beta",
      });
      expect(msg).toMatch(/Alpha vs Beta|Bijna/);
      expect(msg).toMatch(/geplaatst|pasten/);
      expect(msg).toMatch(/Blokkades|vrije competitie-slots|Geen vrije/);
    }
  });

  it("diagnoseert ploegconflict ondanks vrije slots", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2" },
    ];
    const busy = new Map<number, Set<number>>([[1, new Set([1])]]);
    const result = packCompetitionMatchdays(matches, 2, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      enableRepair: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnosis.freeSlotsLeft).toBeGreaterThan(0);
      expect(result.diagnosis.weeksTeamCup).toBeGreaterThan(0);
      expect(result.diagnosis.sampleBlockedWeeks[0]?.blockingTeamIds).toContain(1);
      expect(
        formatPackFailureMessage({
          matchLabel: "Speeldag 2",
          homeId: 1,
          awayId: 3,
          placedCount: result.placedCount,
          totalMatches: 2,
          totalCap: 2,
          weekCount: 2,
          diagnosis: result.diagnosis,
          softShare: true,
        }),
      ).toMatch(/speelt al beker|vrije competitie-slots|Voorbeelden/);
    }
  });

  it("plaatst geen competitie voor teams die die week al beker spelen", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 3, away: 4, matchday: 1, matchdayKey: "p-1" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1, 2])]]);
    const result = packCompetitionMatchdays(matches, 2, () => 2, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w0 = result.weekToMatches.get(0) ?? [];
      const w1 = result.weekToMatches.get(1) ?? [];
      expect(w0.some((m) => m.home === 1 || m.away === 1)).toBe(false);
      expect(w0.some((m) => m.home === 3 && m.away === 4)).toBe(true);
      expect(w1.some((m) => m.home === 1 && m.away === 2)).toBe(true);
    }
  });

  it("repair verplaatst conflict zodat greedy-deadlock slaagt", () => {
    // w0: 1-2. w1: beker team 1. w2: beker team 3 (leeg).
    // 1-3 past nergens zonder repair; repair verplaatst 1-2 → w2, plaatst 1-3 → w0.
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2" },
    ];
    const busy = new Map<number, Set<number>>([
      [1, new Set([1])],
      [2, new Set([3])],
    ]);
    const caps = [1, 1, 1];

    const greedy = packCompetitionMatchdays(matches, 3, (w) => caps[w], {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      enableRepair: false,
    });
    expect(greedy.ok).toBe(false);

    const repaired = packCompetitionMatchdays(matches, 3, (w) => caps[w], {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      enableRepair: true,
    });
    expect(repaired.ok).toBe(true);
    if (repaired.ok) {
      const flat = [...repaired.weekToMatches.entries()].flatMap(([w, list]) =>
        list.map((m) => ({ w, ...m })),
      );
      expect(flat).toHaveLength(2);
      // Team 1 niet op bekerweek 1; team 3 niet op bekerweek 2 in 1-3
      expect(
        flat.some((x) => x.w === 1 && (x.home === 1 || x.away === 1)),
      ).toBe(false);
      const oneThree = flat.find((x) => x.home === 1 && x.away === 3);
      expect(oneThree?.w).toBe(0);
      const oneTwo = flat.find((x) => x.home === 1 && x.away === 2);
      expect(oneTwo?.w).toBe(2);
    }
  });

  it("repair forceert geen plaatsing op bekerweek", () => {
    // Enige vrije slot-weken zijn cup-busy voor team 1 → repair mag niet slagen
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2" },
    ];
    const busy = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set([1])],
    ]);
    const result = packCompetitionMatchdays(matches, 2, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      enableRepair: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnosis.weeksTeamCup).toBeGreaterThan(0);
      expect(result.diagnosis.repairAttempted).toBe(true);
    }
  });

  it("allowSameWeekCupOverlap plaatst pas op bekerweek als exclusief onmogelijk is", () => {
    // Alleen week 0 beschikbaar; team 1 speelt beker → zonder overlap: fail; met overlap: ok
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const denied = packCompetitionMatchdays(matches, 1, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowSameWeekCupOverlap: false,
      enableRepair: false,
    });
    expect(denied.ok).toBe(false);

    const allowed = packCompetitionMatchdays(matches, 1, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowSameWeekCupOverlap: true,
      enableRepair: false,
    });
    expect(allowed.ok).toBe(true);
  });

  it("preferentieert weken zonder beker boven same-week overlap", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const result = packCompetitionMatchdays(matches, 2, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowSameWeekCupOverlap: true,
      enableRepair: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.weekToMatches.get(0)).toHaveLength(0);
      expect(result.weekToMatches.get(1)?.[0]?.home).toBe(1);
    }
  });
});

describe("hasSufficientSameWeekDayGap", () => {
  it("ma→do/vr ok, ma→di/wo niet", () => {
    expect(hasSufficientSameWeekDayGap(1, 4)).toBe(true); // ma→do
    expect(hasSufficientSameWeekDayGap(1, 5)).toBe(true); // ma→vr
    expect(hasSufficientSameWeekDayGap(1, 2)).toBe(false);
    expect(hasSufficientSameWeekDayGap(1, 3)).toBe(false);
    expect(hasSufficientSameWeekDayGap(5, 1)).toBe(false); // verkeerde volgorde
  });
});

describe("rotateMatchdaysByPool / shuffleArray / near-miss", () => {
  it("roteert speeldagnr binnen pool zonder paren te wijzigen", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "d1-1" },
      { home: 3, away: 4, matchday: 1, matchdayKey: "d1-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "d1-2" },
      { home: 2, away: 4, matchday: 2, matchdayKey: "d1-2" },
    ];
    const rotated = rotateMatchdaysByPool(matches, 1);
    expect(rotated.find((m) => m.home === 1 && m.away === 2)?.matchday).toBe(2);
    expect(rotated.find((m) => m.home === 1 && m.away === 3)?.matchday).toBe(1);
    expect(rotated.every((m) => m.matchdayKey.endsWith(`-${m.matchday}`))).toBe(true);
  });

  it("orderByDifficulty plaatst cup-krappe paren eerder", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 3, away: 4, matchday: 1, matchdayKey: "p-1" },
    ];
    // Team 1 beker in week 0 → 1-2 heeft minder vrije weken
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const result = packCompetitionMatchdays(matches, 2, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      orderByDifficulty: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w0 = result.weekToMatches.get(0) ?? [];
      expect(w0).toHaveLength(1);
      expect(w0[0].home).toBe(3);
      expect(w0[0].away).toBe(4);
    }
  });

  it("shuffleArray wijzigt volgorde deterministisch met rng", () => {
    let n = 0;
    const rng = () => {
      n += 0.31;
      return n % 1;
    };
    expect(shuffleArray([1, 2, 3, 4], rng)).not.toEqual([1, 2, 3, 4]);
  });

  it("isPackNearMiss en formatPackFailureMessage Bijna-prefix", () => {
    expect(isPackNearMiss(326, 330)).toBe(true);
    expect(isPackNearMiss(10, 330)).toBe(false);
    const diagnosis = {
      freeSlotsLeft: 84,
      weeksChecked: 39,
      weeksFull: 21,
      weeksTeamCompetition: 18,
      weeksTeamCup: 0,
      repairAttempted: true,
      sampleBlockedWeeks: [
        { weekIndex: 5, reason: "team_competition" as const, blockingTeamIds: [1] },
      ],
    };
    const msg = formatPackFailureMessage({
      matchLabel: "Tweede klasse – Speeldag 33",
      homeId: 1,
      awayId: 2,
      placedCount: 326,
      totalMatches: 330,
      totalCap: 410,
      weekCount: 39,
      diagnosis,
      softShare: true,
      homeName: "De Dekkers",
      awayName: "MVC Young Boys 21",
    });
    expect(msg.startsWith("Bijna:")).toBe(true);
    expect(msg).toMatch(/De Dekkers/);
    expect(msg).toMatch(/Automatische verplaatsing/);
    expect(msg).toMatch(/Voorbeelden/);
    expect(msg).not.toMatch(/Helpt soms/);

    const tips = buildPackFailureSuggestions({
      diagnosis,
      placedCount: 327,
      totalMatches: 330,
      totalCap: 410,
      weekCount: 39,
      softShare: true,
      homeName: "Paniekzaaiers",
      awayName: "Icebears",
      homeId: 1,
      awayId: 2,
    });
    expect(tips.length).toBeGreaterThan(0);
    expect(tips[0].id).toBe("extend-season");
    expect(tips.some((t) => t.id === "fewer-rounds")).toBe(true);
    expect(tips.some((t) => t.id === "regenerate")).toBe(true);
    expect(tips[0].detail).toMatch(/Paniekzaaiers/);
  });
});
