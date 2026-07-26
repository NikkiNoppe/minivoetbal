/** Bracket- en datumsuggesties voor bekertoernooi (power-of-2 knock-out). */

import {
  isDateInVacationPeriod,
  pickSpacedPlayDayPair,
  toMondayIso,
  type TimeslotLike,
  type VacationLike,
} from "@/lib/competitionPlanningEstimate";

export type CupRoundUi =
  | { type: "group"; name: string; subRounds: Array<{ name: string; index: number }> }
  | { type: "single"; name: string; index: number };

export type CupRoundKind = "voorronde" | "r32" | "r16" | "qf" | "sf" | "final" | "other";

export type CupRoundSpec = {
  kind: CupRoundKind;
  /** Weergavenaam (Voorronde, Achtste Finales, …). */
  name: string;
  /** Prefix in unique_number: VR, 1/16, 1/8, QF, SF, F. */
  prefix: string;
  teamsEntering: number;
  matchCount: number;
  /** Teams die deze ronde overslaan (alleen bij niet-power-of-2). */
  byeCount: number;
  teamsExiting: number;
  /** Speelweken nodig voor deze ronde bij gegeven slotcapaciteit. */
  weeksNeeded: number;
  /** Startindex in de beker-speelwekenlijst (0-based). */
  weekOffset: number;
};

export type CupBracketPlan = {
  teamCount: number;
  rounds: CupRoundSpec[];
  /** Teams die in de eerste ronde spelen (excl. byes). */
  firstRoundTeams: number;
  /** Aantal wedstrijden in de eerste ronde (voorronde of 1/8/…). */
  firstRoundPairs: number;
  slotsPerWeek: number;
  /** Speelweken voor de eerste ronde. */
  firstRoundWeeks: number;
  /** Speelweken na de eerste ronde. */
  knockoutWeeks: number;
  requiredWeeks: number;
  roundLabels: CupRoundUi[];
};

export type IdealCupDatesSuggestion = {
  dates: string[];
  overlappingMondays: string[];
  freeWeeksAvailable: number;
  daySeparation: ReturnType<typeof pickSpacedPlayDayPair>;
  notes: string[];
  rationale: string[];
};

export function isPowerOfTwo(n: number): boolean {
  const x = Math.floor(n);
  return x >= 2 && (x & (x - 1)) === 0;
}

/** Grootste macht van 2 ≤ n (voor n≥2). */
export function largestPowerOfTwoAtMost(n: number): number {
  const x = Math.floor(n);
  if (x < 2) return 1;
  return 2 ** Math.floor(Math.log2(x));
}

function metaForPowerOfTwoField(teamsEntering: number): {
  kind: CupRoundKind;
  name: string;
  prefix: string;
} {
  switch (teamsEntering) {
    case 2:
      // Unieke code blijft "FINAL" (bestaande DB / advancement).
      return { kind: "final", name: "Finale", prefix: "FINAL" };
    case 4:
      return { kind: "sf", name: "Halve Finales", prefix: "SF" };
    case 8:
      return { kind: "qf", name: "Kwart Finales", prefix: "QF" };
    case 16:
      return { kind: "r16", name: "Achtste Finales", prefix: "1/8" };
    case 32:
      return { kind: "r32", name: "Zestiende Finales", prefix: "1/16" };
    default:
      return {
        kind: "other",
        name: `Ronde van ${teamsEntering}`,
        prefix: `R${teamsEntering}`,
      };
  }
}

/**
 * Knock-out rondes: bij oneven/niet-power-of-2 veld eerst reduceren naar
 * de dichtstbijzijnde lagere macht van 2 (byes + voorronde), daarna klassiek.
 *
 * Voorbeeld 22 teams: Voorronde (6) → Achtste (8) → Kwart (4) → Half (2) → Finale.
 */
