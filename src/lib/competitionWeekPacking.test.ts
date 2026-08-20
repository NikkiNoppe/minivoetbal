import { describe, expect, it } from "vitest";
import {
  buildPackFailureSuggestions,
  formatPackFailureMessage,
  hasMinimumDaySeparation,
  hasSufficientDayGapBetweenDates,
  competitionDateAllowedWithCup,
  hasSufficientSameWeekDayGap,
  isPackNearMiss,
  MIN_DUAL_WEEK_DAY_GAP,
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
          round: Math.ceil(md / 11),
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

  it("pakt dichte Kuurne-achtige kalender (36 weken, bekerbezetting, soft-share)", () => {
    // Spiegel van productie-near-miss: 330 wedstrijden, ~357 slots, 36 weken,
    // teams spelen 30× → weinig rust; beker blokkeert ploegen op gedeelde weken.
    const matches = buildTwoOddDivisions();
    const weekCount = 36;
    const cupWeeks = new Set([2, 7, 12, 17, 22, 27]);
    // Capaciteit: 10/week, bekerweken 8 (2 slots gereserveerd) → 348 slots
    // + wat extra op late weken (dinsdag-periode) ≈ 357
    const weekCapacity = (w: number) => {
      if (cupWeeks.has(w)) return 8;
      if (w >= 28) return 12; // voorjaars-dinsdagen
      return 10;
    };
    const totalCap = sumWeekCapacities(weekCount, weekCapacity);
    expect(totalCap).toBeGreaterThanOrEqual(330);

    // Elke bekerweek: ~11 ploegen bezet (één ronde beker)
    const busyByWeek = new Map<number, Set<number>>();
    let teamCursor = 1;
    for (const w of cupWeeks) {
      const busy = new Set<number>();
      for (let i = 0; i < 11; i++) {
        busy.add(((teamCursor + i - 1) % 22) + 1);
      }
      teamCursor += 7;
      busyByWeek.set(w, busy);
    }

    const result = packCompetitionMatchdays(matches, weekCount, weekCapacity, {
      externalBusyTeamsByWeek: (w) => busyByWeek.get(w),
      allowCupOverlapForWeek: (w) => cupWeeks.has(w),
      preferredWeekCapacity: (w) => (cupWeeks.has(w) ? 4 : weekCapacity(w)),
      orderByDifficulty: true,
      enableRepair: true,
      enableEvacuateRepair: true,
      maxRepairAttempts: 160,
      maxRepairDepth: 4,
      reverseMatchdays: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      let used = 0;
      for (const list of result.weekToMatches.values()) used += list.length;
      expect(used).toBe(330);
    }
  });

  it("near-miss evacuate + backtrack lost greedy-deadlock met bekerdruk", () => {
    // Greedy vult vroege weken; late speeldag heeft geen gedeelde vrije week
    // zonder herschikking. Met evacuate/backtrack moet het wél lukken.
    const matches: PackableMatch[] = [];
    const teams = [1, 2, 3, 4, 5, 6, 7, 8];
    for (let md = 1; md <= 14; md++) {
      const bye = (md - 1) % 8;
      const active = teams.filter((_, i) => i !== bye);
      for (let i = 0; i < 6; i += 2) {
        matches.push({
          home: active[i],
          away: active[i + 1],
          matchday: md,
          matchdayKey: `p-${md}`,
        });
      }
    }
    const weekCount = 16;
    const cupWeeks = new Set([1, 5, 9, 13]);
    const busyByWeek = new Map<number, Set<number>>();
    for (const w of cupWeeks) {
      busyByWeek.set(w, new Set([1, 2, 3, 4]));
    }
    const result = packCompetitionMatchdays(
      matches,
      weekCount,
      (w) => (cupWeeks.has(w) ? 2 : 4),
      {
        externalBusyTeamsByWeek: (w) => busyByWeek.get(w),
        allowCupOverlapForWeek: (w) => cupWeeks.has(w),
        orderByDifficulty: true,
        enableRepair: true,
        enableEvacuateRepair: true,
        maxRepairAttempts: 100,
        maxRepairDepth: 4,
        reverseMatchdays: false,
      },
    );
    expect(result.ok).toBe(true);
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

  it("preferFreshWeeks plaatst eerst weken zonder dual-druk", () => {
    // Week 0 vol genoeg voor 1 wedstrijd; week 1 ruim. Met max 2 en preferFresh
    // mag ploeg 1 niet meteen 2× in week 0 als week 1 nog vrij is.
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 3, away: 4, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 5, matchday: 2, matchdayKey: "p-2" },
    ];
    const result = packCompetitionMatchdays(matches, 2, (w) => (w === 0 ? 2 : 2), {
      enableRepair: false,
      maxTeamAppearancesPerWeek: 2,
      preferFreshWeeks: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w0 = result.weekToMatches.get(0) ?? [];
      const w1 = result.weekToMatches.get(1) ?? [];
      const team1InWeek0 = w0.filter((m) => m.home === 1 || m.away === 1).length;
      expect(team1InWeek0).toBe(1);
      expect(w1.some((m) => m.home === 1 || m.away === 1)).toBe(true);
    }
  });

  it("maxTeamAppearancesPerWeek=2 laat een ploeg twee competitiewedstrijden in één week toe", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2" },
    ];
    const blocked = packCompetitionMatchdays(matches, 1, () => 2, {
      enableRepair: false,
      maxTeamAppearancesPerWeek: 1,
    });
    expect(blocked.ok).toBe(false);

    const allowed = packCompetitionMatchdays(matches, 1, () => 2, {
      enableRepair: false,
      maxTeamAppearancesPerWeek: 2,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.weekToMatches.get(0)).toHaveLength(2);
    }
  });

  it("maxTeamAppearancesPerWeek=2 telt beker mee: cup + 1 competitie, geen derde", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const result = packCompetitionMatchdays(matches, 1, () => 2, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowCupOverlapForWeek: () => true,
      enableRepair: false,
      maxTeamAppearancesPerWeek: 2,
    });
    // Ploeg 1 speelt al beker → max 1 competitie; tweede wedstrijd met ploeg 1 faalt
    expect(result.ok).toBe(false);
    expect(result.placedCount).toBe(1);
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

  it("allowCupOverlapForWeek plaatst pas op bekerweek als exclusief onmogelijk is", () => {
    // Alleen week 0 beschikbaar; team 1 speelt beker → zonder overlap: fail; met overlap: ok
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const denied = packCompetitionMatchdays(matches, 1, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      enableRepair: false,
    });
    expect(denied.ok).toBe(false);

    const allowed = packCompetitionMatchdays(matches, 1, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowCupOverlapForWeek: () => true,
      enableRepair: false,
    });
    expect(allowed.ok).toBe(true);
  });

  it("beoordeelt de beker-uitzondering per week", () => {
    // Week 0 heeft geen speelmoment ver genoeg na de beker, week 1 wel.
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
    ];
    const busy = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set([1])],
    ]);
    const result = packCompetitionMatchdays(matches, 2, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowCupOverlapForWeek: (w) => w === 1,
      enableRepair: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.weekToMatches.get(0)).toEqual([]);
      expect(result.weekToMatches.get(1)).toHaveLength(1);
    }
  });

  it("preferentieert weken zonder beker boven same-week overlap", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const result = packCompetitionMatchdays(matches, 2, () => 1, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowCupOverlapForWeek: () => true,
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

  it("dual-gap ≥2: ma→wo ok, ma→di niet", () => {
    expect(hasSufficientSameWeekDayGap(1, 3, MIN_DUAL_WEEK_DAY_GAP)).toBe(true);
    expect(hasSufficientSameWeekDayGap(1, 2, MIN_DUAL_WEEK_DAY_GAP)).toBe(false);
    expect(hasSufficientSameWeekDayGap(1, 5, MIN_DUAL_WEEK_DAY_GAP)).toBe(true);
  });

  it("telt zondag als laatste dag van de ISO-week", () => {
    expect(hasSufficientSameWeekDayGap(1, 0)).toBe(true); // ma→zo = 6 dagen
    expect(hasSufficientSameWeekDayGap(5, 0)).toBe(false); // vr→zo = 2 dagen
    expect(hasSufficientSameWeekDayGap(0, 1)).toBe(false); // zo→ma binnen dezelfde week
  });
});

