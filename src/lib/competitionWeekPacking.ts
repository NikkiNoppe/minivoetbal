/**
 * Greedy week-packing for competition matchdays + limited repair.
 * Chronologisch: geen bekerweken overslaan (anders blijven vroege gaten onbereikbaar).
 * Fallback vanaf week 0 vult restgaten bij teamconflicten.
 * Bij stuck: verplaats conflicterende competitie-wedstrijd (beker blijft hard).
 */

export type PackableMatch = {
  home: number;
  away: number;
  matchday: number;
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
  repairAttempted?: boolean;
  sampleBlockedWeeks: Array<{
    weekIndex: number;
    reason: Exclude<PackFailureReason, "ok" | "week_full">;
    blockingTeamIds: number[];
  }>;
};

export type PackWeekResult = {
  ok: boolean;
  weekToMatches: Map<number, PackableMatch[]>;
  failedMatch?: PackableMatch;
  placedCount?: number;
  diagnosis?: PackFailureDiagnosis;
};

export type PackCompetitionOptions = {
  /**
   * Teams die die week al beker spelen — standaard geen competitie dezelfde week.
   * Met allowCupOverlapForWeek: alleen als laatste redmiddel toegestaan.
   */
  externalBusyTeamsByWeek?: (weekIndex: number) => ReadonlySet<number> | undefined;
  /**
   * Uitzonderlijk: plaats op een bekerweek ondanks cup-busy team, als packing
   * anders vastloopt. Per week beoordeeld: alleen waar die week een speelmoment
   * met ≥3 dagen na de bekerwedstrijd vrij is.
   */
  allowCupOverlapForWeek?: (weekIndex: number) => boolean;
  /**
   * Aantal speelmomenten die wél bruikbaar zijn voor beker+competitie (≥3 dagen
   * na de bekerdag, typisch vrijdag). Zonder deze optie is alle capaciteit
   * fungibel. Met: cup-overlap verbruikt alleen deze “preferred”-capaciteit,
   * zodat niet-bekerparen eerst de restcapaciteit op de bekerdag (reclaim) vullen.
   */
  preferredWeekCapacity?: (weekIndex: number) => number;
  /** Shuffle wedstrijdvolgorde binnen een speeldag (andere packing t.o.v. beker). */
  shuffleWithinMatchday?: boolean;
  /**
   * Plaats eerst paren met minste weken waar beide vrij zijn t.o.v. beker
   * (binnen een speeldag; overschrijft pure shuffle-volgorde).
   * Telt dynamisch mee met huidige packing (team-bezetting + capaciteit).
   */
  orderByDifficulty?: boolean;
  /** Limited repair bij stuck (default true). */
  enableRepair?: boolean;
  /** Max verplaatsingspogingen per stuck match (default 50). */
  maxRepairAttempts?: number;
  /** Max hops: 1 = alleen direct conflict verplaatsen; 2 = ook hun blocker (default 2). */
  maxRepairDepth?: number;
  /**
   * Bij near-miss: haal alle geplaatste wedstrijden van beide ploegen weg,
   * plaats eerst de vastgelopen wedstrijd, daarna de rest opnieuw.
   * Default true.
   */
  enableEvacuateRepair?: boolean;
  /**
   * Beperkte DFS-backtrack over open wedstrijden bij near-miss. Default true.
   * Zet uit op vroege packing-pogingen voor snelheid.
   */
  enableBacktrackRepair?: boolean;
  /**
   * Max. cascade-scopes bij evacuate (1 = alleen de twee ploegen, hoger = meer
   * speeldagen). Default: alle scopes.
   */
  evacuateMaxScopes?: number;
  /**
   * Speeldagen van hoog naar laag plaatsen (late speeldagen eerst).
   * Helpt bij near-miss waar vroege speeldagen de kalender volzetten.
   */
  reverseMatchdays?: boolean;
  /**
   * Max. wedstrijden per ploeg per week (beker telt mee via externalBusy).
   * Default 1; zet op 2 voor geforceerd schema (verschillende dagen bij slot-assign).
   */
  maxTeamAppearancesPerWeek?: 1 | 2;
  /**
   * Bij max 2: eerst weken waar beide ploegen nog 0× spelen, pas daarna dual-weken.
   * Default true als maxTeamAppearancesPerWeek === 2.
   */
  preferFreshWeeks?: boolean;
  rng?: () => number;
};

/** Min. verschil in dagen voor beker+competitie dezelfde week (standaard). */
export const MIN_SAME_WEEK_DAY_GAP = 3;

/**
 * Min. dagen tussen twee wedstrijden van dezelfde ploeg in één week
 * bij dual/force (2×/week) of relaxed beker-overlap.
 * Ma→wo = 2 (ok); ma→di = 1 (niet ok).
 */
