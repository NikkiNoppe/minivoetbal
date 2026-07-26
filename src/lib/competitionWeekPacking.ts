/**
 * Greedy week-packing for competition matchdays + limited repair.
 * Chronologisch: geen bekerweken overslaan (anders blijven vroege gaten onbereikbaar).
 * Fallback vanaf week 0 vult restgaten bij teamconflicten.
 * Bij stuck: verplaats conflicterende competitie-wedstrijd (beker blijft hard).
 */

export type PackableMatch = {
  home: number;
  away: number;
  matchday?: number;
  matchdayKey: string;
};

export type PackFailureReason =
  | "week_full"
  | "team_competition"
  | "team_cup"
  | "ok";

export type PackFailureDiagnosis = {
  freeSlotsLeft: number;
  weeksChecked: number;
  weeksFull: number;
  weeksTeamCompetition: number;
  weeksTeamCup: number;
  /** Repair geprobeerd maar geen legale verplaatsing gevonden */
  repairAttempted?: boolean;
  /** Eerste weken die wél capaciteit hadden maar team-blokkade */
  sampleBlockedWeeks: Array<{
    weekIndex: number;
    reason: Exclude<PackFailureReason, "ok" | "week_full">;
    /** Ploegen die deze week blokkeren (beker of al competitie) */
    blockingTeamIds: number[];
  }>;
};

export type PackWeekResult =
  | { ok: true; weekToMatches: Map<number, PackableMatch[]> }
  | {
      ok: false;
      failedMatch: PackableMatch;
      placedCount: number;
      weekToMatches: Map<number, PackableMatch[]>;
      diagnosis: PackFailureDiagnosis;
    };

export type PackCompetitionOptions = {
  /**
   * Teams die die week al beker spelen — standaard geen competitie dezelfde week.
   * Met allowSameWeekCupOverlap: alleen als laatste redmiddel toegestaan.
   */
  externalBusyTeamsByWeek?: (weekIndex: number) => ReadonlySet<number> | undefined;
  /**
   * Uitzonderlijk: plaats op een bekerweek ondanks cup-busy team, als packing
   * anders vastloopt. Vereist voldoende dagspreiding (slotfase: ≥3 dagen, bv. ma→do/vr).
   */
  allowSameWeekCupOverlap?: boolean;
  /** Shuffle wedstrijdvolgorde binnen een speeldag (andere packing t.o.v. beker). */
  shuffleWithinMatchday?: boolean;
  /**
   * Plaats eerst paren met minste weken waar beide vrij zijn t.o.v. beker
   * (binnen een speeldag; overschrijft pure shuffle-volgorde).
   */
  orderByDifficulty?: boolean;
  /** Limited repair bij stuck (default true). */
  enableRepair?: boolean;
  /** Max verplaatsingspogingen per stuck match (default 50). */
  maxRepairAttempts?: number;
  /** Max hops: 1 = alleen direct conflict verplaatsen; 2 = ook hun blocker (default 2). */
  maxRepairDepth?: number;
  rng?: () => number;
};

/** Min. verschil in day_of_week (ma=1 … zo=0) voor beker+competitie dezelfde week. */
export const MIN_SAME_WEEK_DAY_GAP = 3;

/** True als competitiedag ≥3 dagen na bekerdag valt in dezelfde week (bv. ma→do/vr). */
export function hasSufficientSameWeekDayGap(
  cupDayOfWeek: number,
  competitionDayOfWeek: number,
): boolean {
  if (
    !Number.isFinite(cupDayOfWeek) ||
    !Number.isFinite(competitionDayOfWeek) ||
    cupDayOfWeek < 0 ||
    cupDayOfWeek > 6 ||
    competitionDayOfWeek < 0 ||
    competitionDayOfWeek > 6
  ) {
    return false;
  }
  return competitionDayOfWeek - cupDayOfWeek >= MIN_SAME_WEEK_DAY_GAP;
}

const DEFAULT_MAX_REPAIR_ATTEMPTS = 50;
const DEFAULT_MAX_REPAIR_DEPTH = 2;