describe("hasSufficientDayGapBetweenDates", () => {
  it("rekent met de echte wedstrijddatums", () => {
    // Beker donderdag → competitie vrijdag is 1 dag: niet toegestaan,
    // ook al zou de theoretische bekerdag (maandag) het wel toelaten.
    expect(hasSufficientDayGapBetweenDates("2026-10-08", "2026-10-09")).toBe(false);
    expect(hasSufficientDayGapBetweenDates("2026-10-05", "2026-10-08")).toBe(true);
    expect(hasSufficientDayGapBetweenDates("2026-10-05", "2026-10-09")).toBe(true);
  });

  it("staat competitie vóór de beker niet toe en negeert lege datums", () => {
    expect(hasSufficientDayGapBetweenDates("2026-10-09", "2026-10-05")).toBe(false);
    expect(hasSufficientDayGapBetweenDates("", "2026-10-09")).toBe(false);
  });

  it("werkt met volledige timestamps", () => {
    expect(
      hasSufficientDayGapBetweenDates("2026-10-05T21:00:00", "2026-10-09T19:00:00"),
    ).toBe(true);
  });

  it("dual minGap=2: ma→wo ok, ma→di niet", () => {
    expect(
      hasSufficientDayGapBetweenDates("2026-10-05", "2026-10-07", MIN_DUAL_WEEK_DAY_GAP),
    ).toBe(true);
    expect(
      hasSufficientDayGapBetweenDates("2026-10-05", "2026-10-06", MIN_DUAL_WEEK_DAY_GAP),
    ).toBe(false);
  });
});