export function buildCupRoundSpecs(
  teamCount: number,
  slotsPerWeek: number = 7,
): CupRoundSpec[] {
  const slots = Math.max(1, Math.floor(slotsPerWeek) || 7);
  let remaining = Math.max(0, Math.floor(teamCount));
  if (remaining < 2) return [];

  const rounds: CupRoundSpec[] = [];
  let weekOffset = 0;

  while (remaining > 1) {
    let matchCount: number;
    let byeCount: number;
    let teamsExiting: number;
    let kind: CupRoundKind;
    let name: string;
    let prefix: string;

    if (isPowerOfTwo(remaining)) {
      matchCount = remaining / 2;
      byeCount = 0;
      teamsExiting = matchCount;
      ({ kind, name, prefix } = metaForPowerOfTwoField(remaining));
    } else {
      const target = largestPowerOfTwoAtMost(remaining);
      matchCount = remaining - target;
      byeCount = remaining - 2 * matchCount;
      teamsExiting = target;
      kind = "voorronde";
      name = "Voorronde";
      prefix = "VR";
    }

    const weeksNeeded = Math.max(1, Math.ceil(matchCount / slots));
    rounds.push({
      kind,
      name,
      prefix,
      teamsEntering: remaining,
      matchCount,
      byeCount,
      teamsExiting,
      weeksNeeded,
      weekOffset,
    });
    weekOffset += weeksNeeded;
    remaining = teamsExiting;
  }

  return rounds;
}

/** Aantal wedstrijden in de openingsronde (voorronde of power-of-2 ronde). */
export function getCupFirstRoundPairs(teamCount: number): number {
  const rounds = buildCupRoundSpecs(teamCount, 7);
  return rounds[0]?.matchCount ?? 0;
}

export function getCupBracketPlan(
  teamCount: number,
  slotsPerWeek: number = 7,
): CupBracketPlan {
  const slots = Math.max(1, Math.floor(slotsPerWeek) || 7);
  const n = Math.max(0, Math.floor(teamCount));
  const rounds = buildCupRoundSpecs(n, slots);
  const first = rounds[0];
  const firstRoundPairs = first?.matchCount ?? 0;
  const firstRoundWeeks = first?.weeksNeeded ?? 0;
  const requiredWeeks = rounds.reduce((sum, r) => sum + r.weeksNeeded, 0);
  const knockoutWeeks = Math.max(0, requiredWeeks - firstRoundWeeks);

  return {
    teamCount: n,
    rounds,
    firstRoundTeams: firstRoundPairs * 2,
    firstRoundPairs,
    slotsPerWeek: slots,
    firstRoundWeeks,
    knockoutWeeks,
    requiredWeeks,
    roundLabels: buildCupRoundLabelsFromRounds(rounds),
  };
}

export function buildCupRoundLabelsFromRounds(rounds: CupRoundSpec[]): CupRoundUi[] {
  const labels: CupRoundUi[] = [];
  for (const round of rounds) {
    if (round.weeksNeeded <= 1) {
      labels.push({
        type: "single",
        name:
          round.byeCount > 0
            ? `${round.name} (${round.matchCount} wedstrijden · ${round.byeCount} bye)`
            : round.name,
        index: round.weekOffset,
      });
    } else {
      labels.push({
        type: "group",
        name:
          round.byeCount > 0
            ? `${round.name} (${round.matchCount} wedstrijden · ${round.byeCount} bye)`
            : round.name,
        subRounds: Array.from({ length: round.weeksNeeded }, (_, i) => ({
          name: `Speelweek ${i + 1}`,
          index: round.weekOffset + i,
        })),
      });
    }
  }
  return labels;
}

/** @deprecated Gebruik buildCupRoundLabelsFromRounds / getCupBracketPlan. */
export function buildCupRoundLabels(firstRoundWeeks: number): CupRoundUi[] {
  // Legacy 1/8 + QF + SF + F voor callers die alleen firstRoundWeeks kennen
  const r1 = Math.max(0, firstRoundWeeks);
  const rounds: CupRoundUi[] = [];
  if (r1 === 1) {
    rounds.push({ type: "single", name: "Achtste Finales", index: 0 });
  } else if (r1 > 1) {
    rounds.push({
      type: "group",
      name: "Achtste Finales",
      subRounds: Array.from({ length: r1 }, (_, i) => ({
        name: `Speelweek ${i + 1}`,
        index: i,
      })),
    });
  }
  rounds.push({ type: "single", name: "Kwart Finales", index: r1 });
  rounds.push({ type: "single", name: "Halve Finales", index: r1 + 1 });
  rounds.push({ type: "single", name: "Finale", index: r1 + 2 });
  return rounds;
}