/** Fisher–Yates; mutates a copy. */
export function shuffleArray<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * Roteer speeldagnummers binnen elke pool (ronde blijft geldige RR).
 * offset=1 → oude speeldag 1 wordt 2, … laatste wordt 1.
 */
export function rotateMatchdaysByPool<
  T extends { matchday: number; matchdayKey: string },
>(matches: T[], offset: number): T[] {
  if (offset === 0 || matches.length === 0) return matches;
  const byPool = new Map<string, number[]>();
  for (const m of matches) {
    const pool = parsePoolKey(m.matchdayKey);
    const list = byPool.get(pool) ?? [];
    if (!list.includes(m.matchday)) list.push(m.matchday);
    byPool.set(pool, list);
  }
  const remap = new Map<string, Map<number, number>>();
  for (const [pool, mds] of byPool) {
    const sorted = [...mds].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) continue;
    const off = ((offset % n) + n) % n;
    const map = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      map.set(sorted[i], sorted[(i + off) % n]);
    }
    remap.set(pool, map);
  }
  return matches.map((m) => {
    const pool = parsePoolKey(m.matchdayKey);
    const map = remap.get(pool);
    const newMd = map?.get(m.matchday) ?? m.matchday;
    if (newMd === m.matchday) return m;
    return {
      ...m,
      matchday: newMd,
      matchdayKey: `${pool}-${newMd}`,
    };
  });
}

export function parsePoolKey(matchdayKey: string): string {
  const idx = matchdayKey.lastIndexOf("-");
  if (idx <= 0) return "all";
  return matchdayKey.slice(0, idx);
}

export function comparePackMatchdayKeys(a: string, b: string): number {
  const mdA = Number(a.slice(a.lastIndexOf("-") + 1)) || 0;
  const mdB = Number(b.slice(b.lastIndexOf("-") + 1)) || 0;
  if (mdA !== mdB) return mdA - mdB;
  return a.localeCompare(b);
}

/** Aantal weken waar beide ploegen vrij zijn t.o.v. beker (capaciteit genegeerd). */
export function countCupFreeWeeksForPair(
  home: number,
  away: number,
  weekCount: number,
  externalBusyTeamsByWeek?: (weekIndex: number) => ReadonlySet<number> | undefined,
): number {
  let n = 0;
  for (let w = 0; w < weekCount; w++) {
    const busy = externalBusyTeamsByWeek?.(w);
    if (busy && (busy.has(home) || busy.has(away))) continue;
    n += 1;
  }
  return n;
}

function matchesEqual(a: PackableMatch, b: PackableMatch): boolean {
  return (
    a.home === b.home &&
    a.away === b.away &&
    a.matchdayKey === b.matchdayKey
  );
}

function diagnosePlacementFailure(
  m: PackableMatch,
  weekCount: number,
  weekCapacity: (weekIndex: number) => number,
  weekToMatches: Map<number, PackableMatch[]>,
  teamsPerWeek: Map<number, Set<number>>,
  options?: PackCompetitionOptions,
  repairAttempted?: boolean,
): PackFailureDiagnosis {
  let freeSlotsLeft = 0;
  let weeksFull = 0;
  let weeksTeamCompetition = 0;
  let weeksTeamCup = 0;
  const sampleBlockedWeeks: PackFailureDiagnosis["sampleBlockedWeeks"] = [];

  for (let w = 0; w < weekCount; w++) {
    const cap = weekCapacity(w);
    const used = weekToMatches.get(w)?.length ?? 0;
    const free = Math.max(0, cap - used);
    freeSlotsLeft += free;
    if (free <= 0) {
      weeksFull += 1;
      continue;
    }
    const teamSet = teamsPerWeek.get(w) ?? new Set();
    if (teamSet.has(m.home) || teamSet.has(m.away)) {
      weeksTeamCompetition += 1;
      if (sampleBlockedWeeks.length < 3) {
        const blockingTeamIds: number[] = [];
        if (teamSet.has(m.home)) blockingTeamIds.push(m.home);
        if (teamSet.has(m.away)) blockingTeamIds.push(m.away);
        sampleBlockedWeeks.push({
          weekIndex: w,
          reason: "team_competition",
          blockingTeamIds,
        });
      }
      continue;
    }
    const busy = options?.externalBusyTeamsByWeek?.(w);
    if (busy && (busy.has(m.home) || busy.has(m.away))) {
      weeksTeamCup += 1;
      if (sampleBlockedWeeks.length < 3) {
        const blockingTeamIds: number[] = [];
        if (busy.has(m.home)) blockingTeamIds.push(m.home);
        if (busy.has(m.away)) blockingTeamIds.push(m.away);
        sampleBlockedWeeks.push({
          weekIndex: w,
          reason: "team_cup",
          blockingTeamIds,
        });
      }
    }
  }

  return {
    freeSlotsLeft,
    weeksChecked: weekCount,
    weeksFull,
    weeksTeamCompetition,
    weeksTeamCup,
    repairAttempted,
    sampleBlockedWeeks,
  };
}

