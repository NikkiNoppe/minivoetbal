/** Schatting voor competitieplanning: weken vs. uitzonderlijke dubbele speelweken. */

export const DAY_OF_WEEK_NAMES: Record<number, string> = {
  0: "Zondag",
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
};

export type TimeslotLike = {
  day_of_week?: number | null;
};

export type VacationLike = {
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
};

/** True als de kalenderdatum in een actieve vakantieperiode valt (inclusief start/eind). */
export function isDateInVacationPeriod(
  dateInput: string | Date,
  vacations: VacationLike[],
): boolean {
  if (!vacations.length) return false;
  const d =
    typeof dateInput === "string"
      ? new Date(`${dateInput.split("T")[0]}T12:00:00`)
      : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return false;
  return vacations.some((vacation) => {
    if (vacation.is_active === false) return false;
    if (!vacation.start_date || !vacation.end_date) return false;
    const start = new Date(`${vacation.start_date.split("T")[0]}T12:00:00`);
    const end = new Date(`${vacation.end_date.split("T")[0]}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return d >= start && d <= end;
  });
}

/** Unieke speeldagen uit geconfigureerde tijdslots, oplopend. */
export function getConfiguredPlayDays(timeslots: TimeslotLike[]): number[] {
  const days = new Set<number>();
  for (const slot of timeslots) {
    if (typeof slot.day_of_week === "number" && slot.day_of_week >= 0 && slot.day_of_week <= 6) {
      days.add(slot.day_of_week);
    }
  }
  return Array.from(days).sort((a, b) => a - b);
}

/**
 * Kies beker-speeldagen in volgorde van voorkeur:
 * 1) early (bv. maandag)
 * 2) dagen erna in de week
 * 3) vermijd late (competitiedag) en de dag vóór late (anders rug-aan-rug, bv. do+vr)
 */
export function orderCupDayPreference(
  earlyDay: number,
  lateDay: number,
  playDays: number[],
): number[] {
  const eveOfLate = ((lateDay % 7) + 6) % 7; // dag vóór competitie
  const candidates = [
    ...new Set(
      playDays.filter(
        (d) => typeof d === "number" && d >= 0 && d <= 6 && d !== lateDay,
      ),
    ),
  ];
  if (candidates.length === 0) return [earlyDay];

  const rank = (d: number): number => {
    if (d === earlyDay) return 0;
    if (d === eveOfLate) return 1000;
    // Afstand vooruit vanaf early (ma→di=1, ma→wo=2, …)
    const forward = (d - earlyDay + 7) % 7;
    return forward === 0 ? 0 : forward;
  };

  return [...candidates].sort((a, b) => rank(a) - rank(b) || a - b);
}

/** Bonus voor slotkeuze: hogere voorkeursdag = hogere score; vermeden dagen negatief. */
export function cupDayPreferenceBonus(
  dayOfWeek: number | null | undefined,
  preferredDays: number[],
): number {
  if (dayOfWeek == null || Number.isNaN(dayOfWeek) || preferredDays.length === 0) return 0;
  const idx = preferredDays.indexOf(Math.floor(dayOfWeek));
  if (idx < 0) return -1.5;
  return (preferredDays.length - idx) * 0.45;
}

/** Eerste vrije slot volgens voorkeursdagen (ma → di → …; dag vóór competitie laatst). */
export function pickPreferredCupSlotIndex(
  freeIndices: number[],
  getDayOfWeek: (slotIndex: number) => number | null | undefined,
  preferredDays: number[],
): number | null {
  if (freeIndices.length === 0) return null;
  for (const day of preferredDays) {
    const hit = freeIndices.find((i) => getDayOfWeek(i) === day);
    if (hit != null) return hit;
  }
  return freeIndices[0] ?? null;
}

/**
 * Kies twee dagen met maximale spreiding (bv. maandag + vrijdag).
 * Bij één dag: die dag alleen; bij geen dagen: maandag + dinsdag als fallback.
 */
export function pickSpacedPlayDayPair(playDays: number[]): {
  early: number;
  late: number;
  earlyLabel: string;
  lateLabel: string;
  separated: boolean;
} {
  if (playDays.length === 0) {
    return {
      early: 1,
      late: 2,
      earlyLabel: DAY_OF_WEEK_NAMES[1],
      lateLabel: DAY_OF_WEEK_NAMES[2],
      separated: false,
    };
  }
  if (playDays.length === 1) {
    const only = playDays[0];
    return {
      early: only,
      late: only,
      earlyLabel: DAY_OF_WEEK_NAMES[only] ?? `Dag ${only}`,
      lateLabel: DAY_OF_WEEK_NAMES[only] ?? `Dag ${only}`,
      separated: false,
    };
  }

  let bestA = playDays[0];
  let bestB = playDays[playDays.length - 1];
  let bestScore = -1;
  for (let i = 0; i < playDays.length; i++) {
    for (let j = i + 1; j < playDays.length; j++) {
      const a = playDays[i];
      const b = playDays[j];
      // Prefer same-week span (ma → vr) over weekend wrap; secondary: absolute gap.
      const forward = b - a;
      const wrap = 7 - forward;
      const score = forward * 10 + wrap;
      if (score > bestScore) {
        bestScore = score;
        bestA = a;
        bestB = b;
      }
    }
  }

  const early = Math.min(bestA, bestB);
  const late = Math.max(bestA, bestB);
  return {
    early,
    late,
    earlyLabel: DAY_OF_WEEK_NAMES[early] ?? `Dag ${early}`,
    lateLabel: DAY_OF_WEEK_NAMES[late] ?? `Dag ${late}`,
    separated: early !== late,
  };
}

export function toMondayIso(dateInput: string | Date): string {
  const d = typeof dateInput === "string"
    ? new Date(`${dateInput.split("T")[0]}T12:00:00`)
    : new Date(dateInput);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Unieke speelweken (maandagen) voor een set kalenderdatums. */
export function uniqueMondaysFromDates(dates: string[]): string[] {
  const mondays = new Set<string>();
  for (const date of dates) {
    if (!date) continue;
    mondays.add(toMondayIso(date));
  }
  return Array.from(mondays).sort();
}

/** Aantal actieve vakantieweken (maandagen) binnen seizoensperiode. */
export function countVacationWeeksInRange(
  vacations: VacationLike[],
  seasonStart: string,
  seasonEnd: string,
): number {
  const start = new Date(`${seasonStart.split("T")[0]}T12:00:00`);
  const end = new Date(`${seasonEnd.split("T")[0]}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  const vacationMondays = new Set<string>();
  for (const vacation of vacations) {
    if (vacation.is_active === false) continue;
    if (!vacation.start_date || !vacation.end_date) continue;
    let cursor = new Date(`${toMondayIso(vacation.start_date)}T12:00:00`);
    const vacEnd = new Date(`${vacation.end_date.split("T")[0]}T12:00:00`);
    while (cursor <= vacEnd) {
      if (cursor >= start && cursor <= end) {
        vacationMondays.add(toMondayIso(cursor));
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  return vacationMondays.size;
}

/**
 * Bekerweken zo gespreid mogelijk: minimaal ceil(matches/slots),
 * bij voorkeur meer weken (minder densiteit) tot maxAvailable.
 */
export function estimateCupSpreadWeeks(input: {
  cupMatches: number;
  slotsPerWeek: number;
  maxAvailableWeeks: number;
}): { minWeeks: number; preferredWeeks: number } {
  const cupMatches = Math.max(0, input.cupMatches);
  const slots = Math.max(1, input.slotsPerWeek);
  const maxAvailable = Math.max(0, input.maxAvailableWeeks);
  if (cupMatches === 0 || maxAvailable === 0) {
    return { minWeeks: 0, preferredWeeks: 0 };
  }
  const minWeeks = Math.min(maxAvailable, Math.ceil(cupMatches / slots));
  // Streef naar ~halve slotbezetting zodat ronden/datums verder uit elkaar liggen.
  const preferredWeeks = Math.min(
    maxAvailable,
    Math.max(minWeeks, Math.ceil(cupMatches / Math.max(1, Math.floor(slots / 2) || 1))),
  );
  return { minWeeks, preferredWeeks };
}

export type CompetitionPlanningEstimate = {
  slotsPerWeek: number;
  calendarWeeks: number;
  vacationWeeks: number;
  cupWeeksReserved: number;
  cupMatches: number;
  cupPreferredWeeks: number;
  /** Weken die overblijven voor reguliere competitie. */
  availableWeeks: number;
  weeksNeeded: number;
  weekDeficit: number;
  overflowMatches: number;
  /** Weken waarin sommige teams uitzonderlijk 2× spelen (ruwe schatting). */
  doublePlayWeeks: number;
  /** Haalbaar binnen kalender als we dubbele speelweken toelaten. */
  feasibleWithDoublePlay: boolean;
  dayPair: ReturnType<typeof pickSpacedPlayDayPair>;
};

/**
 * Ruwe capaciteitsschatting: standaard 1× per team per week via slotsPerWeek.
 * Beker- en vakantieweken worden vooraf afgetrokken.
 * Tekort → uitzonderlijke dubbele speelweken, bij voorkeur op gespreide dagen.
 */
export function estimateCompetitionPlanning(input: {
  totalMatches: number;
  calendarWeeks: number;
  timeslots: TimeslotLike[];
  vacationWeeks?: number;
  cupWeeksReserved?: number;
  cupMatches?: number;
  /** Fallback als er geen tijdslots zijn (historisch ~7 speelmomenten/week). */
  defaultSlotsPerWeek?: number;
}): CompetitionPlanningEstimate {
  const configuredSlots = input.timeslots.length;
  const slotsPerWeek = Math.max(
    1,
    configuredSlots > 0 ? configuredSlots : (input.defaultSlotsPerWeek ?? 7),
  );
  const calendarWeeks = Math.max(0, input.calendarWeeks);
  const vacationWeeks = Math.max(0, input.vacationWeeks ?? 0);
  const cupMatches = Math.max(0, input.cupMatches ?? 0);
  const cupSpread = estimateCupSpreadWeeks({
    cupMatches,
    slotsPerWeek,
    maxAvailableWeeks: Math.max(0, calendarWeeks - vacationWeeks),
  });
  const cupWeeksReserved = Math.max(
    0,
    input.cupWeeksReserved ?? cupSpread.preferredWeeks,
  );

  const availableWeeks = Math.max(0, calendarWeeks - vacationWeeks - cupWeeksReserved);
  const totalMatches = Math.max(0, input.totalMatches);
  const weeksNeeded = totalMatches === 0 ? 0 : Math.ceil(totalMatches / slotsPerWeek);
  const weekDeficit = Math.max(0, weeksNeeded - availableWeeks);
  const capacity = availableWeeks * slotsPerWeek;
  const overflowMatches = Math.max(0, totalMatches - capacity);
  const dayPair = pickSpacedPlayDayPair(getConfiguredPlayDays(input.timeslots));

  const doublePlayWeeks = weekDeficit;
  const feasibleWithDoublePlay =
    weekDeficit === 0
      ? true
      : availableWeeks > 0 && totalMatches > 0 && doublePlayWeeks <= availableWeeks;

  return {
    slotsPerWeek,
    calendarWeeks,
    vacationWeeks,
    cupWeeksReserved,
    cupMatches,
    cupPreferredWeeks: cupSpread.preferredWeeks,
    availableWeeks,
    weeksNeeded,
    weekDeficit,
    overflowMatches,
    doublePlayWeeks,
    feasibleWithDoublePlay,
    dayPair,
  };
}
