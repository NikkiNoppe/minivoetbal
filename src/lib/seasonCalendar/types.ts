/** Shared seizoenskalender types — competitie, beker, playoffs. */

export type SeasonPhase = "competition" | "cup" | "playoff" | "vacation" | "blocked" | "free";

export type DaySeparation = {
  early: number;
  late: number;
  earlyLabel: string;
  lateLabel: string;
  separated: boolean;
};

export type SlotStatus =
  | "available"
  | "blocked_config"
  | "occupied_competition"
  | "occupied_cup"
  | "occupied_playoff";

export type EffectiveSlot = {
  index: number;
  status: SlotStatus;
  venue?: string;
  dayOfWeek?: number | null;
  startTime?: string | null;
  matchDate?: string;
};

export type WeekSlotGrid = {
  weekMonday: string;
  slots: EffectiveSlot[];
  /** Slots beschikbaar na config-blokkades (valid_from/until, unavailability). */
  configAvailableCount: number;
  /** Slots beschikbaar na config + bestaande wedstrijd-occupancy. */
  freeCount: number;
  occupiedCompetition: number;
  occupiedCup: number;
  occupiedPlayoff: number;
  blockedConfig: number;
};

export type OccupancyPhase = "competition" | "cup" | "playoff";

export type OccupancyMatchLike = {
  match_date?: string | null;
  location?: string | null;
  match_time?: string | null;
  is_cup_match?: boolean | null;
  is_playoff_match?: boolean | null;
};

export type SlotDetailLike = {
  venue: string;
  timeslot: {
    day_of_week?: number | null;
    start_time?: string | null;
    venue_id?: number;
    timeslot_id?: number;
    valid_from?: string | null;
    valid_until?: string | null;
    available_when_blocked_timeslot_id?: number;
  } | null;
};

export type SeasonWeekPlan = {
  weekMonday: string;
  phases: SeasonPhase[];
  freeCount: number;
  configAvailableCount: number;
  reservedCupSlots?: number;
  reservedCompetitionSlots?: number;
  reservedPlayoffSlots?: number;
  /** Gedeelde week: beker + competitie op verschillende speeldagen. */
  sharedDayHint?: string | null;
  label?: string;
};

export type SeasonDemand = {
  competitionMatches: number;
  /**
   * Speeldagen (parallel over reeksen). Beperkt weken sterker dan wedstrijden÷slots
   * omdat een ploeg max. 1× per week speelt — bv. 11 teams × 3 rondes = 33 speeldagen.
   */
  competitionMatchdays?: number;
  cupTeamCount: number;
  playoffMatchdays: number;
  /**
   * balanced (default) = beker op de beste weken, competitie errond.
   * competition-first = competitie op de vroegste weken, beker/play-offs erna.
   */
  phaseStrategy?: "balanced" | "competition-first";
  /** auto (default) of handmatig gekozen bekerweken. */
  cupWeekMode?: "auto" | "manual";
  /** ISO-maandagen die als bekerweek geprefereerd/vastgezet zijn. */
  cupPreferredWeeks?: string[];
  /**
   * ISO-maandagen die speelbaar blijven ondanks vakantie (seizoensopzet-uitzondering).
   */
  playableVacationWeeks?: string[];
};

export type SeasonPlan = {
  weeks: SeasonWeekPlan[];
  cupDates: string[];
  /** Bekerweken die tegelijk competitie mogen hebben (dagscheiding). */
  sharedCupMondays: string[];
  playoffWeeks: string[];
  competitionWeeks: string[];
  cupBracket: {
    firstRoundPairs: number;
    firstRoundWeeks: number;
    requiredWeeks: number;
    slotsPerWeekUsed: number;
  };
  /** Voorkeursdagen bij gedeelde weken (beker vroeg / competitie laat). */
  daySeparation: DaySeparation;
  efficiency: {
    playableWeeks: number;
    usableWeeks: number;
    totalFreeSlots: number;
    reservedSlots: number;
    utilization: number;
    weekWaste: number;
    /** Weken waar beker én competitie samen vallen. */
    sharedWeeks: number;
  };
  rationale: string[];
  notes: string[];
};

export type ReserveCupWeeksResult = {
  dates: string[];
  overlappingMondays: string[];
  freeWeeksAvailable: number;
  firstRoundWeeks: number;
  requiredWeeks: number;
  effectiveSlotsPerWeek: number;
  daySeparation: DaySeparation;
  notes: string[];
  rationale: string[];
};
