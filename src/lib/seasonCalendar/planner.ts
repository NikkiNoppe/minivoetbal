/** Seizoenskalender-planner: reserveer beker/playoff/competitie-weken (efficiency first). */

import {
  estimateCupSpreadWeeks,
  isDateInVacationPeriod,
  pickSpacedPlayDayPair,
  toMondayIso,
  type TimeslotLike,
  type VacationLike,
} from "@/lib/competitionPlanningEstimate";
import {
  getCupBracketPlan,
  getCupFirstRoundPairs,
  listAllSeasonMondays,
  listPlayableMondays,
  pickSpacedIndices,
} from "@/lib/cupBracketPlan";
import {
  buildSeasonSlotGrids,
  capacityForWeek,
  summarizeEffectiveCapacity,
} from "./slotGrid";
import type {
  OccupancyMatchLike,
  ReserveCupWeeksResult,
  SeasonDemand,
  SeasonPlan,
  SeasonWeekPlan,
  SlotDetailLike,
} from "./types";
import type { SlotUnavailability } from "@/types/slotUnavailability";

export type BuildSeasonCalendarInput = {
  seasonStart: string;
  seasonEnd: string;
  vacations?: VacationLike[];
  /** Vakantieweken die uitzonderlijk speelbaar blijven. */
  playableVacationWeeks?: string[];
  timeslots?: TimeslotLike[];
  slotDetails: SlotDetailLike[];
  blocks?: SlotUnavailability[];
  matches?: OccupancyMatchLike[];
};

export function listSeasonPlayableWeeks(
  seasonStart: string,
  seasonEnd: string,
  vacations: VacationLike[] = [],
  playableVacationWeeks: string[] = [],
): string[] {
  return listPlayableMondays(
    seasonStart,
    seasonEnd,
    vacations,
    playableVacationWeeks,
  );
}

/**
 * Effectieve slots/week voor beker-bracket: piekcapaciteit op bruikbare weken
 * (cup wordt op de sterkste weken gepland), begrensd door nominaal aantal timeslots.
 */
export function resolveCupBracketSlotsPerWeek(
  grids: ReturnType<typeof buildSeasonSlotGrids>,
  nominalSlots: number,
): number {
  const summary = summarizeEffectiveCapacity(grids);
  if (summary.usableWeekCount === 0) return 0;
  const nominal = Math.max(1, nominalSlots);
  const peak = Math.max(summary.maxFree, summary.medianPositiveFree);
  return Math.max(1, Math.min(nominal, peak));
}

/**
 * Effectieve slots/week voor competitie-schatting: mediaan van positieve freeCount,
 * nooit hoger dan nominale timeslot-count, nooit lager dan 1 als er bruikbare weken zijn.
 */
export function resolveEffectiveSlotsPerWeek(
  grids: ReturnType<typeof buildSeasonSlotGrids>,
  nominalSlots: number,
): number {
  const summary = summarizeEffectiveCapacity(grids);
  if (summary.usableWeekCount === 0) return 0;
  const nominal = Math.max(1, nominalSlots);
  return Math.max(1, Math.min(nominal, summary.medianPositiveFree || summary.maxFree));
}