export const MIN_DUAL_WEEK_DAY_GAP = 2;

/** Positie in de ISO-week: ma=0 … zo=6 (day_of_week gebruikt zo=0). */
function isoDayIndex(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

/** True als competitiedag ≥ minGap dagen na bekerdag valt in dezelfde week. */
export function hasSufficientSameWeekDayGap(
  cupDayOfWeek: number,
  competitionDayOfWeek: number,
  minGap: number = MIN_SAME_WEEK_DAY_GAP,
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
  return (
    isoDayIndex(competitionDayOfWeek) - isoDayIndex(cupDayOfWeek) >= minGap
  );
}

const MS_PER_DAY = 86_400_000;

function toDayNumber(value: string): number | null {
  const iso = value.slice(0, 10);
  const ms = new Date(`${iso}T12:00:00`).getTime();
  return Number.isFinite(ms) ? Math.round(ms / MS_PER_DAY) : null;
}

/**
 * True als de competitiewedstrijd ≥ minGap dagen ná de bekerwedstrijd valt.
 * Werkt op echte datums — niet op de theoretische voorkeursdag.
 */
export function hasSufficientDayGapBetweenDates(
  cupDate: string,
  competitionDate: string,
  minGap: number = MIN_SAME_WEEK_DAY_GAP,
): boolean {
  if (!cupDate || !competitionDate) return false;
  const cup = toDayNumber(cupDate);
  const competition = toDayNumber(competitionDate);
  if (cup == null || competition == null) return false;
  return competition - cup >= minGap;
}

/**
 * Absolute scheiding tussen twee speeldagen (ongeacht volgorde).
 * Voor dual weeks: twee competitiewedstrijden of beker↔competitie.
 */
export function hasMinimumDaySeparation(
  dateA: string,
  dateB: string,
  minGap: number = MIN_DUAL_WEEK_DAY_GAP,
): boolean {
  if (!dateA || !dateB) return false;
  const a = toDayNumber(dateA);
  const b = toDayNumber(dateB);
  if (a == null || b == null) return false;
  return Math.abs(a - b) >= minGap;
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

/**
 * Dynamische moeilijkheid: weken waar het paar nu nog kan zitten
 * (capaciteit + team-bezetting + optioneel cup-overlap).
 */
function competitionCountInWeek(
  teams: ReadonlySet<number> | ReadonlyMap<number, number>,
  teamId: number,
): number {
  if (teams instanceof Map) return teams.get(teamId) ?? 0;
  return teams.has(teamId) ? 1 : 0;
}

/**
 * Mag deze ploeg nog een competitiewedstrijd in de week krijgen?
 * - max 1: beker blokkeert tenzij allowCupOverlap
 * - max 2: beker telt mee (cup + 1 competitie ok; cup + 2e competitie niet)
 */
export function canAddCompetitionAppearance(
  teams: ReadonlySet<number> | ReadonlyMap<number, number>,
  teamId: number,
  maxAppearances: number,
  cupBusy: boolean,
  allowCupOverlap: boolean,
): boolean {
  const comp = competitionCountInWeek(teams, teamId);
  if (comp >= maxAppearances) return false;
  if (!cupBusy) return true;
  if (!allowCupOverlap) return false;
  // Klassieke uitzondering (max 1): beker + 1 competitie mag via allowCupOverlap.
  if (maxAppearances <= 1) return true;
  // Dual: beker telt als 1 → nog max. 1 competitie.
  return comp + 1 <= maxAppearances - 1;
}

export function countFeasibleWeeksForPair(
  home: number,
  away: number,
  weekCount: number,
  weekCapacity: (weekIndex: number) => number,
  weekUsed: (weekIndex: number) => number,
  teamsPerWeek: (weekIndex: number) => ReadonlySet<number> | ReadonlyMap<number, number>,
  options?: {
    externalBusyTeamsByWeek?: (weekIndex: number) => ReadonlySet<number> | undefined;
    allowCupOverlapForWeek?: (weekIndex: number) => boolean;
    preferredWeekCapacity?: (weekIndex: number) => number;
    preferredUsed?: (weekIndex: number) => number;
    maxTeamAppearancesPerWeek?: 1 | 2;
  },
): number {
  const maxApp = Math.max(1, Math.min(2, options?.maxTeamAppearancesPerWeek ?? 1));
  let n = 0;
  for (let w = 0; w < weekCount; w++) {
    if (weekUsed(w) >= weekCapacity(w)) continue;
    const teams = teamsPerWeek(w);
    const busy = options?.externalBusyTeamsByWeek?.(w);
    const cupHome = Boolean(busy?.has(home));
    const cupAway = Boolean(busy?.has(away));
    const cupBusy = cupHome || cupAway;
    const allowOverlap = Boolean(options?.allowCupOverlapForWeek?.(w));
    if (
      !canAddCompetitionAppearance(teams, home, maxApp, cupHome, allowOverlap) ||
      !canAddCompetitionAppearance(teams, away, maxApp, cupAway, allowOverlap)
    ) {
      continue;
    }
    if (cupBusy && !allowOverlap) continue;
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
  teamsPerWeek: Map<number, Map<number, number>>,
  options?: PackCompetitionOptions,
  repairAttempted?: boolean,
): PackFailureDiagnosis {
  const maxApp = Math.max(1, Math.min(2, options?.maxTeamAppearancesPerWeek ?? 1));
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
    const teamMap = teamsPerWeek.get(w) ?? new Map();
    const busy = options?.externalBusyTeamsByWeek?.(w);
    const allowOverlap = Boolean(options?.allowCupOverlapForWeek?.(w));
    const homeCup = Boolean(busy?.has(m.home));
    const awayCup = Boolean(busy?.has(m.away));
    const homeOk = canAddCompetitionAppearance(
      teamMap,
      m.home,
      maxApp,
      homeCup,
      allowOverlap,
    );
    const awayOk = canAddCompetitionAppearance(
      teamMap,
      m.away,
      maxApp,
      awayCup,
      allowOverlap,
    );
    if (!homeOk || !awayOk) {
      const homeComp = competitionCountInWeek(teamMap, m.home) > 0;
      const awayComp = competitionCountInWeek(teamMap, m.away) > 0;
      if ((homeComp || awayComp) && !(homeCup || awayCup)) {
        weeksTeamCompetition += 1;
        if (sampleBlockedWeeks.length < 3) {
          const blockingTeamIds: number[] = [];
          if (!homeOk && homeComp) blockingTeamIds.push(m.home);
          if (!awayOk && awayComp) blockingTeamIds.push(m.away);
          sampleBlockedWeeks.push({
            weekIndex: w,
            reason: "team_competition",
            blockingTeamIds,
          });
        }
        continue;
      }
      if (homeCup || awayCup) {
        weeksTeamCup += 1;
        if (sampleBlockedWeeks.length < 3) {
          const blockingTeamIds: number[] = [];
          if (busy?.has(m.home)) blockingTeamIds.push(m.home);
          if (busy?.has(m.away)) blockingTeamIds.push(m.away);
          sampleBlockedWeeks.push({
            weekIndex: w,
            reason: "team_cup",
            blockingTeamIds,
          });
        }
      }
      continue;
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
  const maxApp = Math.max(1, Math.min(2, options?.maxTeamAppearancesPerWeek ?? 1)) as 1 | 2;
  const teamsPerWeek: Map<number, Map<number, number>> = new Map();
  const weekToMatches: Map<number, PackableMatch[]> = new Map();
  /** Preferred-capaciteit verbruikt (alleen bij dual-cap / cup-overlap). */
  const preferredUsed = new Map<number, number>();
  /** Welke wedstrijden preferred-cap opeetten (voor unplace). */
  const usedPreferred = new Set<PackableMatch>();
  for (let w = 0; w < weekCount; w++) {
    teamsPerWeek.set(w, new Map());
    weekToMatches.set(w, []);
    preferredUsed.set(w, 0);
  }

  const byMatchday = new Map<string, PackableMatch[]>();
  for (const m of matches) {
    const arr = byMatchday.get(m.matchdayKey) ?? [];
    arr.push(m);
    byMatchday.set(m.matchdayKey, arr);
  }

  const currentWeekByPool = new Map<string, number>();
  const sorted = Array.from(byMatchday.keys()).sort(comparePackMatchdayKeys);
  if (options?.reverseMatchdays) sorted.reverse();
  let placedCount = 0;
  const enableRepair = options?.enableRepair !== false;
  const enableEvacuate = options?.enableEvacuateRepair !== false;
  const enableBacktrack = options?.enableBacktrackRepair !== false;
  const evacuateMaxScopes = Math.max(
    1,
    Math.min(7, options?.evacuateMaxScopes ?? 7),
  );
  const allowCupOverlapAt = (w: number): boolean =>
    Boolean(options?.allowCupOverlapForWeek?.(w));
  const cupOverlapPossible = Boolean(options?.allowCupOverlapForWeek);
  const hasDualCap = Boolean(options?.preferredWeekCapacity);
  const preferredCap = (w: number): number =>
    hasDualCap
      ? Math.max(0, Math.min(weekCapacity(w), options!.preferredWeekCapacity!(w)))
      : weekCapacity(w);
  const reclaimCap = (w: number): number =>
    hasDualCap ? Math.max(0, weekCapacity(w) - preferredCap(w)) : 0;
  const maxRepairAttempts = options?.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
  const maxRepairDepth = options?.maxRepairDepth ?? DEFAULT_MAX_REPAIR_DEPTH;
  let repairBudget = maxRepairAttempts;
  let repairAttempted = false;

  const isCupBusy = (w: number, home: number, away: number): boolean => {
    const busy = options?.externalBusyTeamsByWeek?.(w);
    return Boolean(busy && (busy.has(home) || busy.has(away)));
  };

  type SitTier = "reclaim" | "preferred";

  /**
   * Kan deze wedstrijd in week w? Cup-busy paren gebruiken alleen preferred;
   * niet-bekerparen mogen reclaim (bekerdag-rest) én preferred.
   */
  const sitTier = (
    m: PackableMatch,
    w: number,
    allowCupOverlap = false,
  ): SitTier[] => {
    const cap = weekCapacity(w);
    const list = weekToMatches.get(w)!;
    if (list.length >= cap) return [];
    const teamMap = teamsPerWeek.get(w)!;
    const busy = options?.externalBusyTeamsByWeek?.(w);
    const cupHome = Boolean(busy?.has(m.home));
    const cupAway = Boolean(busy?.has(m.away));
    const cupBusy = cupHome || cupAway;
    const overlapAllowed = allowCupOverlap && allowCupOverlapAt(w);
    if (
      !canAddCompetitionAppearance(teamMap, m.home, maxApp, cupHome, overlapAllowed) ||
      !canAddCompetitionAppearance(teamMap, m.away, maxApp, cupAway, overlapAllowed)
    ) {
      return [];
    }

    if (cupBusy && !overlapAllowed) return [];

    if (!hasDualCap) return ["preferred"];

    const prefUsed = preferredUsed.get(w)!;
    const reclaimUsed = list.length - prefUsed;
    const tiers: SitTier[] = [];
    if (cupBusy) {
      // Soft dual-cap: cup-overlap mag elk vrij moment; preferred-tracking is
      // alleen zodat niet-bekerparen reclaim eerst vullen.
      tiers.push("preferred");
      return tiers;
    }
    // Niet-beker: eerst reclaim (bescherm preferred voor overlap-paren)
    if (reclaimUsed < reclaimCap(w)) tiers.push("reclaim");
    if (prefUsed < preferredCap(w) || list.length < cap) {
      // Preferred nog open, of totale restcapaciteit (soft)
      tiers.push("preferred");
    }
    return tiers;
  };

  const canSit = (
    m: PackableMatch,
    w: number,
    allowCupOverlap = false,
  ): boolean => sitTier(m, w, allowCupOverlap).length > 0;

  const placeAt = (m: PackableMatch, w: number, tier: SitTier = "preferred"): void => {
    const teamMap = teamsPerWeek.get(w)!;
    teamMap.set(m.home, (teamMap.get(m.home) ?? 0) + 1);
    teamMap.set(m.away, (teamMap.get(m.away) ?? 0) + 1);
    weekToMatches.get(w)!.push(m);
    if (tier === "preferred") {
      preferredUsed.set(w, preferredUsed.get(w)! + 1);
      usedPreferred.add(m);
    }
  };

  const unplaceAt = (m: PackableMatch, w: number): boolean => {
    const list = weekToMatches.get(w)!;
    const idx = list.findIndex((x) => matchesEqual(x, m));
    if (idx < 0) return false;
    list.splice(idx, 1);
    const teamMap = teamsPerWeek.get(w)!;
    const dec = (id: number) => {
      const next = (teamMap.get(id) ?? 0) - 1;
      if (next <= 0) teamMap.delete(id);
      else teamMap.set(id, next);
    };
    dec(m.home);
    dec(m.away);
    if (usedPreferred.has(m)) {
      preferredUsed.set(w, Math.max(0, preferredUsed.get(w)! - 1));
      usedPreferred.delete(m);
    }
    return true;
  };

  const preferFreshWeeks =
    options?.preferFreshWeeks ?? maxApp >= 2;

  /** 0 = beide ploegen nog vrij; hoger = meer dual-druk. */
  const dualPressure = (m: PackableMatch, w: number): number => {
    const teamMap = teamsPerWeek.get(w)!;
    const busy = options?.externalBusyTeamsByWeek?.(w);
    const load = (id: number) =>
      competitionCountInWeek(teamMap, id) + (busy?.has(id) ? 1 : 0);
    return (load(m.home) > 0 ? 1 : 0) + (load(m.away) > 0 ? 1 : 0);
  };

  const tryPlace = (
    m: PackableMatch,
    startWeek: number,
    allowCupOverlap = false,
    preferReclaim = true,
  ): number | null => {
    // Bij dual-cap: niet-bekerparen vullen eerst reclaim-weken
    if (hasDualCap && preferReclaim && !allowCupOverlap) {
      for (let w = startWeek; w < weekCount; w++) {
        const tiers = sitTier(m, w, false);
        if (tiers.includes("reclaim")) {
          // Met preferFresh: reclaim alleen als beide ploegen nog vrij zijn
          if (preferFreshWeeks && dualPressure(m, w) > 0) continue;
          placeAt(m, w, "reclaim");
          return w;
        }
      }
    }

    const placeInWeek = (w: number): number | null => {
      const tiers = sitTier(m, w, allowCupOverlap);
      if (tiers.length === 0) return null;
      const tier = allowCupOverlap
        ? "preferred"
        : tiers.includes("reclaim")
          ? "reclaim"
          : tiers[0];
      placeAt(m, w, tier);
      return w;
    };

    // Eerst weken zonder dual-druk (beide ploegen 0×), daarna rest
    if (preferFreshWeeks) {
      for (let w = startWeek; w < weekCount; w++) {
        if (dualPressure(m, w) > 0) continue;
        const placed = placeInWeek(w);
        if (placed != null) return placed;
      }
      for (let w = 0; w < startWeek; w++) {
        if (dualPressure(m, w) > 0) continue;
        const placed = placeInWeek(w);
        if (placed != null) return placed;
      }
    }

    for (let w = startWeek; w < weekCount; w++) {
      const placed = placeInWeek(w);
      if (placed != null) return placed;
    }
    if (preferFreshWeeks) {
      for (let w = 0; w < startWeek; w++) {
        const placed = placeInWeek(w);
        if (placed != null) return placed;
      }
    }
    return null;
  };

  /** Zoek alternatieve week (exclusief fromWeek). Prefer verse weken, dan zonder beker-overlap. */
  const findAlternateWeek = (
    m: PackableMatch,
    fromWeek: number,
    startWeek = 0,
  ): { week: number; tier: SitTier } | null => {
    const scan = (allowCup: boolean, freshOnly: boolean) => {
      for (let w = startWeek; w < weekCount; w++) {
        if (w === fromWeek) continue;
        if (freshOnly && dualPressure(m, w) > 0) continue;
        const tiers = sitTier(m, w, allowCup);
        if (tiers.length === 0) continue;
        const tier = allowCup
          ? "preferred"
          : tiers.includes("reclaim")
            ? "reclaim"
            : tiers[0];
        return { week: w, tier };
      }
      return null;
    };
    if (preferFreshWeeks) {
      const fresh = scan(false, true);
      if (fresh) return fresh;
    }
    const exclusive = scan(false, false);
    if (exclusive) return exclusive;
    if (cupOverlapPossible) {
      if (preferFreshWeeks) {
        const freshCup = scan(true, true);
        if (freshCup) return freshCup;
      }
      return scan(true, false);
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
    moved: Array<{ match: PackableMatch; from: number; tier: SitTier }>,
  ): void => {
    for (const mv of moved.reverse()) {
      const cur = findWeekOf(mv.match);
      if (cur != null) unplaceAt(mv.match, cur);
      placeAt(mv.match, mv.from, mv.tier);
    }
  };

  const tierOf = (m: PackableMatch): SitTier =>
    usedPreferred.has(m) ? "preferred" : "reclaim";

  /**
   * Verplaats conflict naar een andere week.
   * depth>=1: als geen vrije week, verplaats eerst een blocker van een kandidaat-week.
   */
  const moveMatchAway = (
    conflict: PackableMatch,
    fromWeek: number,
    depth: number,
    movedLog: Array<{ match: PackableMatch; from: number; tier: SitTier }>,
  ): boolean => {
    if (repairBudget <= 0) return false;
    repairBudget -= 1;
    repairAttempted = true;

    const alt = findAlternateWeek(conflict, fromWeek, 0);
    if (alt != null) {
      const prevTier = tierOf(conflict);
      if (!unplaceAt(conflict, fromWeek)) return false;
      placeAt(conflict, alt.week, alt.tier);
      movedLog.push({ match: conflict, from: fromWeek, tier: prevTier });
      return true;
    }

    if (depth < 1) return false;

    for (let cand = 0; cand < weekCount; cand++) {
      if (cand === fromWeek) continue;
      if (weekToMatches.get(cand)!.length >= weekCapacity(cand)) continue;
      const cupBlocks =
        isCupBusy(cand, conflict.home, conflict.away) && !allowCupOverlapAt(cand);
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
        const tiers =
          sitTier(conflict, cand, false).length > 0
            ? sitTier(conflict, cand, false)
            : allowCupOverlapAt(cand)
              ? sitTier(conflict, cand, true)
              : [];
        if (tiers.length > 0) {
          const prevTier = tierOf(conflict);
          if (!unplaceAt(conflict, fromWeek)) {
            restoreMoves(movedLog.splice(beforeLen));
            continue;
          }
          const tier = tiers.includes("reclaim") ? "reclaim" : tiers[0];
          placeAt(conflict, cand, tier);
          movedLog.push({ match: conflict, from: fromWeek, tier: prevTier });
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
        const tiers = sitTier(m, w, allowCup);
        if (tiers.length === 0) continue;
        const tier = allowCup
          ? "preferred"
          : tiers.includes("reclaim")
            ? "reclaim"
            : tiers[0];
        placeAt(m, w, tier);
        return w;
      }
      return null;
    };

    const direct =
      tryDirect(false) ?? (cupOverlapPossible ? tryDirect(true) : null);
    if (direct != null) return direct;

    for (let w = 0; w < weekCount; w++) {
      const cupOverlap = isCupBusy(w, m.home, m.away);
      if (cupOverlap && !allowCupOverlapAt(w)) continue;
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
      const movedLog: Array<{ match: PackableMatch; from: number; tier: SitTier }> = [];
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
      const tiers =
        sitTier(m, week, false).length > 0
          ? sitTier(m, week, false)
          : allowCupOverlapAt(week)
            ? sitTier(m, week, true)
            : [];
      if (ok && tiers.length > 0) {
        const tier = tiers.includes("reclaim") ? "reclaim" : tiers[0];
        placeAt(m, week, tier);
        return week;
      }
      restoreMoves(movedLog);
    }

    return null;
  };

  /**
   * Near-miss: haal wedstrijden weg, plaats altijd eerst de vastgelopen,
   * daarna de rest (moeilijkste eerst). Breidt stapsgewijs uit tot meer
   * speeldagen / de andere pool — anders vult “moeilijkste eerst” precies
   * de weken die de stuck-wedstrijd nodig heeft.
   */
  const tryEvacuateRepair = (stuck: PackableMatch): number | null => {
    if (!enableEvacuate || !enableRepair) return null;
    repairAttempted = true;
    // Extra budget: herschikken van tientallen wedstrijden eet sneller dan
    // de standaard repair-limiet.
    repairBudget = Math.max(repairBudget, maxRepairAttempts * 2);

    const keyOf = (m: PackableMatch) => `${m.matchdayKey}:${m.home}-${m.away}`;

    const attemptEvacuate = (
      extra: PackableMatch[],
    ): number | null => {
      const involvedMap = new Map<string, { match: PackableMatch; from: number; tier: SitTier }>();
      const remember = (x: PackableMatch, w: number) => {
        const key = keyOf(x);
        if (!involvedMap.has(key)) {
          involvedMap.set(key, { match: x, from: w, tier: tierOf(x) });
        }
      };
      for (let w = 0; w < weekCount; w++) {
        for (const x of weekToMatches.get(w)!) {
          if (
            x.home === stuck.home ||
            x.away === stuck.home ||
            x.home === stuck.away ||
            x.away === stuck.away
          ) {
            remember(x, w);
          }
        }
      }
      for (const m of extra) {
        const w = findWeekOf(m);
        if (w != null) remember(m, w);
      }

      const involved = [...involvedMap.values()];
      if (involved.length === 0 && extra.length === 0) return null;

      for (const mv of involved) {
        unplaceAt(mv.match, mv.from);
      }

      const feasibleDuring = () => ({
        externalBusyTeamsByWeek: options?.externalBusyTeamsByWeek,
        allowCupOverlapForWeek: options?.allowCupOverlapForWeek,
        preferredWeekCapacity: options?.preferredWeekCapacity,
        preferredUsed: (w: number) => preferredUsed.get(w)!,
        maxTeamAppearancesPerWeek: maxApp,
      });

      const toReplace = [...involved.map((x) => x.match)];
      if (!toReplace.some((x) => matchesEqual(x, stuck))) toReplace.push(stuck);

      // Vastgelopen wedstrijd altijd eerst — daarna moeilijkste eerst.
      const rest = toReplace.filter((m) => !matchesEqual(m, stuck));
      rest.sort((a, b) => {
        const da = countFeasibleWeeksForPair(
          a.home,
          a.away,
          weekCount,
          weekCapacity,
          (w) => weekToMatches.get(w)!.length,
          (w) => teamsPerWeek.get(w)!,
          feasibleDuring(),
        );
        const db = countFeasibleWeeksForPair(
          b.home,
          b.away,
          weekCount,
          weekCapacity,
          (w) => weekToMatches.get(w)!.length,
          (w) => teamsPerWeek.get(w)!,
          feasibleDuring(),
        );
        if (da !== db) return da - db;
        return a.home - b.home || a.away - b.away;
      });
      const ordered = [stuck, ...rest];

      const placedInEvacuate: PackableMatch[] = [];
      let stuckWeek: number | null = null;
      for (const m of ordered) {
        let week =
          tryPlace(m, 0, false) ??
          (cupOverlapPossible ? tryPlace(m, 0, true, false) : null);
        if (week == null) week = tryRepairPlace(m);
        if (week == null) {
          for (const p of placedInEvacuate) {
            const cur = findWeekOf(p);
            if (cur != null) unplaceAt(p, cur);
          }
          for (const mv of involved) {
            placeAt(mv.match, mv.from, mv.tier);
          }
          return null;
        }
        placedInEvacuate.push(m);
        if (matchesEqual(m, stuck)) stuckWeek = week;
      }
      return stuckWeek;
    };

    const matchesForKeys = (keys: string[]): PackableMatch[] => {
      const out: PackableMatch[] = [];
      for (const md of keys) {
        for (const m of byMatchday.get(md) ?? []) out.push(m);
      }
      return out;
    };

    const pool = parsePoolKey(stuck.matchdayKey);
    const poolKeys = sorted.filter((k) => parsePoolKey(k) === pool);
    const otherPoolKeys = sorted.filter((k) => parsePoolKey(k) !== pool);
    const stuckIdx = poolKeys.indexOf(stuck.matchdayKey);

    // Cascading scopes: alleen de twee ploegen → recente speeldagen → vanaf
    // stuck-speeldag → hele pool-staart → + andere pool (gedeelde weken).
    const scopes: PackableMatch[][] = [
      [],
      matchesForKeys(poolKeys.slice(-3)),
      matchesForKeys(poolKeys.slice(-6)),
      matchesForKeys(
        stuckIdx >= 0 ? poolKeys.slice(Math.max(0, stuckIdx - 1)) : poolKeys.slice(-8),
      ),
      matchesForKeys(poolKeys.slice(-12)),
      matchesForKeys([
        ...poolKeys.slice(-8),
        ...otherPoolKeys.slice(-4),
      ]),
      matchesForKeys([
        ...poolKeys.slice(Math.max(0, poolKeys.length - 16)),
        ...otherPoolKeys.slice(-8),
      ]),
    ];

    for (const extra of scopes.slice(0, evacuateMaxScopes)) {
      const week = attemptEvacuate(extra);
      if (week != null) return week;
    }
    return null;
  };

  /**
   * Beperkte backtrack voor de laatste open wedstrijden (near-miss).
   * Probeert week-keuzes systematisch i.p.v. pure greedy.
   */
  const tryBacktrackRemaining = (
    stuck: PackableMatch,
    remaining: PackableMatch[],
  ): number | null => {
    if (!enableRepair) return null;
    repairAttempted = true;
    const MAX_NODES = 8_000;
    let nodes = 0;

    const order = [stuck, ...remaining.filter((m) => !matchesEqual(m, stuck))];
    // Snapshot van wat we tijdelijk plaatsen tijdens search
    const placedNow: PackableMatch[] = [];

    const candidatesFor = (m: PackableMatch): number[] => {
      const weeks: number[] = [];
      const pushUnique = (w: number) => {
        if (!weeks.includes(w)) weeks.push(w);
      };
      for (let w = 0; w < weekCount; w++) {
        if (canSit(m, w, false)) pushUnique(w);
      }
      if (cupOverlapPossible) {
        for (let w = 0; w < weekCount; w++) {
          if (canSit(m, w, true)) pushUnique(w);
        }
      }
      // Verse weken eerst (minder dual-druk), daarna rest
      return weeks.sort((a, b) => dualPressure(m, a) - dualPressure(m, b) || a - b);
    };

    const dfs = (idx: number): boolean => {
      if (nodes++ > MAX_NODES) return false;
      if (idx >= order.length) return true;
      const m = order[idx];
      const weeks = candidatesFor(m);
      for (const w of weeks) {
        const tiers =
          sitTier(m, w, false).length > 0
            ? sitTier(m, w, false)
            : sitTier(m, w, true);
        if (tiers.length === 0) continue;
        const tier = tiers.includes("reclaim") ? "reclaim" : tiers[0];
        placeAt(m, w, tier);
        placedNow.push(m);
        if (dfs(idx + 1)) return true;
        placedNow.pop();
        unplaceAt(m, w);
      }
      return false;
    };

    if (!dfs(0)) {
      for (const m of placedNow) {
        const cur = findWeekOf(m);
        if (cur != null) unplaceAt(m, cur);
      }
      return null;
    }
    return findWeekOf(stuck);
  };

  const feasibleOpts = {
    externalBusyTeamsByWeek: options?.externalBusyTeamsByWeek,
    allowCupOverlapForWeek: options?.allowCupOverlapForWeek,
    preferredWeekCapacity: options?.preferredWeekCapacity,
    preferredUsed: (w: number) => preferredUsed.get(w)!,
    maxTeamAppearancesPerWeek: maxApp,
  };

  const orderMatchdayMatches = (mdMatches: PackableMatch[]): PackableMatch[] => {
    let list = [...mdMatches];
    if (options?.orderByDifficulty) {
      list.sort((a, b) => {
        const da = countFeasibleWeeksForPair(
          a.home,
          a.away,
          weekCount,
          weekCapacity,
          (w) => weekToMatches.get(w)!.length,
          (w) => teamsPerWeek.get(w)!,
          feasibleOpts,
        );
        const db = countFeasibleWeeksForPair(
          b.home,
          b.away,
          weekCount,
          weekCapacity,
          (w) => weekToMatches.get(w)!.length,
          (w) => teamsPerWeek.get(w)!,
          feasibleOpts,
        );
        if (da !== db) return da - db;
        // Fallback: statische beker-krapte
        const ca = countCupFreeWeeksForPair(
          a.home,
          a.away,
          weekCount,
          options.externalBusyTeamsByWeek,
        );
        const cb = countCupFreeWeeksForPair(
          b.home,
          b.away,
          weekCount,
          options.externalBusyTeamsByWeek,
        );
        if (ca !== cb) return ca - cb;
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
      // Eerdere near-miss-backtrack kan deze wedstrijd al geplaatst hebben
      const already = findWeekOf(m);
      if (already != null) {
        placedCount += 1;
        maxWeekUsed = Math.max(maxWeekUsed, already);
        continue;
      }

      // Eerst weken zonder beker; uitzonderlijkzelfde week pas als dat faalt
      let week =
        tryPlace(m, poolWeek, false) ?? tryPlace(m, 0, false);
      if (week == null && cupOverlapPossible) {
        week = tryPlace(m, poolWeek, true, false) ?? tryPlace(m, 0, true, false);
      }
      if (week == null) {
        week = tryRepairPlace(m);
      }
      if (week == null && isPackNearMiss(placedCount, matches.length)) {
        // Extra budget voor near-miss evacuate / backtrack
        repairBudget = Math.max(repairBudget, maxRepairAttempts * 2);
        week = tryEvacuateRepair(m);
      }
      if (
        week == null &&
        enableBacktrack &&
        isPackNearMiss(placedCount, matches.length)
      ) {
        // Verzamel nog niet geplaatste wedstrijden (huidige + rest speeldagen)
        const remaining: PackableMatch[] = [];
        const seen = new Set<string>();
        const note = (x: PackableMatch) => {
          const k = `${x.matchdayKey}:${x.home}-${x.away}`;
          if (seen.has(k)) return;
          seen.add(k);
          remaining.push(x);
        };
        note(m);
        const fromIdx = Math.max(0, sorted.indexOf(md));
        for (const laterMd of sorted.slice(fromIdx)) {
          for (const x of byMatchday.get(laterMd) ?? []) {
            if (findWeekOf(x) == null) note(x);
          }
        }
        // Beperk backtrack tot behapbaar aantal
        if (remaining.length <= 28) {
          const btWeek = tryBacktrackRemaining(m, remaining.slice(0, 28));
          if (btWeek != null) {
            week = btWeek;
            // Latere wedstrijden die backtrack al plaatste tellen mee via
            // de already-check hierboven; stuck zelf hier.
          }
        }
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
  return left > 0 && (left <= 20 || placedCount / totalMatches >= 0.9);
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
          ? `${diagnosis.weeksFull} week(en) zitten vol. Op bekerweken blijven ongebruikte momenten beschikbaar, maar een ploeg mag max. 1× per week. Minder bekerweken of een langere periode helpt.`
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
        ? "Op bekerweken blijven de momenten die de beker niet gebruikt beschikbaar. Standaard speelt een ploeg max. 1× per week; uitzonderlijk mag beker + competitie als er ≥3 dagen tussen zitten (bv. ma beker → do/vr competitie)."
        : "Op bekerweken blijven de momenten die de beker niet gebruikt beschikbaar, maar een ploeg mag max. 1× per week spelen.",
    );
  }

  return parts.join(" ");
}