/**
 * @param weekCapacity capaciteit per week-index (reeds gecorrigeerd voor beker-dag soft-share)
 */
export function packCompetitionMatchdays(
  matches: PackableMatch[],
  weekCount: number,
  weekCapacity: (weekIndex: number) => number,
  options?: PackCompetitionOptions,
): PackWeekResult {
  const teamsPerWeek: Map<number, Set<number>> = new Map();
  const weekToMatches: Map<number, PackableMatch[]> = new Map();
  for (let w = 0; w < weekCount; w++) {
    teamsPerWeek.set(w, new Set());
    weekToMatches.set(w, []);
  }

  const byMatchday = new Map<string, PackableMatch[]>();
  for (const m of matches) {
    const arr = byMatchday.get(m.matchdayKey) ?? [];
    arr.push(m);
    byMatchday.set(m.matchdayKey, arr);
  }

  const currentWeekByPool = new Map<string, number>();
  const sorted = Array.from(byMatchday.keys()).sort(comparePackMatchdayKeys);
  let placedCount = 0;
  const enableRepair = options?.enableRepair !== false;
  const allowSameWeekCup = Boolean(options?.allowSameWeekCupOverlap);
  const maxRepairAttempts = options?.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
  const maxRepairDepth = options?.maxRepairDepth ?? DEFAULT_MAX_REPAIR_DEPTH;
  let repairBudget = maxRepairAttempts;
  let repairAttempted = false;

  const isCupBusy = (w: number, home: number, away: number): boolean => {
    const busy = options?.externalBusyTeamsByWeek?.(w);
    return Boolean(busy && (busy.has(home) || busy.has(away)));
  };

  /** allowCupOverlap: uitzonderlijkzelfde week als beker (alleen als optie aan). */
  const canSit = (
    m: PackableMatch,
    w: number,
    allowCupOverlap = false,
  ): boolean => {
    const cap = weekCapacity(w);
    const list = weekToMatches.get(w)!;
    if (list.length >= cap) return false;
    const teamSet = teamsPerWeek.get(w)!;
    if (teamSet.has(m.home) || teamSet.has(m.away)) return false;
    if (isCupBusy(w, m.home, m.away) && !(allowCupOverlap && allowSameWeekCup)) {
      return false;
    }
    return true;
  };

  const placeAt = (m: PackableMatch, w: number): void => {
    const teamSet = teamsPerWeek.get(w)!;
    teamSet.add(m.home);
    teamSet.add(m.away);
    weekToMatches.get(w)!.push(m);
  };

  const unplaceAt = (m: PackableMatch, w: number): boolean => {
    const list = weekToMatches.get(w)!;
    const idx = list.findIndex((x) => matchesEqual(x, m));
    if (idx < 0) return false;
    list.splice(idx, 1);
    const teamSet = teamsPerWeek.get(w)!;
    teamSet.delete(m.home);
    teamSet.delete(m.away);
    return true;
  };

  const tryPlace = (
    m: PackableMatch,
    startWeek: number,
    allowCupOverlap = false,
  ): number | null => {
    for (let w = startWeek; w < weekCount; w++) {
      if (!canSit(m, w, allowCupOverlap)) continue;
      placeAt(m, w);
      return w;
    }
    return null;
  };

  /** Zoek alternatieve week (exclusief fromWeek). Prefer zonder beker-overlap. */
  const findAlternateWeek = (
    m: PackableMatch,
    fromWeek: number,
    startWeek = 0,
  ): number | null => {
    for (let w = startWeek; w < weekCount; w++) {
      if (w === fromWeek) continue;
      if (canSit(m, w, false)) return w;
    }
    if (allowSameWeekCup) {
      for (let w = startWeek; w < weekCount; w++) {
        if (w === fromWeek) continue;
        if (canSit(m, w, true)) return w;
      }
    }
    return null;
  };

  const findWeekOf = (m: PackableMatch): number | null => {
    for (let w = 0; w < weekCount; w++) {
      if (weekToMatches.get(w)!.some((x) => matchesEqual(x, m))) return w;
    }
    return null;
  };

  const restoreMoves = (
    moved: Array<{ match: PackableMatch; from: number }>,
  ): void => {
    for (const mv of moved.reverse()) {
      const cur = findWeekOf(mv.match);
      if (cur != null) unplaceAt(mv.match, cur);
      placeAt(mv.match, mv.from);
    }
  };

  /**
   * Verplaats conflict naar een andere week.
   * depth>=1: als geen vrije week, verplaats eerst een blocker van een kandidaat-week.
   */
  const moveMatchAway = (
    conflict: PackableMatch,
    fromWeek: number,
    depth: number,
    movedLog: Array<{ match: PackableMatch; from: number }>,
  ): boolean => {
    if (repairBudget <= 0) return false;
    repairBudget -= 1;
    repairAttempted = true;

    const alt = findAlternateWeek(conflict, fromWeek, 0);
    if (alt != null) {
      if (!unplaceAt(conflict, fromWeek)) return false;
      placeAt(conflict, alt);
      movedLog.push({ match: conflict, from: fromWeek });
      return true;
    }

    if (depth < 1) return false;

    for (let cand = 0; cand < weekCount; cand++) {
      if (cand === fromWeek) continue;
      if (weekToMatches.get(cand)!.length >= weekCapacity(cand)) continue;
      const cupBlocks =
        isCupBusy(cand, conflict.home, conflict.away) && !allowSameWeekCup;
      if (cupBlocks) continue;

      const blockers = weekToMatches
        .get(cand)!
        .filter(
          (x) =>
            x.home === conflict.home ||
            x.away === conflict.home ||
            x.home === conflict.away ||
            x.away === conflict.away,
        );
      if (blockers.length === 0) continue;

      for (const blocker of blockers) {
        const beforeLen = movedLog.length;
        if (!moveMatchAway(blocker, cand, depth - 1, movedLog)) continue;
        const fits =
          canSit(conflict, cand, false) ||
          (allowSameWeekCup && canSit(conflict, cand, true));
        if (fits) {
          if (!unplaceAt(conflict, fromWeek)) {
            restoreMoves(movedLog.splice(beforeLen));
            continue;
          }
          placeAt(conflict, cand);
          movedLog.push({ match: conflict, from: fromWeek });
          return true;
        }
        restoreMoves(movedLog.splice(beforeLen));
      }
    }

    return false;
  };

  const tryRepairPlace = (m: PackableMatch): number | null => {
    if (!enableRepair || repairBudget <= 0) return null;
    repairAttempted = true;

    type Cand = { week: number; conflicts: PackableMatch[]; cupOverlap: boolean };
    const candidates: Cand[] = [];

    const tryDirect = (allowCup: boolean): number | null => {
      for (let w = 0; w < weekCount; w++) {
        if (canSit(m, w, allowCup)) {
          placeAt(m, w);
          return w;
        }
      }
      return null;
    };

    const direct = tryDirect(false) ?? (allowSameWeekCup ? tryDirect(true) : null);
    if (direct != null) return direct;

    for (let w = 0; w < weekCount; w++) {
      const cupOverlap = isCupBusy(w, m.home, m.away);
      if (cupOverlap && !allowSameWeekCup) continue;
      const conflicts = weekToMatches
        .get(w)!
        .filter(
          (x) =>
            x.home === m.home ||
            x.away === m.home ||
            x.home === m.away ||
            x.away === m.away,
        );
      if (conflicts.length > 0) {
        candidates.push({ week: w, conflicts, cupOverlap });
      }
    }

    // Eerst weken zonder beker-overlap
    candidates.sort(
      (a, b) =>
        Number(a.cupOverlap) - Number(b.cupOverlap) ||
        a.conflicts.length - b.conflicts.length,
    );

    for (const { week, conflicts } of candidates) {
      if (repairBudget <= 0) break;
      const movedLog: Array<{ match: PackableMatch; from: number }> = [];
      let ok = true;
      for (const c of conflicts) {
        const from = findWeekOf(c);
        if (from == null) {
          ok = false;
          break;
        }
        if (!moveMatchAway(c, from, maxRepairDepth - 1, movedLog)) {
          ok = false;
          break;
        }
      }
      const fits =
        canSit(m, week, false) ||
        (allowSameWeekCup && canSit(m, week, true));
      if (ok && fits) {
        placeAt(m, week);
        return week;
      }
      restoreMoves(movedLog);
    }

    return null;
  };

  const orderMatchdayMatches = (mdMatches: PackableMatch[]): PackableMatch[] => {
    let list = [...mdMatches];
    if (options?.orderByDifficulty) {
      list.sort((a, b) => {
        const da = countCupFreeWeeksForPair(
          a.home,
          a.away,
          weekCount,
          options.externalBusyTeamsByWeek,
        );
        const db = countCupFreeWeeksForPair(
          b.home,
          b.away,
          weekCount,
          options.externalBusyTeamsByWeek,
        );
        if (da !== db) return da - db;
        return a.home - b.home || a.away - b.away;
      });
      return list;
    }
    if (options?.shuffleWithinMatchday && list.length > 1) {
      return shuffleArray(list, options.rng ?? Math.random);
    }
    return list;
  };

  for (const md of sorted) {
    const mdMatches = orderMatchdayMatches(byMatchday.get(md)!);
    const poolKey = parsePoolKey(md);
    let poolWeek = currentWeekByPool.get(poolKey) ?? 0;
    let maxWeekUsed = poolWeek;

    for (const m of mdMatches) {
      // Eerst weken zonder beker; uitzonderlijkzelfde week pas als dat faalt
      let week =
        tryPlace(m, poolWeek, false) ?? tryPlace(m, 0, false);
      if (week == null && allowSameWeekCup) {
        week = tryPlace(m, poolWeek, true) ?? tryPlace(m, 0, true);
      }
      if (week == null) {
        week = tryRepairPlace(m);
      }
      if (week == null) {
        return {
          ok: false,
          failedMatch: m,
          placedCount,
          weekToMatches,
          diagnosis: diagnosePlacementFailure(
            m,
            weekCount,
            weekCapacity,
            weekToMatches,
            teamsPerWeek,
            options,
            repairAttempted,
          ),
        };
      }
      placedCount += 1;
      maxWeekUsed = Math.max(maxWeekUsed, week);
    }

    poolWeek = maxWeekUsed;
    while (poolWeek < weekCount && weekToMatches.get(poolWeek)!.length >= weekCapacity(poolWeek)) {
      poolWeek += 1;
    }
    currentWeekByPool.set(poolKey, poolWeek);
  }

  return { ok: true, weekToMatches };
}