export function reserveCupWeeks(input: {
  seasonStart: string;
  seasonEnd: string;
  vacations?: VacationLike[];
  timeslots?: TimeslotLike[];
  slotDetails: SlotDetailLike[];
  blocks?: SlotUnavailability[];
  matches?: OccupancyMatchLike[];
  cupTeamCount: number;
  /** Extra weken die al gereserveerd zijn (bv. playoffs) — vermijden. */
  reservedMondays?: string[];
  /** Handmatig gekozen bekerweken (ISO-maandagen). */
  preferredMondays?: string[];
  /** manual = preferred eerst / exact; auto = preferred als zachte boost. */
  weekMode?: "auto" | "manual";
  playableVacationWeeks?: string[];
}): ReserveCupWeeksResult {
  const vacations = input.vacations ?? [];
  const playableVacationWeeks = input.playableVacationWeeks ?? [];
  const playable = listPlayableMondays(
    input.seasonStart,
    input.seasonEnd,
    vacations,
    playableVacationWeeks,
  );
  const grids = buildSeasonSlotGrids({
    weekMondays: playable,
    slotDetails: input.slotDetails,
    blocks: input.blocks,
    matches: input.matches,
    vacations,
    playableVacationWeeks,
  });

  const nominal = Math.max(1, input.slotDetails.length || input.timeslots?.length || 7);
  const effectiveSlots = resolveCupBracketSlotsPerWeek(grids, nominal);
  const pairs = getCupFirstRoundPairs(input.cupTeamCount);
  const bracket =
    effectiveSlots > 0
      ? getCupBracketPlan(input.cupTeamCount, effectiveSlots)
      : getCupBracketPlan(input.cupTeamCount, Math.max(1, Math.min(nominal, 1)));

  const required = bracket.requiredWeeks;
  const reservedSet = new Set((input.reservedMondays ?? []).map((d) => toMondayIso(d)));
  const weekMode = input.weekMode ?? "auto";
  const preferredRaw = (input.preferredMondays ?? []).map((d) => toMondayIso(d));

  const usable = playable.filter((m) => capacityForWeek(grids, m) > 0 && !reservedSet.has(m));
  const zeroCap = playable.filter((m) => capacityForWeek(grids, m) <= 0);
  const preferredUsable = preferredRaw
    .filter((m) => usable.includes(m))
    .sort((a, b) => a.localeCompare(b));

  // Prefer weken zonder competitie/playoff occupancy, dan hoogste freeCount
  const competitionBusy = new Set(
    (input.matches ?? [])
      .filter((m) => m.match_date && !m.is_cup_match && !m.is_playoff_match)
      .map((m) => toMondayIso(String(m.match_date))),
  );

  const freeOfCompetition = usable.filter((m) => !competitionBusy.has(m));

  const scoreWeek = (m: string) => {
    const free = capacityForWeek(grids, m);
    const noComp = competitionBusy.has(m) ? 0 : 1000;
    const preferredBoost = preferredRaw.includes(m) ? 500 : 0;
    return noComp + preferredBoost + free;
  };

  const sortByScore = (weeks: string[]) =>
    [...weeks].sort((a, b) => scoreWeek(b) - scoreWeek(a) || a.localeCompare(b));

  const daySeparation = pickSpacedPlayDayPair(
    (input.timeslots ?? input.slotDetails.map((s) => s.timeslot ?? {}))
      .map((t) => t?.day_of_week)
      .filter((d): d is number => typeof d === "number"),
  );

  const notes: string[] = [];
  const rationale: string[] = [];

  if (required === 0) {
    return {
      dates: [],
      overlappingMondays: [],
      freeWeeksAvailable: freeOfCompetition.length,
      firstRoundWeeks: 0,
      requiredWeeks: 0,
      effectiveSlotsPerWeek: effectiveSlots,
      daySeparation,
      notes: ["Geen speelweken nodig."],
      rationale: [],
    };
  }

  if (usable.length === 0) {
    return {
      dates: [],
      overlappingMondays: [],
      freeWeeksAvailable: 0,
      firstRoundWeeks: bracket.firstRoundWeeks,
      requiredWeeks: required,
      effectiveSlotsPerWeek: effectiveSlots,
      daySeparation,
      notes: [
        "Geen speelbare weken met vrije slots (check seizoensgrenzen, vakanties en timeslot-geldigheid).",
      ],
      rationale: [
        zeroCap.length > 0
          ? `${zeroCap.length} week(en) hebben 0 effectieve slots (buiten valid_from/until of volledig geblokkeerd).`
          : "Geen speelbare maandagen in het seizoen.",
      ],
    };
  }

  let dates: string[] = [];

  if (weekMode === "manual" && preferredUsable.length > 0) {
    // Handmatig: gebruik gekozen weken chronologisch; vul aan met auto als te weinig.
    if (preferredUsable.length >= required) {
      const spacedIdx = pickSpacedIndices(preferredUsable.length, required);
      dates = spacedIdx.map((i) => preferredUsable[i]).sort();
      rationale.push(
        `Bekerweken handmatig gestuurd: ${preferredUsable.length} gekozen, ${required} gebruikt (gespreid).`,
      );
    } else {
      dates = [...preferredUsable];
      const used = new Set(dates);
      for (const m of sortByScore(usable)) {
        if (dates.length >= required) break;
        if (!used.has(m)) dates.push(m);
      }
      dates = dates.sort().slice(0, required);
      notes.push(
        `Handmatig ${preferredUsable.length}/${required} bekerweken gekozen — rest automatisch aangevuld.`,
      );
      rationale.push("Geselecteerde bekerweken eerst; ontbrekende weken via capaciteit.");
    }
  } else {
    // Efficiency first: kies weken met genoeg capaciteit voor 1/8-dichtheid
    const firstRoundNeed = Math.max(1, bracket.firstRoundWeeks);
    const slotsNeededPerFirstWeek = Math.ceil(pairs / firstRoundNeed);

    const capableForFirst = sortByScore(
      usable.filter(
        (m) =>
          capacityForWeek(grids, m) >= Math.min(slotsNeededPerFirstWeek, effectiveSlots || 1),
      ),
    );
    const pool = capableForFirst.length >= required ? capableForFirst : sortByScore(usable);

    const preferredPool = sortByScore(
      (freeOfCompetition.length >= required ? freeOfCompetition : usable).filter((m) =>
        pool.includes(m),
      ),
    );

    const candidates = preferredPool.length >= required ? preferredPool : sortByScore(usable);
    const capacitySlice = candidates.slice(
      0,
      Math.max(required, Math.min(candidates.length, required * 2)),
    );
    capacitySlice.sort();
    const spacedIdx = pickSpacedIndices(capacitySlice.length, Math.min(required, capacitySlice.length));
    dates = spacedIdx.map((i) => capacitySlice[i]);

    if (dates.length < required) {
      const used = new Set(dates);
      for (const m of sortByScore(usable)) {
        if (dates.length >= required) break;
        if (!used.has(m)) dates.push(m);
      }
    }

    dates = dates.sort().slice(0, required);
    if (preferredUsable.length > 0) {
      rationale.push(
        "Voorkeursweken gaven een zachte boost bij automatische selectie (modus auto).",
      );
    }
  }

  const overlappingMondays = dates.filter((d) => competitionBusy.has(d));

  notes.push(
    `${dates.length} speelweek(en) voorgesteld (effectieve capaciteit ~${effectiveSlots}/week; ${usable.length} bruikbare weken, ${zeroCap.length} met 0 slots).`,
  );
  if (bracket.firstRoundWeeks > 1) {
    notes.push(
      `1/8 over ${bracket.firstRoundWeeks} weken (niet alles in één week — gebaseerd op effectieve slots, niet op ${nominal} geconfigureerde slots).`,
    );
  }
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
  if (dates.length < required) {
    notes.push(
      `Onvoldoende bruikbare weken: ${dates.length}/${required}. Verleng seizoen, verruim timeslot-geldigheid of verklein het deelnemersveld.`,
    );
  }

  rationale.push(
    "Weken met 0 effectieve slots (buiten timeslot-periode of volledig geblokkeerd) worden overgeslagen.",
  );
  rationale.push(
    `Bracket gebruikt effectieve slotcapaciteit (~${effectiveSlots}/week), niet het ruwe aantal timeslots (${nominal}).`,
  );
  if (weekMode !== "manual") {
    rationale.push(
      "Efficiency first: weken met de hoogste vrije capaciteit en zonder competitie gaan voor; spreiding is secundair.",
    );
  }
  if (overlappingMondays.length === 0) {
    rationale.push("Geen overlap met competitie: een team speelt die week alleen beker.");
  } else if (daySeparation.separated) {
    rationale.push(
      `Bij overlap: beker op ${daySeparation.earlyLabel}, competitie op ${daySeparation.lateLabel}.`,
    );
  }

  return {
    dates,
    overlappingMondays,
    freeWeeksAvailable: freeOfCompetition.length,
    firstRoundWeeks: bracket.firstRoundWeeks,
    requiredWeeks: required,
    effectiveSlotsPerWeek: effectiveSlots,
    daySeparation,
    notes,
    rationale,
  };
}