/** Week-index binnen een ronde voor wedstrijd i (0-based t.o.v. weekOffset). */
export function assignRoundWeekIndex(
  matchIndex: number,
  matchCount: number,
  weeksNeeded: number,
  slotsPerWeek: number,
): number {
  if (weeksNeeded <= 1) return 0;
  const capacity = Math.max(1, slotsPerWeek);
  const byCapacity = Math.floor(matchIndex / capacity);
  return Math.min(weeksNeeded - 1, Math.max(0, byCapacity));
}

/** @deprecated Alias — eerste ronde weekindex. */
export function assignFirstRoundWeekIndex(
  matchIndex: number,
  pairCount: number,
  firstRoundWeeks: number,
  slotsPerWeek: number,
): number {
  return assignRoundWeekIndex(matchIndex, pairCount, firstRoundWeeks, slotsPerWeek);
}

/**
 * Weekindices voor QF/SF/Finale wanneer het plan eindigt met die drie rondes.
 * Bij afwijkende structuur (bv. voorronde): gebruik CupRoundSpec.weekOffset.
 */
export function getKnockoutWeekIndices(playingWeeksLength: number): {
  quarterFinal: number;
  semiFinal: number;
  final: number;
  firstRoundWeeks: number;
} {
  const n = Math.max(3, playingWeeksLength);
  return {
    firstRoundWeeks: Math.max(0, n - 3),
    quarterFinal: n - 3,
    semiFinal: n - 2,
    final: n - 1,
  };
}

export function weekIndexForRoundMatch(
  round: CupRoundSpec,
  matchIndex: number,
  slotsPerWeek: number,
): number {
  return (
    round.weekOffset +
    assignRoundWeekIndex(matchIndex, round.matchCount, round.weeksNeeded, slotsPerWeek)
  );
}

/** Prefix voor power-of-2 veldgrootte (8 → QF, 16 → 1/8, …). */
export function cupPrefixForTeamField(teamsEntering: number): string {
  return metaForPowerOfTwoField(teamsEntering).prefix;
}

/**
 * Doorstroming vanuit voorronde: byes gespreid over de volgende ronde;
 * VR-winnaars vullen de vrije slots (zie cupTeamSeeding.nextRoundSlotRoles).
 */
export function nextSlotAfterVoorronde(
  vrMatchNumber1Based: number,
  vrMatchCount: number,
  nextMatchCount: number,
): { matchNumber: number; isHome: boolean; slotIndex: number } {
  // Inline spreiding (zelfde algoritme als cupTeamSeeding) — geen circulaire import
  const byeCount = Math.max(0, 2 * nextMatchCount - vrMatchCount);
  const slots = nextMatchCount * 2;
  const roles: Array<"bye" | "winner"> = Array.from({ length: slots }, () => "winner");
  let placed = 0;
  const byes = Math.min(byeCount, slots);
  for (let m = 0; m < nextMatchCount && placed < byes; m++) {
    roles[m * 2] = "bye";
    placed += 1;
  }
  for (let m = 0; m < nextMatchCount && placed < byes; m++) {
    if (roles[m * 2 + 1] === "winner") {
      roles[m * 2 + 1] = "bye";
      placed += 1;
    }
  }
  const winnerSlots: number[] = [];
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === "winner") winnerSlots.push(i);
  }
  const idx = Math.max(0, Math.min(vrMatchNumber1Based, winnerSlots.length) - 1);
  const slotIndex = winnerSlots[idx] ?? byeCount + Math.max(0, vrMatchNumber1Based - 1);
  return {
    slotIndex,
    matchNumber: Math.floor(slotIndex / 2) + 1,
    isHome: slotIndex % 2 === 0,
  };
}