export function sumWeekCapacities(
  weekCount: number,
  weekCapacity: (weekIndex: number) => number,
): number {
  let sum = 0;
  for (let w = 0; w < weekCount; w++) sum += Math.max(0, weekCapacity(w));
  return sum;
}

/** Near-miss: bijna alle wedstrijden geplaatst. */
export function isPackNearMiss(placedCount: number, totalMatches: number): boolean {
  if (totalMatches <= 0) return false;
  const left = totalMatches - placedCount;
  return left > 0 && (left <= 8 || placedCount / totalMatches >= 0.95);
}

export type PackFailureSuggestion = {
  id: string;
  /** Korte actie (UI-kop) */
  title: string;
  /** Waarom dit helpt */
  detail: string;
};

/**
 * Gerichte suggesties op basis van packing-diagnose (niet generieke tips).
 * Gesorteerd: meest relevant eerst.
 */
export function buildPackFailureSuggestions(input: {
  diagnosis: PackFailureDiagnosis;
  placedCount: number;
  totalMatches: number;
  totalCap: number;
  weekCount: number;
  softShare: boolean;
  allowSameWeekCupOverlap?: boolean;
  homeName?: string;
  awayName?: string;
  homeId: number;
  awayId: number;
}): PackFailureSuggestion[] {
  const {
    diagnosis,
    placedCount,
    totalMatches,
    softShare,
    homeName,
    awayName,
    homeId,
    awayId,
  } = input;
  const home = homeName ?? `ploeg ${homeId}`;
  const away = awayName ?? `ploeg ${awayId}`;
  const left = totalMatches - placedCount;
  const nearMiss = isPackNearMiss(placedCount, totalMatches);
  const suggestions: PackFailureSuggestion[] = [];

  const cupHeavy =
    diagnosis.weeksTeamCup > 0 &&
    diagnosis.weeksTeamCup >= diagnosis.weeksTeamCompetition;
  const competitionHeavy =
    diagnosis.weeksTeamCompetition > 0 &&
    diagnosis.weeksTeamCompetition >= diagnosis.weeksTeamCup;
  const capacityTight =
    diagnosis.freeSlotsLeft === 0 ||
    diagnosis.weeksFull > diagnosis.weeksChecked * 0.4;

  if (nearMiss && competitionHeavy) {
    suggestions.push({
      id: "extend-season",
      title: "Verleng het seizoen met 1–2 speelweken",
      detail: `${home} en ${away} hebben in de meeste open weken al competitie (nog ${left} wedstrijd(en) open). Extra weken geven een gedeelde vrije week.`,
    });
    suggestions.push({
      id: "fewer-rounds",
      title: "Zet competitie op 1 ronde minder",
      detail:
        "In Opzet → Competitie: minder speeldagen per reeks verlaagt de druk op late speeldagen (zoals speeldag 33).",
    });
  }

  if (cupHeavy || (softShare && diagnosis.weeksTeamCup > 0)) {
    suggestions.push({
      id: "spread-cup",
      title: "Spreid of verschuif bekerweken in de kalender",
      detail: `${diagnosis.weeksTeamCup} week(en) zijn geblokkeerd omdat één van beide al beker speelt. Meer ruimte tussen bekerweken = meer weken waar beide vrij zijn voor competitie.`,
    });
  }

  if (capacityTight || diagnosis.weeksFull > 0) {
    suggestions.push({
      id: "free-slots",
      title: diagnosis.freeSlotsLeft === 0
        ? "Maak meer competitie-slots per week vrij"
        : "Verminder volle weken (meer slots of langere kalender)",
      detail:
        softShare
          ? `${diagnosis.weeksFull} week(en) zitten vol (op bekerweken telt alleen de niet-bekerdag). Minder bekerweken of een langere periode helpt.`
          : `${diagnosis.weeksFull} week(en) zitten vol. Langere seizoensperiode of minder parallelle systemen maakt slots vrij.`,
    });
  }

  if (nearMiss && diagnosis.repairAttempted) {
    suggestions.push({
      id: "regenerate",
      title: "Genereer de preview opnieuw",
      detail:
        "Een andere loting/speeldagvolgorde kan de laatste paren eerder in de kalender zetten. Bij bijna-missen helpt dit soms in één klik.",
    });
  }

  if (
    !suggestions.some((s) => s.id === "fewer-rounds") &&
    left > 0 &&
    totalMatches > 100
  ) {
    suggestions.push({
      id: "fewer-rounds",
      title: "Probeer 1 competitieronde minder",
      detail: "Minder wedstrijden in totaal past sneller in hetzelfde aantal speelweken.",
    });
  }

  if (!suggestions.some((s) => s.id === "extend-season")) {
    suggestions.push({
      id: "extend-season",
      title: "Voeg speelweken toe (later seizoenseinde)",
      detail: "Meer weken = meer kans op een week waar beide ploegen vrij zijn.",
    });
  }

  // Uniek op id, max 4
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  }).slice(0, 4);
}