/**
 * Volledig seizoensplan: playoffs aan het einde, beker op beste capaciteit,
 * competitie pakt de rest dicht.
 */
export function buildSeasonPlan(
  input: BuildSeasonCalendarInput & SeasonDemand,
): SeasonPlan {
  const vacations = input.vacations ?? [];
  const playableVacationWeeks = input.playableVacationWeeks ?? [];
  const exceptionSet = new Set(playableVacationWeeks.map((d) => toMondayIso(d)));
  const playable = listPlayableMondays(
    input.seasonStart,
    input.seasonEnd,
    vacations,
    playableVacationWeeks,
  );
  const grids = buildSeasonSlotGrids({
    weekMondays: playable,
    slotDetails: input.slotDetails,
    blocks: input.blocks,
    matches: input.matches,
    vacations,
    playableVacationWeeks,
  });
  const usable = playable.filter((m) => capacityForWeek(grids, m) > 0);
  const nominal = Math.max(1, input.slotDetails.length || 7);
  const effectiveSlots = resolveEffectiveSlotsPerWeek(grids, nominal);

  const notes: string[] = [];
  const rationale: string[] = [];

  const strategy = input.phaseStrategy ?? "balanced";

  // (a) Playoffs: laatste N bruikbare weken
  const playoffNeed = Math.max(0, Math.floor(input.playoffMatchdays));
  const playoffWeeks = usable.slice(Math.max(0, usable.length - playoffNeed));
  const playoffSet = new Set(playoffWeeks);

  // (a2) Competitievraag in weken (nodig vóór de bekerkeuze bij "competitie eerst").
  // Weken = max(capaciteit, speeldagen): een ploeg speelt ≤1×/week, dus speeldagen
  // domineren bij oneven reeksen.
  const weeksNeededComp = (() => {
    const matchdays = Math.max(0, Math.floor(input.competitionMatchdays ?? 0));
    const matches = Math.max(0, Math.floor(input.competitionMatches));
    if (matches <= 0 && matchdays <= 0) return 0;
    if (effectiveSlots <= 0) return matchdays;
    const byCapacity = matches > 0 ? Math.ceil(matches / effectiveSlots) : 0;
    return Math.max(byCapacity, matchdays);
  })();

  // Competitie eerst: de vroegste weken zijn competitie, beker/playoffs komen daarna.
  const competitionFirstWeeks =
    strategy === "competition-first" && weeksNeededComp > 0
      ? usable.filter((m) => !playoffSet.has(m)).slice(0, weeksNeededComp)
      : [];

  // (b) Cup on remaining
  const cup = reserveCupWeeks({
    ...input,
    cupTeamCount: input.cupTeamCount,
    reservedMondays: [...playoffWeeks, ...competitionFirstWeeks],
    preferredMondays: input.cupPreferredWeeks,
    weekMode: input.cupWeekMode,
    playableVacationWeeks,
  });
  const cupSet = new Set(cup.dates);


  // (c) Competitie: eerst exclusieve weken (zonder beker), daarna bekerweken waar
  // na de beker nog speelmomenten vrij blijven. Zelfde beleid als de generator:
  // ploegen zonder beker die week mogen die resterende momenten gebruiken.
  const competitionCandidates = usable.filter((m) => !playoffSet.has(m));

  const exclusiveComp = competitionCandidates.filter((m) => !cupSet.has(m));
  const hasWeekShortage = exclusiveComp.length < weeksNeededComp;
  const canShareByDay = cup.daySeparation.separated;


  // Hoeveel momenten de beker per bekerweek nodig heeft — zelfde verdeling als
  // de bekergenerator (ronde na ronde, per week tot de slotcapaciteit vol is).
  const cupBracket = getCupBracketPlan(
    input.cupTeamCount,
    Math.max(1, effectiveSlots),
  );
  const cupSlotsPerCupWeek = new Map<string, number>();
  const orderedCupWeeks = [...cup.dates].sort((a, b) => a.localeCompare(b));
  for (const round of cupBracket.rounds) {
    for (let i = 0; i < round.weeksNeeded; i++) {
      const week = orderedCupWeeks[round.weekOffset + i];
      if (!week) continue;
      const placed = Math.min(
        cupBracket.slotsPerWeek,
        Math.max(0, round.matchCount - i * cupBracket.slotsPerWeek),
      );
      cupSlotsPerCupWeek.set(week, (cupSlotsPerCupWeek.get(week) ?? 0) + placed);
    }
  }

  // Bekerweken met restcapaciteit: competitie mag daar de overige momenten vullen.
  const sharedCompCandidates = canShareByDay
    ? competitionCandidates.filter(
        (m) =>
          cupSet.has(m) &&
          capacityForWeek(grids, m) > (cupSlotsPerCupWeek.get(m) ?? 0),
      )
    : [];
  // Nooit méér competitieweken markeren dan er speeldagen nodig zijn: de vroegste
  // weken eerst (chronologisch), de rest blijft "vrij" als buffer.
  const competitionAssigned = (() => {
    if (weeksNeededComp <= 0) return [];
    if (strategy === "competition-first") return [...competitionFirstWeeks].sort();
    const pool = [...new Set([...exclusiveComp, ...sharedCompCandidates])].sort();
    return pool.slice(0, weeksNeededComp);
  })();
  const competitionSet = new Set(competitionAssigned);


  const sharedCupMondays = cup.dates.filter((d) => competitionSet.has(d));
  const daySeparation = cup.daySeparation;

  const cupSpread = estimateCupSpreadWeeks({
    cupMatches: getCupFirstRoundPairs(input.cupTeamCount),
    slotsPerWeek: Math.max(1, effectiveSlots),
    maxAvailableWeeks: usable.length,
  });

  const sharedHint =
    daySeparation.separated
      ? `Beker ${daySeparation.earlyLabel} · competitie ${daySeparation.lateLabel}`
      : null;

  // Toon alle seizoensweken (incl. vakantie) zodat Instellingen-wijzigingen zichtbaar zijn
  const allMondays = listAllSeasonMondays(input.seasonStart, input.seasonEnd);
  const vacationSet = new Set(
    allMondays.filter((m) => isDateInVacationPeriod(m, vacations)),
  );

  const weekPlans: SeasonWeekPlan[] = allMondays.map((weekMonday) => {
    const g = grids.get(weekMonday);
    const remaining = g?.configAvailableCount ?? 0;
    // Volledige vakantieweek: maandag in vakantie én geen resterende M-momenten.
    // Gedeeltelijke week (Ezelweekend ma, Pinksteren ma) blijft speelbaar.
    if (
      vacationSet.has(weekMonday) &&
      !exceptionSet.has(weekMonday) &&
      remaining <= 0
    ) {
      return {
        weekMonday,
        phases: ["vacation"],
        freeCount: 0,
        configAvailableCount: 0,
        reservedCupSlots: 0,
        reservedCompetitionSlots: 0,
        reservedPlayoffSlots: 0,
        sharedDayHint: null,
        label: "vakantie",
      };
    }
    if (!g) {
      return {
        weekMonday,
        phases: ["blocked"],
        freeCount: 0,
        configAvailableCount: 0,
        reservedCupSlots: 0,
        reservedCompetitionSlots: 0,
        reservedPlayoffSlots: 0,
        sharedDayHint: null,
        label: "geblokkeerd",
      };
    }
    const phases: SeasonWeekPlan["phases"] = [];
    if (g.freeCount <= 0 && g.configAvailableCount <= 0) phases.push("blocked");
    if (cupSet.has(weekMonday)) phases.push("cup");
    if (playoffSet.has(weekMonday)) phases.push("playoff");
    if (competitionSet.has(weekMonday)) phases.push("competition");
    if (phases.length === 0) phases.push(g.freeCount > 0 ? "free" : "blocked");

    const isShared = cupSet.has(weekMonday) && competitionSet.has(weekMonday);
    const cupSlots = cupSet.has(weekMonday)
      ? Math.min(g.freeCount, cup.effectiveSlotsPerWeek)
      : 0;
    // Bij gedeelde week: competitie krijgt de rest van de capaciteit
    const compSlots = competitionSet.has(weekMonday)
      ? Math.min(g.freeCount, Math.max(0, effectiveSlots - (isShared ? Math.min(cupSlots, Math.ceil(effectiveSlots / 2)) : 0)))
      : 0;

    return {
      weekMonday,
      phases,
      freeCount: g.freeCount,
      configAvailableCount: g.configAvailableCount,
      reservedCupSlots: cupSlots,
      reservedPlayoffSlots: playoffSet.has(weekMonday) ? g.freeCount : 0,
      reservedCompetitionSlots: compSlots,
      sharedDayHint: isShared ? sharedHint : null,
      label: isShared ? `gedeeld (${sharedHint ?? "zelfde week"})` : phases.join("+"),
    };
  });

  const totalFree = usable.reduce((s, m) => s + capacityForWeek(grids, m), 0);
  const reserved =
    cup.dates.length * Math.max(1, cup.effectiveSlotsPerWeek) +
    competitionAssigned.length * Math.max(1, effectiveSlots) +
    playoffWeeks.length * Math.max(1, effectiveSlots);
  const utilization = totalFree > 0 ? Math.min(1, reserved / totalFree) : 0;
  const weekWaste = Math.max(
    0,
    usable.length -
      new Set([...competitionAssigned, ...cup.dates, ...playoffWeeks]).size,
  );

  rationale.push("Playoffs gereserveerd aan het einde van het seizoen.");
  if (input.cupWeekMode === "manual" && (input.cupPreferredWeeks?.length ?? 0) > 0) {
    rationale.push("Bekerweken handmatig gestuurd via de weekstrook.");
  } else {
    rationale.push(
      `Beker op weken met hoogste effectieve capaciteit (~${cup.effectiveSlotsPerWeek} slots/week), bij voorkeur zonder competitie.`,
    );
  }
  if (sharedCupMondays.length > 0) {
    rationale.push(
      `Competitie benut de resterende speelmomenten op ${sharedCupMondays.length} bekerweek(en) (${daySeparation.earlyLabel} beker / ${daySeparation.lateLabel} competitie).`,
    );
  } else {
    const matchdaysNote =
      (input.competitionMatchdays ?? 0) > 0
        ? ` (max van capaciteit en ${input.competitionMatchdays} speeldagen)`
        : "";
    rationale.push(
      `Competitie op exclusieve weken (${competitionAssigned.length} van ${weeksNeededComp} nodig${matchdaysNote}) — geen overlap met beker.`,
    );
  }
  if (hasWeekShortage && !canShareByDay) {
    notes.push(
      `Te weinig exclusieve weken voor competitie (${exclusiveComp.length}/${weeksNeededComp}), maar slechts één speeldag geconfigureerd — gedeelde weken niet zinvol.`,
    );
  }
  if (cupSpread.preferredWeeks > cup.firstRoundWeeks) {
    rationale.push(
      `Extra beker-spreiding (${cupSpread.preferredWeeks} weken) alleen als surpluscapaciteit het toelaat — nu efficiency first.`,
    );
  }
  if (usable.length < playable.length) {
    notes.push(
      `${playable.length - usable.length} week(en) onbruikbaar (0 effectieve slots) — niet meegenomen in planning.`,
    );
  }
  if (competitionAssigned.length < weeksNeededComp) {
    notes.push(
      `Competitie-tekort: ${competitionAssigned.length}/${weeksNeededComp} weken. Overweeg dubbele speelweken of seizoensverlenging.`,
    );
  }
  if (sharedCupMondays.length > 0) {
    notes.push(
      `${sharedCupMondays.length} gedeelde week(en): beker en competitie in dezelfde kalenderweek` +
        (daySeparation.separated
          ? ` — beker op ${daySeparation.earlyLabel}, competitie op de resterende momenten (${daySeparation.lateLabel}). Een ploeg met beker speelt pas ≥3 dagen later opnieuw.`
          : " — let op: teams kunnen 2× die week spelen."),
    );
  }

  return {
    weeks: weekPlans,
    cupDates: cup.dates,
    sharedCupMondays,
    playoffWeeks,
    competitionWeeks: competitionAssigned,
    cupBracket: {
      firstRoundPairs: getCupFirstRoundPairs(input.cupTeamCount),
      firstRoundWeeks: cup.firstRoundWeeks,
      requiredWeeks: cup.requiredWeeks,
      slotsPerWeekUsed: cup.effectiveSlotsPerWeek,
    },
    daySeparation,
    efficiency: {
      playableWeeks: playable.length,
      usableWeeks: usable.length,
      totalFreeSlots: totalFree,
      reservedSlots: reserved,
      utilization,
      weekWaste,
      sharedWeeks: sharedCupMondays.length,
    },
    rationale: [...rationale, ...cup.rationale],
    notes: [...notes, ...cup.notes],
  };
}

/** Schatting voor UI (vervangt losse competition + cup estimates). */
export function estimateSeasonPlanning(input: {
  seasonStart: string;
  seasonEnd: string;
  vacations?: VacationLike[];
  timeslots?: TimeslotLike[];
  slotDetails: SlotDetailLike[];
  blocks?: SlotUnavailability[];
  matches?: OccupancyMatchLike[];
  competitionMatches: number;
  competitionMatchdays?: number;
  cupTeamCount: number;
  playoffMatchdays?: number;
}): SeasonPlan {
  return buildSeasonPlan({
    ...input,
    playoffMatchdays: input.playoffMatchdays ?? 0,
  });
}