export function matchDateFromWeekMonday(
  weekMonday: string,
  dayOfWeek: number | null | undefined,
): string {
  const monday = toMondayIso(weekMonday);
  if (dayOfWeek == null || Number.isNaN(dayOfWeek)) return monday;
  const dow = Math.floor(dayOfWeek);
  const offset = dow === 0 ? 6 : dow - 1;
  const d = new Date(`${monday}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function earlyWeekSlotBonus(
  dayOfWeek: number | null | undefined,
  earlyDay: number,
): number {
  if (dayOfWeek == null || Number.isNaN(dayOfWeek)) return 0;
  const dist = Math.abs(Math.floor(dayOfWeek) - earlyDay);
  return Math.max(0, 3 - dist) * 0.4;
}

function isVacationMonday(monday: string, vacations: VacationLike[]): boolean {
  return isDateInVacationPeriod(monday, vacations);
}

/** Alle ISO-maandagen in het seizoen (inclusief vakantieweken). */
export function listAllSeasonMondays(
  seasonStart: string,
  seasonEnd: string,
): string[] {
  if (!seasonStart || !seasonEnd) return [];
  let cursor = new Date(`${toMondayIso(seasonStart)}T12:00:00`);
  const end = new Date(`${toMondayIso(seasonEnd)}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) {
    return [];
  }
  const out: string[] = [];
  while (cursor <= end) {
    out.push(toMondayIso(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export function listPlayableMondays(
  seasonStart: string,
  seasonEnd: string,
  vacations: VacationLike[] = [],
): string[] {
  return listAllSeasonMondays(seasonStart, seasonEnd).filter(
    (iso) => !isVacationMonday(iso, vacations),
  );
}

export function pickSpacedIndices(length: number, count: number): number[] {
  if (count <= 0 || length <= 0) return [];
  if (count === 1) return [Math.floor((length - 1) / 2)];
  if (count >= length) return Array.from({ length }, (_, i) => i);

  const picked: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    let idx = Math.round((i * (length - 1)) / (count - 1));
    if (used.has(idx)) {
      let delta = 1;
      while (delta < length) {
        if (idx + delta < length && !used.has(idx + delta)) {
          idx = idx + delta;
          break;
        }
        if (idx - delta >= 0 && !used.has(idx - delta)) {
          idx = idx - delta;
          break;
        }
        delta += 1;
      }
    }
    used.add(idx);
    picked.push(idx);
  }
  return picked.sort((a, b) => a - b);
}

export function suggestIdealCupDates(input: {
  requiredWeeks: number;
  seasonStart: string;
  seasonEnd: string;
  vacations?: VacationLike[];
  competitionMondays?: string[];
  timeslots?: TimeslotLike[];
}): IdealCupDatesSuggestion {
  const required = Math.max(0, Math.floor(input.requiredWeeks));
  const vacations = input.vacations ?? [];
  const competitionSet = new Set(
    (input.competitionMondays ?? []).map((d) => toMondayIso(d)),
  );
  const playable = listPlayableMondays(input.seasonStart, input.seasonEnd, vacations);
  const free = playable.filter((m) => !competitionSet.has(m));
  const busy = playable.filter((m) => competitionSet.has(m));
  const daySeparation = pickSpacedPlayDayPair(
    (input.timeslots ?? [])
      .map((t) => t.day_of_week)
      .filter((d): d is number => typeof d === "number"),
  );

  const notes: string[] = [];
  const rationale: string[] = [];
  const dates: string[] = [];

  if (required === 0) {
    return {
      dates: [],
      overlappingMondays: [],
      freeWeeksAvailable: free.length,
      daySeparation,
      notes: ["Geen speelweken nodig."],
      rationale: [],
    };
  }

  if (playable.length === 0) {
    return {
      dates: [],
      overlappingMondays: [],
      freeWeeksAvailable: 0,
      daySeparation,
      notes: ["Geen speelbare weken in het seizoen (check start/eind en vakanties)."],
      rationale: [
        "Er zijn geen speelbare maandagen tussen seizoensstart en -eind na aftrek van vakanties.",
      ],
    };
  }

  const freePick = pickSpacedIndices(free.length, Math.min(required, free.length)).map(
    (i) => free[i],
  );
  dates.push(...freePick);

  if (dates.length < required && busy.length > 0) {
    const need = required - dates.length;
    const busySorted = [...busy].sort((a, b) => {
      const distA = Math.min(...dates.map((d) => Math.abs(Date.parse(a) - Date.parse(d))), Infinity);
      const distB = Math.min(...dates.map((d) => Math.abs(Date.parse(b) - Date.parse(d))), Infinity);
      return distB - distA;
    });
    const busyPick = pickSpacedIndices(busySorted.length, Math.min(need, busySorted.length)).map(
      (i) => busySorted[i],
    );
    dates.push(...busyPick);
  }

  if (dates.length < required) {
    const used = new Set(dates);
    for (const m of playable) {
      if (dates.length >= required) break;
      if (!used.has(m)) dates.push(m);
    }
  }

  dates.sort();
  const finalDates = dates.slice(0, required);
  const overlappingMondays = finalDates.filter((d) => competitionSet.has(d));
  const freeChosen = finalDates.length - overlappingMondays.length;

  notes.push(
    `${finalDates.length} speelweek(en) voorgesteld over het seizoen (${free.length} week(en) zonder competitie beschikbaar).`,
  );
  if (overlappingMondays.length === 0) {
    notes.push("Geen overlap met bestaande competitieweken — teams spelen max. 1× die week.");
  } else {
    notes.push(
      `${overlappingMondays.length} week(en) overlappen met competitie. ` +
        (daySeparation.separated
          ? `Plan beker bij voorkeur op ${daySeparation.earlyLabel}, competitie op ${daySeparation.lateLabel}.`
          : "Probeer beker en competitie op verschillende dagen/tijden te zetten."),
    );
  }
  if (finalDates.length < required) {
    notes.push(
      `Onvoldoende weken in het seizoen: ${finalDates.length}/${required}. Verleng seizoen of verklein het deelnemersveld.`,
    );
  }

  rationale.push(
    `Vakantieweken worden overgeslagen; alleen speelbare weken tussen seizoensstart en -eind tellen mee.`,
  );
  rationale.push(
    `Weken zonder competitiewedstrijden hebben voorrang (${freeChosen} van ${finalDates.length} gekozen zonder competitie; ${free.length} vrij in het seizoen).`,
  );
  rationale.push(
    `De gekozen weken liggen zo gelijkmatig mogelijk gespreid over het seizoen, zodat knock-outrondes ademruimte houden.`,
  );
  if (overlappingMondays.length === 0) {
    rationale.push(
      `Geen overlap met competitie: een team speelt die week alleen beker, niet ook nog competitie.`,
    );
  } else {
    rationale.push(
      `${overlappingMondays.length} week(en) moeten toch op een competitieweek vallen omdat er te weinig vrije weken zijn.`,
    );
    if (daySeparation.separated) {
      rationale.push(
        `Bij overlap: beker bij voorkeur op ${daySeparation.earlyLabel}, competitie op ${daySeparation.lateLabel} (op basis van geconfigureerde tijdslots).`,
      );
    }
  }

  return {
    dates: finalDates,
    overlappingMondays,
    freeWeeksAvailable: free.length,
    daySeparation,
    notes,
    rationale,
  };
}

export function describeCupPlan(plan: CupBracketPlan): string {
  const parts = [
    `${plan.teamCount} team${plan.teamCount === 1 ? "" : "s"}`,
    `${plan.requiredWeeks} speelweek${plan.requiredWeeks === 1 ? "" : "en"}`,
  ];
  const summary = plan.rounds
    .map((r) =>
      r.byeCount > 0
        ? `${r.name} ${r.matchCount}w/${r.byeCount} bye`
        : `${r.name} (${r.matchCount})`,
    )
    .join(" → ");
  if (summary) parts.push(summary);
  return parts.join(" · ");
}