/** Menselijke NL-fouttekst bij packing-falen (totale slots ≠ bruikbare weken). */
export function formatPackFailureMessage(input: {
  matchLabel: string;
  homeId: number;
  awayId: number;
  placedCount: number;
  totalMatches: number;
  totalCap: number;
  weekCount: number;
  diagnosis: PackFailureDiagnosis;
  softShare: boolean;
  /** Of uitzondering beker+competitie (≥3 dagen) actief was tijdens packing */
  allowSameWeekCupOverlap?: boolean;
  homeName?: string;
  awayName?: string;
  teamNameById?: (id: number) => string | undefined;
}): string {
  const {
    matchLabel,
    homeId,
    awayId,
    placedCount,
    totalMatches,
    totalCap,
    weekCount,
    diagnosis,
    softShare,
    allowSameWeekCupOverlap,
    homeName,
    awayName,
    teamNameById,
  } = input;
  const home = homeName ?? `ploeg ${homeId}`;
  const away = awayName ?? `ploeg ${awayId}`;
  const left = totalMatches - placedCount;
  const nearMiss = isPackNearMiss(placedCount, totalMatches);
  const nameOf = (id: number) =>
    teamNameById?.(id) ??
    (id === homeId ? home : id === awayId ? away : `ploeg ${id}`);

  const parts: string[] = [];
  if (nearMiss) {
    parts.push(
      `Bijna: ${placedCount} van ${totalMatches} wedstrijden pasten; repair/zoeken vond geen week meer voor ${matchLabel} (${home} vs ${away}).`,
    );
  } else {
    parts.push(
      `${matchLabel} (${home} vs ${away}) past niet meer in de kalender.`,
      `${placedCount} van ${totalMatches} wedstrijden geplaatst (${left} open).`,
    );
  }

  if (diagnosis.freeSlotsLeft > 0) {
    parts.push(
      `Er zijn nog ${diagnosis.freeSlotsLeft} vrije competitie-slots (van ${totalCap} over ${weekCount} weken), ` +
        `maar geen week waar beide ploegen vrij zijn én er nog een moment open is.`,
    );
  } else {
    parts.push(
      `Geen vrije competitie-slots meer (${totalCap} over ${weekCount} weken waren theoretisch beschikbaar).`,
    );
  }

  const blockers: string[] = [];
  if (diagnosis.weeksTeamCup > 0) {
    blockers.push(
      `${diagnosis.weeksTeamCup} week(en): één van beide speelt al beker`,
    );
  }
  if (diagnosis.weeksTeamCompetition > 0) {
    blockers.push(
      `${diagnosis.weeksTeamCompetition} week(en): één van beide speelt al competitie`,
    );
  }
  if (diagnosis.weeksFull > 0) {
    blockers.push(`${diagnosis.weeksFull} week(en): alle competitie-momenten vol`);
  }
  if (blockers.length) {
    parts.push(`Blokkades: ${blockers.join("; ")}.`);
  }

  if (diagnosis.sampleBlockedWeeks.length > 0) {
    const samples = diagnosis.sampleBlockedWeeks.slice(0, 3).map((s) => {
      const who =
        s.blockingTeamIds.length > 0
          ? s.blockingTeamIds.map(nameOf).join(" / ")
          : "ploeg";
      const why =
        s.reason === "team_cup" ? "beker" : "al competitie";
      return `week ${s.weekIndex + 1}: ${who} (${why})`;
    });
    parts.push(`Voorbeelden: ${samples.join("; ")}.`);
  }

  if (diagnosis.repairAttempted) {
    parts.push(
      "Automatische verplaatsing van conflicterende competitiewedstrijden leverde geen oplossing.",
    );
  }

  if (softShare) {
    parts.push(
      allowSameWeekCupOverlap
        ? "Op bekerweken telt alleen de niet-bekerdag mee. Standaard speelt een ploeg max. 1× per week; uitzonderlijk mag beker + competitie als er ≥3 dagen tussen zitten (bv. ma beker → do/vr competitie)."
        : "Op bekerweken telt alleen de niet-bekerdag mee; een ploeg mag max. 1× per week spelen.",
    );
  }

  return parts.join(" ");
}