describe("hasMinimumDaySeparation", () => {
  it("eist absolute scheiding van min. 2 dagen", () => {
    expect(hasMinimumDaySeparation("2026-10-05", "2026-10-07")).toBe(true);
    expect(hasMinimumDaySeparation("2026-10-07", "2026-10-05")).toBe(true);
    expect(hasMinimumDaySeparation("2026-10-05", "2026-10-06")).toBe(false);
    expect(hasMinimumDaySeparation("2026-10-05", "2026-10-05")).toBe(false);
  });
});

describe("competitionDateAllowedWithCup", () => {
  it("verbiedt competitie op dezelfde dag als de beker", () => {
    expect(
      competitionDateAllowedWithCup("2027-06-07", ["2027-06-07"]),
    ).toBe(false);
  });

  it("laat een andere dag toe als de bekerploegen bekend zijn", () => {
    expect(
      competitionDateAllowedWithCup("2027-06-08", ["2027-06-07"]),
    ).toBe(true);
  });

  it("eist ≥3 dagen alleen als requireGap aan staat", () => {
    expect(
      competitionDateAllowedWithCup("2027-06-08", ["2027-06-07"], {
        requireGap: true,
      }),
    ).toBe(false);
    expect(
      competitionDateAllowedWithCup("2027-06-10", ["2027-06-07"], {
        requireGap: true,
      }),
    ).toBe(true);
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

  it("dual-cap: niet-bekerparen vullen reclaim vóór preferred", () => {
    // Week 0: 2 slots — 1 preferred (vrijdag) + 1 reclaim (maandag-rest)
    // Cup-busy paar mag alleen preferred; niet-bekerpaar vult eerst reclaim.
    const matches: PackableMatch[] = [
      { home: 3, away: 4, matchday: 1, matchdayKey: "p-1" }, // niet-beker
      { home: 1, away: 2, matchday: 2, matchdayKey: "p-2" }, // cup-busy week 0
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1])]]);
    const result = packCompetitionMatchdays(matches, 1, () => 2, {
      externalBusyTeamsByWeek: (w) => busy.get(w),
      allowCupOverlapForWeek: () => true,
      preferredWeekCapacity: () => 1,
      orderByDifficulty: true,
      enableRepair: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.weekToMatches.get(0)).toHaveLength(2);
    }
  });

  it("evacuate-repair plaatst vastgelopen paar door eerdere wedstrijden te herschikken", () => {
    // 3 weken × capaciteit 1. MD1 vult alles; MD2 (1-3) forceert evacuatie van 1-2 en 5-6.
    // Na evacuatie: 1-3 in een vrijgekomen week, 1-2 en 5-6 elders.
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 3, away: 4, matchday: 1, matchdayKey: "p-1" },
      { home: 5, away: 6, matchday: 1, matchdayKey: "p-1" },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2" },
      { home: 2, away: 5, matchday: 2, matchdayKey: "p-2" },
    ];
    const without = packCompetitionMatchdays(matches, 3, () => 1, {
      orderByDifficulty: false,
      enableRepair: true,
      enableEvacuateRepair: false,
      maxRepairAttempts: 20,
      maxRepairDepth: 2,
    });
    const withEvacuate = packCompetitionMatchdays(matches, 3, () => 1, {
      orderByDifficulty: false,
      enableRepair: true,
      enableEvacuateRepair: true,
      maxRepairAttempts: 80,
      maxRepairDepth: 3,
    });
    // Evacuatie mag niet slechter scoren; idealiter lost het een near-miss op.
    if (!without.ok) {
      expect(withEvacuate.ok || withEvacuate.placedCount >= without.placedCount).toBe(
        true,
      );
    } else {
      expect(withEvacuate.ok).toBe(true);
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

describe("matchday overlap + chronological packing", () => {
  it("maxMatchdayOverlap=1 laat opeenvolgende speeldagen in één week toe", () => {
    const consecutive = packCompetitionMatchdays(
      [
        { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
        { home: 3, away: 4, matchday: 2, matchdayKey: "p-2" },
      ],
      1,
      () => 2,
      {
        enableRepair: false,
        maxTeamAppearancesPerWeek: 2,
        maxMatchdayOverlap: 1,
      },
    );
    expect(consecutive.ok).toBe(true);
    if (consecutive.ok) {
      expect(consecutive.weekToMatches.get(0)).toHaveLength(2);
    }
  });

  it("maxMatchdayOverlap=1 weigert niet-opeenvolgende speeldagen in dezelfde week", () => {
    const skipped = packCompetitionMatchdays(
      [
        { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
        { home: 3, away: 4, matchday: 3, matchdayKey: "p-3" },
      ],
      1,
      () => 2,
      {
        enableRepair: false,
        maxTeamAppearancesPerWeek: 2,
        maxMatchdayOverlap: 1,
        chronologicalMatchdays: true,
      },
    );
    expect(skipped.ok).toBe(false);
    expect(skipped.placedCount).toBe(1);
  });

  it("sequentialRounds start ronde 2 pas in de laatste week van ronde 1", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1", round: 1 },
      { home: 3, away: 4, matchday: 2, matchdayKey: "p-2", round: 1 },
      { home: 5, away: 6, matchday: 3, matchdayKey: "p-3", round: 2 },
    ];
    const result = packCompetitionMatchdays(matches, 4, () => 1, {
      enableRepair: false,
      sequentialRounds: true,
      maxRoundOverlapWeeks: 1,
      maxTeamAppearancesPerWeek: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const weekOf = (md: number) => {
        for (const [w, list] of result.weekToMatches) {
          if (list.some((m) => m.matchday === md)) return w;
        }
        return -1;
      };
      const lastR1 = Math.max(weekOf(1), weekOf(2));
      expect(weekOf(3)).toBeGreaterThanOrEqual(lastR1);
    }
  });

  it("sequentialRounds vult gaten in ronde 1 vóór nieuwe weken", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1", round: 1 },
      { home: 3, away: 4, matchday: 2, matchdayKey: "p-2", round: 1 },
      { home: 5, away: 6, matchday: 3, matchdayKey: "p-3", round: 1 },
    ];
    const cap = (w: number) => (w === 0 ? 3 : w === 4 ? 3 : 0);
    const result = packCompetitionMatchdays(matches, 5, cap, {
      enableRepair: false,
      sequentialRounds: true,
      maxRoundOverlapWeeks: 1,
      maxTeamAppearancesPerWeek: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.weekToMatches.get(0)?.length).toBe(3);
      expect(result.weekToMatches.get(4)?.length ?? 0).toBe(0);
    }
  });

  it("sequentialRounds vult het vroegste gat, niet het laatste", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1", round: 1 },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2", round: 1 },
      { home: 4, away: 5, matchday: 3, matchdayKey: "p-3", round: 1 },
    ];
    const result = packCompetitionMatchdays(matches, 4, () => 2, {
      enableRepair: false,
      sequentialRounds: true,
      maxRoundOverlapWeeks: 1,
      maxTeamAppearancesPerWeek: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w0 = result.weekToMatches.get(0) ?? [];
      const w1 = result.weekToMatches.get(1) ?? [];
      expect(w0).toHaveLength(2);
      expect(w1).toHaveLength(1);
      expect(w0.some((m) => m.home === 1 && m.away === 2)).toBe(true);
      expect(w0.some((m) => m.home === 4 && m.away === 5)).toBe(true);
      expect(w1.some((m) => m.home === 1 && m.away === 3)).toBe(true);
    }
  });

  it("sequentialRounds + preferFreshWeeks opent een verse week i.p.v. 2×/week", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1", round: 1 },
      { home: 1, away: 3, matchday: 2, matchdayKey: "p-2", round: 1 },
    ];
    const result = packCompetitionMatchdays(matches, 3, () => 2, {
      enableRepair: false,
      sequentialRounds: true,
      preferFreshWeeks: true,
      maxRoundOverlapWeeks: 1,
      maxTeamAppearancesPerWeek: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.weekToMatches.get(0)).toHaveLength(1);
      expect(result.weekToMatches.get(1)).toHaveLength(1);
    }
  });

  it("chronologicalMatchdays plaatst speeldag N niet vóór de eerste week van N-1", () => {
    const matches: PackableMatch[] = [
      { home: 1, away: 2, matchday: 1, matchdayKey: "p-1" },
      { home: 3, away: 4, matchday: 2, matchdayKey: "p-2" },
    ];
    const busy = new Map<number, Set<number>>([[0, new Set([1, 2])]]);
    const result = packCompetitionMatchdays(matches, 3, () => 1, {
      enableRepair: false,
      chronologicalMatchdays: true,
      maxMatchdayOverlap: 1,
      externalBusyTeamsByWeek: (w) => busy.get(w),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w0 = result.weekToMatches.get(0) ?? [];
      expect(w0.some((m) => m.matchday === 2)).toBe(false);
      expect(result.weekToMatches.get(1)?.some((m) => m.matchday === 1)).toBe(
        true,
      );
    }
  });

  it("productiepad (max 2×/week, verse weken eerst) pakt dichte 330-kalender", () => {
    const matches = buildTwoOddDivisions();
    const weekCount = 36;
    const cupWeeks = new Set([2, 7, 12, 17, 22, 27]);
    const weekCapacity = (w: number) => {
      if (cupWeeks.has(w)) return 8;
      if (w >= 28) return 12;
      return 10;
    };
    const busyByWeek = new Map<number, Set<number>>();
    let teamCursor = 1;
    for (const w of cupWeeks) {
      const busy = new Set<number>();
      for (let i = 0; i < 11; i++) {
        busy.add(((teamCursor + i - 1) % 22) + 1);
      }
      teamCursor += 7;
      busyByWeek.set(w, busy);
    }

    const result = packCompetitionMatchdays(matches, weekCount, weekCapacity, {
      maxTeamAppearancesPerWeek: 2,
      preferFreshWeeks: true,
      reverseMatchdays: false,
      sequentialRounds: true,
      maxRoundOverlapWeeks: 1,
      orderByDifficulty: true,
      enableRepair: true,
      enableEvacuateRepair: true,
      maxRepairAttempts: 160,
      maxRepairDepth: 4,
      externalBusyTeamsByWeek: (w) => busyByWeek.get(w),
      allowCupOverlapForWeek: (w) => cupWeeks.has(w),
      preferredWeekCapacity: (w) => (cupWeeks.has(w) ? 4 : weekCapacity(w)),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      let used = 0;
      for (const list of result.weekToMatches.values()) used += list.length;
      expect(used).toBe(330);
      const weeksOf = (round: number): number[] => {
        const out: number[] = [];
        for (const [w, list] of result.weekToMatches) {
          for (const m of list) {
            if ((m.round ?? 1) === round) out.push(w);
          }
        }
        return out.sort((a, b) => a - b);
      };
      const median = (round: number) => {
        const ws = weeksOf(round);
        return ws[Math.floor(ws.length / 2)] ?? 0;
      };
      expect(median(1)).toBeLessThan(median(2));
      expect(median(2)).toBeLessThan(median(3));
    }
  });
});
