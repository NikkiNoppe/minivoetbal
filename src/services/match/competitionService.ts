import { supabase } from "@/integrations/supabase/client";
// import { localDateTimeToISO } from "@/lib/dateUtils"; // already imported at top of file
import { seasonService } from "@/services/seasonService";
import { priorityOrderService } from "@/services/priorityOrderService";
import { teamService } from "@/services/core/teamService";
import { normalizeTeamsPreferences, scoreTeamForDetails, TeamPreferencesNormalized, TeamSeasonalFairness } from "@/services/core/teamPreferencesService";
import { playoffService } from "@/services/match/playoffService";
import { bekerService as cupService } from "./cupService";
import { localDateTimeToISO } from "@/lib/dateUtils";
import { normalizeVenueName } from "@/lib/utils";
import { getRpcSessionArgs } from "@/lib/authSession";
import { loadSlotPlanningContext } from "@/services/match/slotPlanningContext";
import {
  packCompetitionMatchdays,
  sumWeekCapacities,
  formatPackFailureMessage,
  buildPackFailureSuggestions,
  shuffleArray,
  rotateMatchdaysByPool,
  hasSufficientSameWeekDayGap,
  hasSufficientDayGapBetweenDates,
  hasMinimumDaySeparation,
  MIN_DUAL_WEEK_DAY_GAP,
  type PackFailureSuggestion,
} from "@/lib/competitionWeekPacking";
import { scopeSlotsByPreferredDayDistance, appendPeriodBoundedSlots } from "@/lib/competitionPreferredDayScope";
import { isPeriodBoundedTimeslot } from "@/lib/timeslotAvailability";
import { matchDateFromWeekMonday } from "@/lib/cupBracketPlan";
import type { CompetitionFormat } from "@/services/competitionDataService";
import {
  bulkInsertMatchesForSession,
  fetchMatchesForSession,
} from "@/services/core/matchesSessionBulk";

export interface CompetitionMatch {
  match_id: number;
  unique_number?: string;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name?: string;
  away_team_name?: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string;
  location: string;
  speeldag: string;
  is_playoff_match: boolean;
  playoff_round?: string;
  playoff_position?: string;
  is_submitted: boolean;
  is_locked: boolean;
  referee?: string;
  referee_notes?: string;
}

export type { CompetitionFormat } from "@/services/competitionDataService";

export interface CompetitionConfig {
  format: CompetitionFormat;
  start_date: string;
  end_date: string;
  teams: number[];
  /** Actieve tenant — venues/timeslots uit season_data (Instellingen). */
  organizationId?: number;
  /** team_id → division.id wanneer format.has_divisions */
  teamDivisions?: Record<number, number>;
  /**
   * Geplande bekerweken (ISO-datums of maandagen).
   * Bij meerdere speeldagen: competitie mag vrije momenten op die weken gebruiken
   * (andere dag dan de beker). Zet shareCupWeeks=false om hele bekerweken uit te sluiten.
   */
  reservedCupMondays?: string[];
  /**
   * false = bekerweken volledig exclusief.
   * true/undefined = bij dagscheiding vrije slots op bekerweken meenemen voor competitie.
   */
  shareCupWeeks?: boolean;
  /** Bij gedeelde weken: competitie prefereert deze weekdag (0=zo … 6=za). */
  competitionPreferredDayOfWeek?: number;
  /** Bij gedeelde weken: beker prefereert deze weekdag — die slots blijven vrij voor beker. */
  cupPreferredDayOfWeek?: number;
  /**
   * Teams die op die maandag (ISO) al beker spelen.
   * Competitie mag die teams die week niet ook inzetten (geen 2× spelen).
   */
  cupBusyTeamsByMonday?: Record<string, number[]>;
  /**
   * Echte bekerdatums per ploeg, per ISO-maandag: `{ "2026-10-05": { 12: ["2026-10-05"] } }`.
   * Nodig om de ≥3-dagen-uitzondering op de werkelijke wedstrijddag te toetsen
   * i.p.v. op de theoretische bekerdag.
   */
  cupTeamDatesByMonday?: Record<string, Record<number, string[]>>;
  /** Slot-indices die de beker al claimt die week — competitie mag ze niet hergebruiken. */
  cupOccupiedSlotsByMonday?: Record<string, number[]>;
  /**
   * Bekerweken waar competitie de resterende speelmomenten mag gebruiken.
   * Komt uit het seizoensplan zodat kalender en preview dezelfde weken delen.
   */
  sharedCupMondays?: string[];
  /** Play-offweken uit seizoensplan — niet gebruiken voor competitiepacking. */
  reservedPlayoffMondays?: string[];
  /**
   * Geforceerd schema: max. 2 wedstrijden/ploeg/week (beker telt mee),
   * nooit op dezelfde dag. Alleen als laatste redmiddel via preview-knop.
   */
  allowDualMatchWeek?: boolean;
  /** Voortgang tijdens packing (0–100) + label — voor UI-percentage. */
  onProgress?: (progress: { percent: number; label: string }) => void;
}

export type DivisionAwareMatch = {
  home: number;
  away: number;
  round: number;
  matchday: number;
  /** Unieke sleutel zodat reeksen elkaars speeldagen niet mengen */
  matchdayKey: string;
  divisionId: number | null;
  divisionName: string | null;
};

/** Pool + speeldagnummer uit `divisionId-matchday` of `all-matchday`. */
export function parseMatchdayKey(key: string): { poolKey: string; matchday: number } {
  const i = key.lastIndexOf("-");
  if (i < 0) return { poolKey: "all", matchday: Number(key) || 0 };
  return {
    poolKey: key.slice(0, i) || "all",
    matchday: Number(key.slice(i + 1)) || 0,
  };
}

/**
 * Speeldagnummer eerst (reeksen parallel), daarna pool.
 * Voorkomt dat reeks A speeldag 1–30 volledig vóór reeks B loopt.
 */
export function compareMatchdayKeys(a: string, b: string): number {
  const pa = parseMatchdayKey(a);
  const pb = parseMatchdayKey(b);
  if (pa.matchday !== pb.matchday) return pa.matchday - pb.matchday;
  return pa.poolKey.localeCompare(pb.poolKey, undefined, { numeric: true });
}

function matchdaysForTeamCount(teamCount: number, rounds: number): number {
  const n = Math.max(0, teamCount);
  const r = Math.max(0, rounds);
  if (n < 2 || r < 1) return 0;
  const perRound = n % 2 === 0 ? n - 1 : n;
  return r * perRound;
}

export const competitionService = {
  // Herbruikbare functies van cupService
  addDaysToDate: cupService.addDaysToDate,
  convertToPlayingWeeks: cupService.convertToPlayingWeeks,

  // Helper functions voor validatie
  validateCompetitionInput(config: CompetitionConfig): { isValid: boolean; message?: string } {
    if (config.teams.length < 4) {
      return { isValid: false, message: "Er zijn minimaal 4 teams nodig voor een competitie" };
    }

    if (!config.format) {
      return { isValid: false, message: "Er moet een competitieformat geselecteerd zijn" };
    }

    if (!config.start_date || !config.end_date) {
      return { isValid: false, message: "Start en einddatum zijn verplicht" };
    }

    if (config.format.has_divisions && (config.format.divisions?.length ?? 0) >= 2) {
      const divisions = [...(config.format.divisions ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const assignment = config.teamDivisions ?? {};
      const unassigned = config.teams.filter((teamId) => assignment[teamId] == null);
      if (unassigned.length > 0) {
        return {
          isValid: false,
          message: `Wijs alle geselecteerde teams toe aan een reeks (${unassigned.length} nog open).`,
        };
      }

      for (const division of divisions) {
        const count = config.teams.filter((teamId) => assignment[teamId] === division.id).length;
        if (count > 0 && count < 4) {
          return {
            isValid: false,
            message: `Reeks “${division.name}” heeft ${count} teams; minimaal 4 per reeks vereist.`,
          };
        }
        if (count === 0) {
          return {
            isValid: false,
            message: `Reeks “${division.name}” heeft nog geen teams.`,
          };
        }
      }

      const validDivisionIds = new Set(divisions.map((d) => d.id));
      for (const teamId of config.teams) {
        const divisionId = assignment[teamId];
        if (divisionId == null || !validDivisionIds.has(divisionId)) {
          return {
            isValid: false,
            message: "Elk team moet aan een geldige reeks toegewezen zijn.",
          };
        }
      }
    }

    return { isValid: true };
  },

  async checkExistingCompetition(): Promise<{ exists: boolean; message?: string }> {
    const existingMatches = (await fetchMatchesForSession({ is_cup_match: false }))
      .filter((m) => !m.is_playoff_match);

    if (existingMatches.length > 0) {
      return { exists: true, message: "Er bestaat al een reguliere competitie. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten." };
    }

    return { exists: false };
  },

  async checkExistingCupMatches(): Promise<{
    exists: boolean;
    message?: string;
    cupDates?: string[];
    matchCount?: number;
  }> {
    const existingCupMatches = await fetchMatchesForSession({ is_cup_match: true });

    if (existingCupMatches.length > 0) {
      // Extraheer unieke datums van bekerwedstrijden
      const cupDates = [...new Set(existingCupMatches.map(match => String(match.match_date).split('T')[0]))];
      return {
        exists: true,
        message: "Er bestaat al een bekertoernooi.",
        cupDates,
        matchCount: existingCupMatches.length,
      };
    }

    return { exists: false, matchCount: 0 };
  },

  async validateSeasonData(organizationId?: number): Promise<{ isValid: boolean; message?: string; data?: any }> {
    const seasonData = await seasonService.getSeasonData(organizationId);
    
    const venues = seasonData.venues || [];
    const timeslots = seasonData.venue_timeslots || [];
    const vacations = seasonData.vacation_periods || [];
    const formats = seasonData.competition_formats || [];
    const day_names = seasonData.day_names || [];
    
    if (venues.length === 0) {
      return { isValid: false, message: "Geen venues beschikbaar in de database. Configureer eerst de competitiedata." };
    }
    
    if (timeslots.length === 0) {
      return { isValid: false, message: "Geen tijdslots beschikbaar in de database. Configureer eerst de competitiedata." };
    }

    if (formats.length === 0) {
      return { isValid: false, message: "Geen competitieformaten beschikbaar in de database. Configureer eerst de competitiedata." };
    }

    return { isValid: true, data: { venues, timeslots, vacations, formats, day_names } };
  },

  // Genereer automatisch speelweken gebaseerd op seizoen data
  async generatePlayingWeeks(config: CompetitionConfig): Promise<{
    weeks: string[];
    message: string;
    softShare?: boolean;
    cupPreferredDayOfWeek?: number | null;
    competitionPreferredDayOfWeek?: number | null;
    sharedCupMondays?: string[];
  }> {
    try {
      const seasonData = await seasonService.getSeasonData(config.organizationId);
      const vacations = seasonData.vacation_periods || [];
      const { normalizeSeasonSetup } = await import("@/lib/seasonSetup");
      const playableVacationWeeks =
        normalizeSeasonSetup(seasonData.season_setup).playableVacationWeeks ?? [];

      const { cupDates } = await this.checkExistingCupMatches();
      const existingMatchesAll = await fetchMatchesForSession({});

      const {
        listSeasonPlayableWeeks,
        buildSeasonSlotGrids,
        buildSlotDetailsFromSeasonData,
        capacityForWeek,
        resolveEffectiveSlotsPerWeek,
      } = await import("@/lib/seasonCalendar");
      const { filterActiveSlotUnavailability } = await import("@/services/slotUnavailabilityService");
      const { toMondayIso, pickSpacedPlayDayPair, getConfiguredPlayDays } = await import(
        "@/lib/competitionPlanningEstimate"
      );

      const playable = listSeasonPlayableWeeks(
        config.start_date,
        config.end_date,
        vacations,
        playableVacationWeeks,
      );
      const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
      const grids = buildSeasonSlotGrids({
        weekMondays: playable,
        slotDetails,
        blocks: filterActiveSlotUnavailability(seasonData.slot_unavailability),
        vacations,
        playableVacationWeeks,
        matches: existingMatchesAll.map((m: Record<string, unknown>) => ({
          match_date: m.match_date as string | undefined,
          location: m.location as string | undefined,
          match_time: m.match_time as string | undefined,
          is_cup_match: Boolean(m.is_cup_match),
          is_playoff_match: Boolean(m.is_playoff_match),
        })),
      });

      const plannedCupMondays = new Set(
        (config.reservedCupMondays || []).map((d) => toMondayIso(d)),
      );
      const existingCupMondays = new Set((cupDates || []).map((d) => toMondayIso(d)));
      const reservedPlayoffMondays = new Set(
        (config.reservedPlayoffMondays || []).map((d) => toMondayIso(d)),
      );

      const daySep = pickSpacedPlayDayPair(
        getConfiguredPlayDays(seasonData.venue_timeslots || []),
      );
      // Soft share: geplande bekerweken meenemen als er meerdere speeldagen zijn,
      // zodat vrije momenten (andere dag) competitiewedstrijden kunnen krijgen.
      // Het seizoensplan bepaalt welke bekerweken gedeeld mogen worden; zonder plan
      // vallen we terug op alle geplande bekerweken zodat oudere flows blijven werken.
      const planSharedMondays = new Set(
        (config.sharedCupMondays ?? []).map((d) => toMondayIso(d)),
      );
      const shareableCupMondays =
        planSharedMondays.size > 0 ? planSharedMondays : plannedCupMondays;

      const softShare =
        config.shareCupWeeks !== false &&
        daySep.separated &&
        shareableCupMondays.size > 0;

      const exclusiveCupMondays = new Set(
        [...existingCupMondays, ...plannedCupMondays].filter(
          (monday) => !(softShare && shareableCupMondays.has(monday)),
        ),
      );
      const occupiedMondays = new Set(
        existingMatchesAll
          .filter((m: any) => m?.match_date)
          .map((m: any) => toMondayIso(String(m.match_date))),
      );

      const competitionPreferDay =
        config.competitionPreferredDayOfWeek ?? (daySep.separated ? daySep.late : null);
      const cupPreferDay =
        config.cupPreferredDayOfWeek ?? (daySep.separated ? daySep.early : null);

      const nominal = Math.max(1, seasonData.venue_timeslots?.length || 7);
      const effectiveSlots = resolveEffectiveSlotsPerWeek(grids, nominal) || nominal;
      const weeksNeeded = this.estimateCompetitionWeeksNeeded(config, effectiveSlots);

      const weekOk = (monday: string, gridMap: typeof grids) => {
        if (reservedPlayoffMondays.has(monday)) return false;
        if (exclusiveCupMondays.has(monday)) return false;
        if (occupiedMondays.has(monday) && !plannedCupMondays.has(monday)) return false;
        return capacityForWeek(gridMap, monday) > 0;
      };

      // Speelbare weken — geplande bekerweken soft meenemen (dagscheiding)
      let allWeeks = playable.filter((monday) => weekOk(monday, grids));

      // Chronologisch sorteren — nooit “eerst exclusief, dan beker” (dat plaatste
      // late speeldagen op vroege bekerweken in de kalender).
      allWeeks = [...allWeeks].sort((a, b) => a.localeCompare(b));

      // Uitbreiden voorbij end_date indien tekort (zelfde policy als voorheen)
      if (allWeeks.length < weeksNeeded) {
        const extended = listSeasonPlayableWeeks(
          config.start_date,
          (() => {
            const end = new Date(`${toMondayIso(config.end_date)}T12:00:00`);
            end.setDate(end.getDate() + (weeksNeeded - allWeeks.length) * 14);
            return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
          })(),
          vacations,
          playableVacationWeeks,
        );
        const extendedGrids = buildSeasonSlotGrids({
          weekMondays: extended,
          slotDetails,
          blocks: filterActiveSlotUnavailability(seasonData.slot_unavailability),
          vacations,
          playableVacationWeeks,
          matches: existingMatchesAll.map((m: Record<string, unknown>) => ({
            match_date: m.match_date as string | undefined,
            location: m.location as string | undefined,
            match_time: m.match_time as string | undefined,
            is_cup_match: Boolean(m.is_cup_match),
            is_playoff_match: Boolean(m.is_playoff_match),
          })),
        });
        allWeeks = extended.filter((monday) => {
          if (allWeeks.includes(monday)) return true;
          return weekOk(monday, extendedGrids);
        });
        allWeeks = [...allWeeks].sort((a, b) => a.localeCompare(b));
      }

      const sharedCount = allWeeks.filter((m) => shareableCupMondays.has(m)).length;
      const message =
        allWeeks.length >= weeksNeeded
          ? `${allWeeks.length} speelweken gevonden (${weeksNeeded} nodig, ~${effectiveSlots} slots/week)` +
            (softShare && sharedCount > 0
              ? `; ${sharedCount} bekerweek(en) met vrije momenten voor competitie (${daySep.lateLabel}, beker op ${daySep.earlyLabel})`
              : "") +
            ` tussen ${config.start_date} en ${config.end_date}`
          : `⚠️ Slechts ${allWeeks.length} speelweken gevonden (${weeksNeeded} nodig). Competitie kan niet worden gegenereerd.`;

      void competitionPreferDay;
      void cupPreferDay;

      return {
        weeks: allWeeks,
        message,
        softShare,
        cupPreferredDayOfWeek: cupPreferDay,
        competitionPreferredDayOfWeek: competitionPreferDay,
        sharedCupMondays: softShare ? [...shareableCupMondays] : [],
      };
    } catch (error) {
      console.error('Error generating playing weeks:', error);
      return { weeks: [], message: `Fout bij genereren speelweken: ${error instanceof Error ? error.message : 'Onbekende fout'}` };
    }
  },

  // Bereken aantal wedstrijden voor reguliere competitie
  calculateRegularMatches(teams: number[], rounds: number): number {
    const n = teams.length;
    return (n * (n - 1) / 2) * rounds;
  },

  /**
   * Minimale speelweken: reeksen lopen parallel → max speeldagen over pools,
   * opgehoogd als parallelle wedstrijden de weekcapaciteit overschrijden.
   */
  estimateCompetitionWeeksNeeded(config: CompetitionConfig, slotsPerWeek: number): number {
    const slots = Math.max(1, slotsPerWeek);
    const rounds = config.format.regular_rounds;
    const useDivisions =
      Boolean(config.format.has_divisions) &&
      (config.format.divisions?.length ?? 0) >= 2 &&
      config.teamDivisions != null &&
      Object.keys(config.teamDivisions).length > 0;

    if (!useDivisions) {
      const matchdays = matchdaysForTeamCount(config.teams.length, rounds);
      const matchesPerMd = Math.floor(config.teams.length / 2);
      return Math.max(matchdays, Math.ceil((matchdays * matchesPerMd) / slots));
    }

    const assignment = config.teamDivisions ?? {};
    let maxMatchdays = 0;
    let matchesPerParallelMd = 0;
    for (const division of config.format.divisions ?? []) {
      const n = config.teams.filter((id) => assignment[id] === division.id).length;
      if (n < 2) continue;
      maxMatchdays = Math.max(maxMatchdays, matchdaysForTeamCount(n, rounds));
      matchesPerParallelMd += Math.floor(n / 2);
    }
    if (maxMatchdays === 0) {
      const regularMatches = this.calculateRegularMatches(config.teams, rounds);
      return this.calculateWeeksNeeded(regularMatches, slots);
    }
    return Math.max(maxMatchdays, Math.ceil((maxMatchdays * matchesPerParallelMd) / slots));
  },

  // Bereken aantal playoff wedstrijden
  calculatePlayoffMatches(playoffTeams: number): number {
    // Top 8 speelt 2x tegen elkaar: 8 * 7 / 2 * 2 = 56 wedstrijden
    // Bottom 8 speelt 2x tegen elkaar: 8 * 7 / 2 * 2 = 56 wedstrijden
    // Totaal: 112 playoff wedstrijden
    return (playoffTeams * (playoffTeams - 1) / 2) * 2;
  },

  // Bereken aantal speelweken nodig
  calculateWeeksNeeded(totalMatches: number, matchesPerWeek: number): number {
    return Math.ceil(totalMatches / matchesPerWeek);
  },

  // Genereer alle wedstrijden voor reguliere competitie met round-robin algoritme
  generateRegularSeasonMatches(teams: number[], rounds: number): Array<{ home: number; away: number; round: number; matchday?: number }> {
    const matches: Array<{ home: number; away: number; round: number; matchday?: number }> = [];
    const n = teams.length;
    const matchdaysPerRound = (n % 2 === 0) ? (n - 1) : n; // bij oneven teams is er per ronde n speeldagen (1 bye)

    // Voor een correct round-robin schema met 16 teams = 15 speeldagen
    // Gebruik round-robin algoritme waarbij elke speeldag elk team exact 1x speelt
    for (let round = 1; round <= rounds; round++) {
      const roundMatches = this.generateRoundRobinMatches(teams);
      const base = (round - 1) * matchdaysPerRound;
      roundMatches.forEach(match => {
        matches.push({ ...match, round, matchday: base + match.matchday });
      });
    }
    
    return matches;
  },

  /**
   * Round-robin per reeks (of één pool zonder reeksen).
   * matchdayKey voorkomt dat speeldag 1 van reeks A en B worden samengevoegd.
   * @param opts.rng — shuffle teamvolgorde vóór circle-method → andere paren per speeldag
   */
  generateDivisionAwareRegularMatches(
    config: CompetitionConfig,
    opts?: { rng?: () => number },
  ): DivisionAwareMatch[] {
    const rounds = config.format.regular_rounds;
    const rng = opts?.rng;
    const useDivisions =
      Boolean(config.format.has_divisions) &&
      (config.format.divisions?.length ?? 0) >= 2 &&
      config.teamDivisions != null &&
      Object.keys(config.teamDivisions).length > 0;

    if (!useDivisions) {
      const teams = rng ? shuffleArray(config.teams, rng) : config.teams;
      return this.generateRegularSeasonMatches(teams, rounds).map((m) => ({
        home: m.home,
        away: m.away,
        round: m.round,
        matchday: m.matchday ?? 1,
        matchdayKey: `all-${m.matchday ?? 1}`,
        divisionId: null,
        divisionName: null,
      }));
    }

    const divisions = [...(config.format.divisions ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const assignment = config.teamDivisions ?? {};
    const result: DivisionAwareMatch[] = [];

    for (const division of divisions) {
      let teamsInDivision = config.teams.filter(
        (teamId) => assignment[teamId] === division.id,
      );
      if (teamsInDivision.length < 2) continue;
      if (rng) teamsInDivision = shuffleArray(teamsInDivision, rng);

      const matches = this.generateRegularSeasonMatches(teamsInDivision, rounds);
      for (const m of matches) {
        const matchday = m.matchday ?? 1;
        result.push({
          home: m.home,
          away: m.away,
          round: m.round,
          matchday,
          matchdayKey: `${division.id}-${matchday}`,
          divisionId: division.id,
          divisionName: division.name,
        });
      }
    }

    return result;
  },

  formatSpeeldagLabel(match: Pick<DivisionAwareMatch, "matchday" | "divisionName">): string {
    const base = `Speeldag ${match.matchday}`;
    return match.divisionName ? `${match.divisionName} – ${base}` : base;
  },

  // Round-robin algoritme: Circle Method (ondersteunt even en oneven aantal teams via BYE)
  generateRoundRobinMatches(teams: number[]): Array<{ home: number; away: number; matchday: number }> {
    const matches: Array<{ home: number; away: number; matchday: number }> = [];
    const originalTeams = [...teams];
    const originalCount = originalTeams.length;
    const isOdd = originalCount % 2 !== 0;
    const BYE_TEAM_ID = -1;

    // Werkset voor algoritme (voeg BYE toe bij oneven aantal)
    const arr = isOdd ? [...originalTeams, BYE_TEAM_ID] : [...originalTeams];
    const n = arr.length; // even

    console.debug(
      `🏆 Genereer round-robin voor ${originalCount} teams${isOdd ? " (met BYE)" : ""}`,
    );

    const numMatchdays = n - 1;
    for (let matchday = 1; matchday <= numMatchdays; matchday++) {
      const matchdayMatches: Array<{ home: number; away: number; matchday: number }> = [];

      for (let i = 0; i < n / 2; i++) {
        const home = arr[i];
        const away = arr[n - 1 - i];
        if (home === BYE_TEAM_ID || away === BYE_TEAM_ID) continue;
        matchdayMatches.push({ home, away, matchday });
      }

      // Validatie: bij even aantal teams spelen alle teams; bij oneven 1 bye
      const teamsInMatchday = new Set<number>();
      matchdayMatches.forEach(m => { teamsInMatchday.add(m.home); teamsInMatchday.add(m.away); });
      const expectedTeams = isOdd ? originalCount - 1 : originalCount;
      if (teamsInMatchday.size !== expectedTeams) {
        const missing = originalTeams.filter(t => !teamsInMatchday.has(t));
        if (!isOdd) {
          throw new Error(`Speeldag ${matchday} validatie gefaald: ${teamsInMatchday.size}/${expectedTeams}. Ontbrekend: ${missing.join(', ')}`);
        } else {
          console.warn(`⚠️ Speeldag ${matchday}: ${teamsInMatchday.size}/${expectedTeams} (bye aanwezig). Ontbrekend: ${missing.join(', ')}`);
        }
      }

      matches.push(...matchdayMatches);

      // Rotate (houd index 0 vast)
      const last = arr.pop() as number;
      arr.splice(1, 0, last);
    }

    return matches;
  },

  // Verbeterde distributie met seasonal fairness tracking
  async distributeMatchesOverWeeks(
    matches: Array<{
      home: number;
      away: number;
      round: number;
      matchday?: number;
      matchdayKey?: string;
      divisionId?: number | null;
    }>,
    playingWeeks: string[],
    options?: {
      teamPreferences?: Map<number, TeamPreferencesNormalized>;
      venues?: any[];
      dayNames?: string[];
      seasonalFairness?: TeamSeasonalFairness[]; // New: seasonal fairness data
      organizationId?: number;
    }
  ): Promise<Array<{ match: { home: number; away: number; round: number; matchday?: number; matchdayKey?: string; divisionId?: number | null; divisionName?: string | null }; week: number; slot: number }>> {
    const distributedMatches: Array<{ match: typeof matches[number]; week: number; slot: number }> = [];
    const matchesPerWeek = 7; // 7 speelmomenten per week
    const slotCtx = await loadSlotPlanningContext(options?.organizationId);
    const totalMatches = matches.length;
    
    console.log(`📊 Distributie info: ${totalMatches} wedstrijden, ${playingWeeks.length} weken beschikbaar`);
    
    // Bepaal totaal aantal unieke teams en afgeleide wedstrijden per speeldag (helft van teams, afgerond naar beneden)
    const allTeamsSet = new Set<number>();
    matches.forEach((m) => { allTeamsSet.add(m.home); allTeamsSet.add(m.away); });
    const totalTeamsCount = allTeamsSet.size;
    const matchesPerMatchday = Math.max(1, Math.floor(totalTeamsCount / 2));

    // Teams per reeks (of één pool) — validatie mag niet alle reeksen mengen
    const poolTeamsByKey = new Map<string, Set<number>>();
    matches.forEach((m) => {
      const key = m.matchdayKey ?? `all-${m.matchday ?? 1}`;
      const { poolKey } = parseMatchdayKey(key);
      const set = poolTeamsByKey.get(poolKey) ?? new Set<number>();
      set.add(m.home);
      set.add(m.away);
      poolTeamsByKey.set(poolKey, set);
    });
    
    // Track teams per week om conflicten te voorkomen
    const teamsPerWeek: Map<number, Set<number>> = new Map();
    const slotsPerWeek: Map<number, number> = new Map();
    
    // Initialiseer tracking
    for (let week = 0; week < playingWeeks.length; week++) {
      teamsPerWeek.set(week, new Set());
      slotsPerWeek.set(week, 0);
    }
    
    // Groepeer wedstrijden per speeldag-sleutel (reeks + speeldag) zodat reeksen niet mengen
    const matchesByMatchday = new Map<string, Array<typeof matches[number]>>();
    
    matches.forEach((match, index) => {
      const matchday = match.matchday || Math.floor(index / matchesPerMatchday) + 1;
      const key = match.matchdayKey ?? `all-${matchday}`;
      if (!matchesByMatchday.has(key)) {
        matchesByMatchday.set(key, []);
      }
      matchesByMatchday.get(key)!.push(match);
    });
    
    console.log(`🏆 Competitie structuur: ${matchesByMatchday.size} speeldagen (incl. reeksen)`);
    
    // Helper: score volgens opgegeven regels per team
    const scoreTeamForSlot = async (
      teamId: number,
      slotIndex: number
    ): Promise<{ score: number; matched: number; provided: number }> => {
      const prefs = options?.teamPreferences?.get(teamId);
      const { venue, timeslot } = await priorityOrderService.getMatchDetails(slotIndex, 7);
      return scoreTeamForDetails(prefs, timeslot, venue, options?.venues || []);
    };

    // Verdeel elke speeldag over beschikbare weken, respecting team conflicts.
    // Per-pool weekcursor: reeksen delen dezelfde kalenderweken i.p.v. sequentieel.
    const currentWeekByPool = new Map<string, number>();

    const sortedMatchdays = Array.from(matchesByMatchday.keys()).sort(compareMatchdayKeys);

    for (const matchdayKey of sortedMatchdays) {
      const matchdayMatches = matchesByMatchday.get(matchdayKey)!;
      console.log(`📅 Speeldag ${matchdayKey}: ${matchdayMatches.length} wedstrijden`);

      // Valideer dat elk team in deze pool exact 1x voorkomt op deze speeldag
      const teamsInMatchday = new Set<number>();
      matchdayMatches.forEach(match => {
        teamsInMatchday.add(match.home);
        teamsInMatchday.add(match.away);
      });

      const { poolKey } = parseMatchdayKey(matchdayKey);
      const poolTeams = poolTeamsByKey.get(poolKey) ?? allTeamsSet;
      const poolSize = poolTeams.size;
      let poolWeek = currentWeekByPool.get(poolKey) ?? 0;
      
      // Verwacht: bij even aantal teams spelen alle teams; bij oneven aantal teams is er 1 bye (dus -1)
      const expectedTeamsThisMatchday = poolSize % 2 === 0 ? poolSize : poolSize - 1;
      if (teamsInMatchday.size !== expectedTeamsThisMatchday) {
        const teamsList = Array.from(teamsInMatchday).sort((a, b) => a - b);
        const missingTeams = Array.from(poolTeams).filter(t => !teamsInMatchday.has(t)).sort((a, b) => a - b);
        if (poolSize % 2 === 1) {
          // Oneven: 1 bye toegestaan → enkel waarschuwing
          console.warn(`⚠️ VALIDATIE WAARSCHUWING - Speeldag ${matchdayKey}: ${teamsInMatchday.size}/${expectedTeamsThisMatchday} teams (bye toegestaan).`);
          console.warn(`Teams in speeldag:`, teamsList);
          if (missingTeams.length > 0) console.warn(`Ontbrekende teams (bye):`, missingTeams);
        } else {
          // Even: dit hoort exact te kloppen → error
          console.error(`❌ VALIDATIE FOUT - Speeldag ${matchdayKey}: ${teamsInMatchday.size}/${expectedTeamsThisMatchday} teams.`);
          console.error(`Teams in speeldag:`, teamsList);
          console.error(`Ontbrekende teams:`, missingTeams);
          throw new Error(`Speeldag ${matchdayKey} validatie gefaald: ${teamsInMatchday.size}/${expectedTeamsThisMatchday} teams. Ontbrekende teams: ${missingTeams.join(', ')}`);
        }
      }
      
      // Probeer alle wedstrijden van deze speeldag te plaatsen
      const placedMatches: Array<{ match: any; week: number; slot: number }> = [];
      
      for (const match of matchdayMatches) {
        let placed = false;
        
        // Kies de beste week op basis van voorkeur-score voor het eerstvolgende slot in die week
        let bestWeek: number | null = null;
        let bestSlotForWeek: number = 0;
        let bestScore = -1;

        for (let weekIndex = poolWeek; weekIndex < playingWeeks.length; weekIndex++) {
          const weekTeams = teamsPerWeek.get(weekIndex)!;
          const slotsUsed = slotsPerWeek.get(weekIndex)!;
          const weekMonday = playingWeeks[weekIndex];
          const weekCap = slotCtx.getWeekCapacity(weekMonday);
          if (slotsUsed >= weekCap) continue;
          if (weekTeams.has(match.home) || weekTeams.has(match.away)) continue;

          const slotIndex = slotCtx.getSlotIndexForUsage(weekMonday, slotsUsed);
          if (slotIndex === null) continue;
          // Bereken combined score voor deze week/slot
          let combined = 0;
          if (options?.teamPreferences) {
            const homeRes = await scoreTeamForSlot(match.home, slotIndex);
            const awayRes = await scoreTeamForSlot(match.away, slotIndex);
            combined = homeRes.score + awayRes.score;
          }

          if (combined > bestScore) {
            bestScore = combined;
            bestWeek = weekIndex;
            bestSlotForWeek = slotIndex;
          }
          // Bij gelijke score houden we de eerste (vroegste) week aan -> geen extra code nodig
        }

        if (bestWeek !== null) {
          const weekTeams = teamsPerWeek.get(bestWeek)!;
          weekTeams.add(match.home);
          weekTeams.add(match.away);
          teamsPerWeek.set(bestWeek, weekTeams);
          slotsPerWeek.set(bestWeek, bestSlotForWeek + 1);
          placedMatches.push({ match, week: bestWeek, slot: bestSlotForWeek });
          placed = true;
          console.log(`  ✅ Geplaatst: Week ${bestWeek + 1}, Slot ${bestSlotForWeek + 1}: Team ${match.home} vs Team ${match.away} (score ${bestScore})`);
        }
        
        if (!placed) {
          const weekUsage = Array.from(slotsPerWeek.entries()).map(([week, slots]) => 
            `Week ${week + 1}: ${slots}/7 slots`
          ).join(', ');
          
          throw new Error(
            `Kan wedstrijd van speeldag ${matchdayKey} (Team ${match.home} vs Team ${match.away}) niet plaatsen. ` +
            `Alle weken zijn bezet of hebben team conflicten. ` +
            `Week gebruik: ${weekUsage}`
          );
        }
      }
      
      // Voeg alle geplaatste wedstrijden toe
      distributedMatches.push(...placedMatches);

      // Pool-cursor: start volgende speeldag van deze reeks vanaf de laatst gebruikte week
      // (zelfde week mag als er nog slots zijn; teamconflicten dwingen sowieso verder).
      if (placedMatches.length > 0) {
        poolWeek = Math.max(...placedMatches.map((p) => p.week));
      }
      while (
        poolWeek < playingWeeks.length &&
        (slotsPerWeek.get(poolWeek) || 0) >=
          slotCtx.getWeekCapacity(playingWeeks[poolWeek])
      ) {
        poolWeek++;
      }
      currentWeekByPool.set(poolKey, poolWeek);
    }
    
    console.log(`✅ Alle ${distributedMatches.length} wedstrijden succesvol verdeeld over weken`);
    
    // Sorteer wedstrijden chronologisch
    const sortedMatches = [...distributedMatches].sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      return a.slot - b.slot;
    });
    
    // Log verdeling
    console.log('📅 Chronologische verdeling:');
    sortedMatches.forEach(({ match, week, slot }, idx) => {
      const weekDate = playingWeeks[week];
      const inferredMatchday = Math.floor(idx / matchesPerMatchday) + 1;
      console.log(`  Week ${week + 1} (${weekDate}): Slot ${slot + 1} - Speeldag ${inferredMatchday} - Team ${match.home} vs Team ${match.away}`);
    });
    
    return sortedMatches;
  },

  // Genereer playoff wedstrijden (2x tegen elkaar voor top 8 en bottom 8)
  async generatePlayoffMatches(
    teams: number[],
    playoffTeams: number,
    playingWeeks: string[],
    startWeekIndex: number
  ): Promise<Array<{ match: { home: number; away: number; round: string }; week: number; slot: number }>> {
    const playoffMatches: Array<{ match: { home: number; away: number; round: string }; week: number; slot: number }> = [];
    
    // Top teams (1-8) en bottom teams (9-16)
    const topTeams = teams.slice(0, playoffTeams);
    const bottomTeams = teams.slice(-playoffTeams);
    
    // Top 8 playoff wedstrijden (2x tegen elkaar)
    const top8Matches = this.generatePlayoffRoundMatches(topTeams, 'top_playoff');
    
    // Bottom 8 playoff wedstrijden (2x tegen elkaar)
    const bottom8Matches = this.generatePlayoffRoundMatches(bottomTeams, 'bottom_playoff');
    
    // Verdeel over weken
    let currentWeek = startWeekIndex;
    let currentSlot = 0;
    
    // Top 8 wedstrijden
    for (const match of top8Matches) {
      if (currentSlot >= 7) {
        currentWeek++;
        currentSlot = 0;
      }
      
      playoffMatches.push({
        match,
        week: currentWeek,
        slot: currentSlot
      });
      currentSlot++;
    }
    
    // Bottom 8 wedstrijden
    for (const match of bottom8Matches) {
      if (currentSlot >= 7) {
        currentWeek++;
        currentSlot = 0;
      }
      
      playoffMatches.push({
        match,
        week: currentWeek,
        slot: currentSlot
      });
      currentSlot++;
    }
    
    return playoffMatches;
  },

  // Genereer playoff wedstrijden voor een groep teams (2x tegen elkaar)
  generatePlayoffRoundMatches(teams: number[], roundType: string): Array<{ home: number; away: number; round: string }> {
    const matches: Array<{ home: number; away: number; round: string }> = [];
    
    // Genereer 2 rondes: elke ploeg speelt 2x tegen elke andere ploeg
    for (let round = 1; round <= 2; round++) {
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          // Wissel thuis/uit voor tweede ronde
          if (round === 1) {
            matches.push({
              home: teams[i],
              away: teams[j],
              round: `${roundType}_r${round}`
            });
          } else {
            matches.push({
              home: teams[j],
              away: teams[i],
              round: `${roundType}_r${round}`
            });
          }
        }
      }
    }
    
    return matches;
  },

  // Helper: splits teams in bovenste en onderste helft (bij oneven: onderste helft is oneven)
  splitTopBottomByRanking(teamsInRankingOrder: number[]): { top: number[]; bottom: number[] } {
    return playoffService.splitTopBottomByRanking(teamsInRankingOrder);
  },

  // Helper: genereer playoff wedstrijden op basis van ranking (top/bottom aparte dubbele round-robin)
  generatePlayoffsFromRanking(teamsInRankingOrder: number[], roundsPerGroup: number): Array<{ home: number; away: number; round: string }> {
    const { top, bottom } = playoffService.splitTopBottomByRanking(teamsInRankingOrder);
    const topMatches = playoffService.generatePlayoffRoundMatchesCustom(top, 'top_playoff', roundsPerGroup);
    const bottomMatches = playoffService.generatePlayoffRoundMatchesCustom(bottom, 'bottom_playoff', roundsPerGroup);
    const interleaved: Array<{ home: number; away: number; round: string }> = [];
    const maxLen = Math.max(topMatches.length, bottomMatches.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < topMatches.length) interleaved.push(topMatches[i]);
      if (i < bottomMatches.length) interleaved.push(bottomMatches[i]);
    }
    return interleaved;
  },

  // Maak wedstrijd object voor database
  createMatchObject(
    uniqueNumber: string,
    speeldag: string,
    homeTeamId: number | null,
    awayTeamId: number | null,
    matchDateTime: string,
    venue: string,
    isPlayoff: boolean = false,
    playoffRound?: string,
    playoffPosition?: string
  ) {
    const baseObject = {
      unique_number: uniqueNumber,
      speeldag,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDateTime,
      location: normalizeVenueName(venue),
      is_cup_match: false,
      is_submitted: false,
      is_locked: false
    };

    // Voor nu, sla playoff informatie op in speeldag veld om database compatibiliteit te behouden
    if (isPlayoff) {
      return {
        ...baseObject,
        speeldag: `${speeldag} [PLAYOFF: ${playoffRound}]`
      };
    }

    return baseObject;
  },

  async previewCompetition(config: CompetitionConfig): Promise<{
    success: boolean;
    message: string;
    plan: Array<{
      unique_number: string;
      speeldag: string;
      home_team_id: number;
      away_team_id: number | null;
      match_date: string;
      match_time: string;
      venue: string;
      details: {
        homeScore: number;
        awayScore: number;
        combined: number;
        maxCombined: number;
      };
    }>;
    totalCombined?: number;
    teamTotals?: Record<number, number>;
    suggestions?: PackFailureSuggestion[];
  }> {
    try {
      // Validate basic input
      const inputValidation = this.validateCompetitionInput(config);
      if (!inputValidation.isValid) {
        return { success: false, message: inputValidation.message!, plan: [] };
      }

      // Generate weeks (incl. soft-share: vrije momenten op bekerweken)
      const weeksResult = await this.generatePlayingWeeks(config);
      const playingWeeks = weeksResult.weeks;
      if (playingWeeks.length === 0) {
        return { success: false, message: 'Geen beschikbare speelweken', plan: [] };
      }

      const { toMondayIso } = await import("@/lib/competitionPlanningEstimate");
      const softShare = Boolean(weeksResult.softShare);
      const cupDay = weeksResult.cupPreferredDayOfWeek ?? config.cupPreferredDayOfWeek ?? null;
      const compDay =
        weeksResult.competitionPreferredDayOfWeek ??
        config.competitionPreferredDayOfWeek ??
        null;
      const sharedCupMondaySet = new Set(
        (weeksResult.sharedCupMondays?.length
          ? weeksResult.sharedCupMondays
          : softShare
            ? (config.reservedCupMondays ?? [])
            : []
        ).map((d) => toMondayIso(d)),
      );

      // Load preferences and venues
      const seasonData = await seasonService.getSeasonData(config.organizationId);
      const allTeamsData = await teamService.getAllTeams();
      const selectedTeamsSet = new Set(config.teams);
      const teamPreferences = normalizeTeamsPreferences(
        allTeamsData.filter((t) => selectedTeamsSet.has(t.team_id)),
      );
      const venues = seasonData.venues || [];

      const { getSeasonalFairness, calculateFairnessBoost } = await import(
        "@/services/core/teamPreferencesService"
      );
      const { fairnessMetrics, teamFairness } = await getSeasonalFairness(
        allTeamsData.filter((t) => selectedTeamsSet.has(t.team_id)),
      );

      console.log("🎯 Seasonal fairness loaded:", {
        overallAverage: fairnessMetrics.overallAverage.toFixed(2),
        teamsNeedingBoost: fairnessMetrics.teamsNeedingBoost.length,
        fairnessScore: fairnessMetrics.fairnessScore.toFixed(1),
      });

      const slotCtx = await loadSlotPlanningContext(config.organizationId);

      /**
       * Capaciteit voor competitie: alleen de speelmomenten die de beker écht claimt
       * vallen weg. Ongebruikte momenten op de bekerdag blijven bruikbaar voor ploegen
       * die die week geen beker spelen — de ≥3-dagen-regel wordt per wedstrijd getoetst.
       */
      const competitionWeekCapacity = (weekMonday: string): number => {
        const monday = toMondayIso(weekMonday);
        const cupTaken = new Set(config.cupOccupiedSlotsByMonday?.[monday] ?? []);
        const base = slotCtx.getWeekCapacity(weekMonday);
        return Math.max(0, base - cupTaken.size);
      };

      /** Bekerdatums van deze ploegen in die week (leeg = geen beker die week). */
      const cupDatesForTeams = (mondayIso: string, teamIds: number[]): string[] => {
        const byTeam = config.cupTeamDatesByMonday?.[mondayIso];
        if (!byTeam) return [];
        const dates = new Set<string>();
        for (const id of teamIds) {
          for (const date of byTeam[id] ?? []) dates.add(date);
        }
        return [...dates];
      };

      const dualWeek = Boolean(config.allowDualMatchWeek);

      /** Slot respecteert bestaande datums van de ploeg (beker / andere wedstrijd). */
      const slotRespectsExistingDates = (
        mondayIso: string,
        slotIndex: number,
        existingDates: string[],
        mode: "gap3" | "gap2" | "differentDay",
      ): boolean => {
        if (existingDates.length === 0) return true;
        const dow = slotCtx.slotDetails[slotIndex]?.timeslot?.day_of_week;
        if (typeof dow !== "number") return false;
        const slotDate = matchDateFromWeekMonday(mondayIso, dow);
        if (mode === "differentDay") {
          return existingDates.every((date) => date.slice(0, 10) !== slotDate);
        }
        if (mode === "gap2") {
          // Dual/force: min. 2 dagen scheiding (ook t.o.v. beker / doorstroming)
          return existingDates.every((date) =>
            hasMinimumDaySeparation(date, slotDate, MIN_DUAL_WEEK_DAY_GAP),
          );
        }
        return existingDates.every((date) =>
          hasSufficientDayGapBetweenDates(date, slotDate),
        );
      };

      /** Slot respecteert gap t.o.v. beker (standaard ≥3d; dual ≥2d). */
      const slotRespectsCupGap = (
        mondayIso: string,
        slotIndex: number,
        cupDates: string[],
      ): boolean =>
        slotRespectsExistingDates(
          mondayIso,
          slotIndex,
          cupDates,
          dualWeek ? "gap2" : "gap3",
        );

      /** Vrije slots die de beker die week niet al claimt. */
      const freeCompetitionSlots = (weekMonday: string): number[] => {
        const monday = toMondayIso(weekMonday);
        const cupTaken = new Set(config.cupOccupiedSlotsByMonday?.[monday] ?? []);
        return slotCtx
          .getAvailableSlotIndices(weekMonday)
          .filter((idx) => !cupTaken.has(idx));
      };

      // Meerdere starts: eerst lichte packing (snel), daarna zware repair.
      // Yield naar UI tussen pogingen zodat de pagina responsive blijft.
      const PACK_LIGHT = dualWeek ? 16 : 12;
      const PACK_HEAVY = dualWeek ? 20 : 16;
      const PACK_ATTEMPTS = PACK_LIGHT + PACK_HEAVY;
      const yieldToUi = () =>
        new Promise<void>((resolve) => {
          if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
            window.requestAnimationFrame(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
      const reportPackProgress = (attempt: number, phase: string) => {
        const pct = Math.min(
          92,
          Math.round(18 + (attempt / Math.max(PACK_ATTEMPTS, 1)) * 70),
        );
        config.onProgress?.({
          percent: pct,
          label: `${phase} (poging ${attempt + 1}/${PACK_ATTEMPTS})`,
        });
      };
      type PackOk = Extract<ReturnType<typeof packCompetitionMatchdays>, { ok: true }>;
      type PackFail = Extract<ReturnType<typeof packCompetitionMatchdays>, { ok: false }>;
      let packResult: PackOk | PackFail | null = null;
      let regularMatches: DivisionAwareMatch[] = [];
      let maxMatchdayNumber = 0;

      /** Laten de geconfigureerde speeldagen de beker+competitie-uitzondering toe? */
      const cupOverlapExceptionPossible = Boolean(
        softShare &&
          cupDay != null &&
          compDay != null &&
          (dualWeek || hasSufficientSameWeekDayGap(cupDay, compDay)),
      );

      const packOptsBase = {
        maxTeamAppearancesPerWeek: (dualWeek ? 2 : 1) as 1 | 2,
        preferFreshWeeks: dualWeek,
        externalBusyTeamsByWeek: (w: number) => {
          const monday = toMondayIso(playingWeeks[w]);
          const ids = config.cupBusyTeamsByMonday?.[monday];
          if (!ids?.length) return undefined;
          return new Set(ids);
        },
        orderByDifficulty: true as const,
        enableRepair: true as const,
        /**
         * Preferred = speelmomenten op/na de competitievoorkeursdag (≥3 dagen na
         * de geconfigureerde bekerdag). Gebaseerd op config-dagen, niet op de
         * vroegste echte bekerdatum: als één bekerwedstrijd naar donderdag
         * uitwijkt, mag dat niet de hele vrijdag-capaciteit voor iedereen
         * blokkeren. Per-ploeg datumtoets gebeurt bij slot-assign.
         */
        preferredWeekCapacity: softShare
          ? (w: number) => {
              const weekMonday = playingWeeks[w];
              const monday = toMondayIso(weekMonday);
              if (!sharedCupMondaySet.has(monday)) {
                return competitionWeekCapacity(weekMonday);
              }
              const free = freeCompetitionSlots(weekMonday);
              if (cupDay == null) return free.length;
              return free.filter((idx) => {
                const dow = slotCtx.slotDetails[idx]?.timeslot?.day_of_week;
                if (typeof dow !== "number") return false;
                if (dualWeek) {
                  return hasSufficientSameWeekDayGap(
                    cupDay,
                    dow,
                    MIN_DUAL_WEEK_DAY_GAP,
                  );
                }
                return hasSufficientSameWeekDayGap(cupDay, dow);
              }).length;
            }
          : undefined,
        /**
         * Uitzonderlijk: beker + competitie dezelfde week.
         * Normaal: ≥3 dagen na beker. Dual-mode: andere speeldag volstaat.
         */
        allowCupOverlapForWeek: (w: number) => {
          if (!softShare && !dualWeek) return false;
          const weekMonday = playingWeeks[w];
          const monday = toMondayIso(weekMonday);
          const cupBusy = config.cupBusyTeamsByMonday?.[monday];
          if (!cupBusy?.length) return false;
          const free = freeCompetitionSlots(weekMonday);
          if (free.length === 0) return false;
          if (dualWeek) {
            if (cupDay == null) return true;
            return free.some((idx) => {
              const dow = slotCtx.slotDetails[idx]?.timeslot?.day_of_week;
              return (
                typeof dow === "number" &&
                hasSufficientSameWeekDayGap(cupDay, dow, MIN_DUAL_WEEK_DAY_GAP)
              );
            });
          }
          if (!sharedCupMondaySet.has(monday)) return false;
          const byTeam = config.cupTeamDatesByMonday?.[monday];
          if (!byTeam) return false;
          const perTeamLatest = Object.values(byTeam)
            .filter((dates) => dates.length > 0)
            .map((dates) => dates.reduce((a, b) => (a > b ? a : b)));
          if (perTeamLatest.length === 0) return false;
          const easiest = perTeamLatest.reduce((a, b) => (a < b ? a : b));
          return free.some((idx) => slotRespectsCupGap(monday, idx, [easiest]));
        },
      };

      // Eerst: rotaties 0..min(n-1,11) op vaste loting; daarna random lotingen.
      const probeMatchdays = this.generateDivisionAwareRegularMatches(config);
      const matchdayCount = probeMatchdays.reduce(
        (max, m) => Math.max(max, m.matchday ?? 0),
        0,
      );
      const systematicRotations = Math.min(
        Math.max(matchdayCount, 1),
        12,
      );

      config.onProgress?.({
        percent: 18,
        label: "Competitie-schema inpakken…",
      });

      for (let attempt = 0; attempt < PACK_ATTEMPTS; attempt++) {
        const heavy = attempt >= PACK_LIGHT;
        reportPackProgress(
          attempt,
          heavy ? "Diepe herschikking" : "Snelle packing",
        );
        if (attempt > 0) await yieldToUi();

        const rng = () => Math.random();
        let candidate: DivisionAwareMatch[];
        if (dualWeek) {
          // Meer starts met speeldag 1: eerst zonder rotatie (loting/variatie),
          // pas daarna speeldagrotatie als het nog niet lukt.
          const freshStarts = Math.min(20, Math.max(8, systematicRotations));
          if (attempt < freshStarts) {
            candidate =
              attempt === 0
                ? probeMatchdays
                : this.generateDivisionAwareRegularMatches(config, { rng });
          } else {
            const rotAttempt = attempt - freshStarts;
            candidate =
              rotAttempt < systematicRotations
                ? rotateMatchdaysByPool(probeMatchdays, rotAttempt + 1)
                : rotateMatchdaysByPool(
                    this.generateDivisionAwareRegularMatches(config, { rng }),
                    (rotAttempt % Math.max(matchdayCount, 1)) + 1,
                  );
          }
        } else {
          const useSystematic = attempt < systematicRotations;
          candidate = useSystematic
            ? probeMatchdays
            : this.generateDivisionAwareRegularMatches(config, { rng });
          const rotationOffset = useSystematic
            ? attempt
            : attempt - systematicRotations + 1;
          if (rotationOffset > 0) {
            candidate = rotateMatchdaysByPool(candidate, rotationOffset);
          }
        }

        const bestPlaced =
          packResult && !packResult.ok ? packResult.placedCount : 0;
        const nearMissBest =
          bestPlaced > 0 &&
          (bestPlaced / Math.max(candidate.length, 1) >= 0.9 ||
            candidate.length - bestPlaced <= 20);
        // Zware evacuate/backtrack alleen in heavy-fase of bij near-miss,
        // zodat vroege mislukte pogingen snel blijven.
        const useHeavyRepair = heavy || (nearMissBest && attempt >= 3);

        const packed = packCompetitionMatchdays(
          candidate.map((m) => ({
            home: m.home,
            away: m.away,
            matchday: m.matchday,
            matchdayKey: m.matchdayKey,
          })),
          playingWeeks.length,
          (w) => competitionWeekCapacity(playingWeeks[w]),
          {
            ...packOptsBase,
            rng,
            enableEvacuateRepair: useHeavyRepair,
            enableBacktrackRepair: useHeavyRepair,
            evacuateMaxScopes: useHeavyRepair ? (heavy ? 7 : 3) : 1,
            maxRepairAttempts: useHeavyRepair
              ? dualWeek
                ? 200
                : 160
              : dualWeek
                ? 60
                : 40,
            maxRepairDepth: useHeavyRepair ? 4 : 2,
            // Dual/force: speeldag 1 eerst (geen reverse). Normaal: soms late-eerst.
            reverseMatchdays: dualWeek ? false : attempt % 3 === 2,
            shuffleWithinMatchday: dualWeek && attempt > 0,
          },
        );
        if (packed.ok) {
          packResult = packed;
          regularMatches = candidate;
          maxMatchdayNumber = candidate.reduce(
            (max, m) => Math.max(max, m.matchday ?? 0),
            0,
          );
          if (attempt > 0) {
            console.log(
              `✅ Competitie packing geslaagd na start #${attempt + 1} (rotatie/loting + repair)`,
            );
          }
          break;
        }
        if (
          !packResult ||
          (!packResult.ok && packed.placedCount > packResult.placedCount)
        ) {
          packResult = packed;
          regularMatches = candidate;
          maxMatchdayNumber = candidate.reduce(
            (max, m) => Math.max(max, m.matchday ?? 0),
            0,
          );
        }
      }

      config.onProgress?.({
        percent: 93,
        label: packResult?.ok
          ? "Competitie-schema gevonden — slots toewijzen…"
          : "Competitie-packing afronden…",
      });

      if (!packResult) {
        return { success: false, message: "Geen competitieplan gegenereerd", plan: [] };
      }

      if (!packResult.ok) {
        const m = packResult.failedMatch;
        const sample = regularMatches.find(
          (x) =>
            x.home === m.home &&
            x.away === m.away &&
            x.matchdayKey === m.matchdayKey,
        );
        const totalCap = sumWeekCapacities(
          playingWeeks.length,
          (w) => competitionWeekCapacity(playingWeeks[w]),
        );
        const speeldagNr = m.matchday ?? 0;
        const matchLabel = sample
          ? `${this.formatSpeeldagLabel(sample)}${
              maxMatchdayNumber > 0 ? ` (${speeldagNr}/${maxMatchdayNumber})` : ""
            }`
          : `speeldag ${speeldagNr}`;
        const teamNameById = (id: number) =>
          allTeamsData.find((t) => t.team_id === id)?.team_name;
        const homeName = teamNameById(m.home);
        const awayName = teamNameById(m.away);
        return {
          success: false,
          message: formatPackFailureMessage({
            matchLabel,
            homeId: m.home,
            awayId: m.away,
            placedCount: packResult.placedCount,
            totalMatches: regularMatches.length,
            totalCap,
            weekCount: playingWeeks.length,
            diagnosis: packResult.diagnosis,
            softShare,
            allowSameWeekCupOverlap: cupOverlapExceptionPossible,
            homeName,
            awayName,
            teamNameById,
          }),
          suggestions: buildPackFailureSuggestions({
            diagnosis: packResult.diagnosis,
            placedCount: packResult.placedCount,
            totalMatches: regularMatches.length,
            totalCap,
            weekCount: playingWeeks.length,
            softShare,
            allowSameWeekCupOverlap: cupOverlapExceptionPossible,
            homeName,
            awayName,
            homeId: m.home,
            awayId: m.away,
          }),
          plan: [],
        };
      }

      const weekToMatches: Map<number, DivisionAwareMatch[]> = new Map();
      const matchdayToWeek: Map<string, number> = new Map();
      for (let w = 0; w < playingWeeks.length; w++) {
        weekToMatches.set(w, []);
      }
      const unused = new Map<string, DivisionAwareMatch[]>();
      for (const m of regularMatches) {
        const arr = unused.get(m.matchdayKey) ?? [];
        arr.push(m);
        unused.set(m.matchdayKey, arr);
      }
      for (const [w, packed] of packResult.weekToMatches) {
        const list = weekToMatches.get(w)!;
        for (const pm of packed) {
          const bucket = unused.get(pm.matchdayKey) ?? [];
          const idx = bucket.findIndex((x) => x.home === pm.home && x.away === pm.away);
          if (idx >= 0) {
            list.push(bucket.splice(idx, 1)[0]);
            if (!matchdayToWeek.has(pm.matchdayKey)) {
              matchdayToWeek.set(pm.matchdayKey, w);
            }
          }
        }
      }

      const matchesByMatchday = new Map<string, DivisionAwareMatch[]>();
      for (const m of regularMatches) {
        const arr = matchesByMatchday.get(m.matchdayKey) ?? [];
        arr.push(m);
        matchesByMatchday.set(m.matchdayKey, arr);
      }

      // Optimize slot assignment per week (maximize combined)
      const plan: Array<{ unique_number: string; speeldag: string; home_team_id: number; away_team_id: number | null; match_date: string; match_time: string; venue: string; details: { homeScore: number; awayScore: number; combined: number; maxCombined: number } } > = [];
      let totalCombined = 0;
      const totalAvailableSlots = slotCtx.totalSlots;
      const slotDetails = slotCtx.slotDetails;

      const combinations = (arr: number[], k: number): number[][] => {
        const res: number[][] = []; const back = (start: number, path: number[]) => {
          if (path.length === k) { res.push([...path]); return; }
          for (let i = start; i < arr.length; i++) { path.push(arr[i]); back(i + 1, path); path.pop(); }
        }; back(0, []); return res;
      };
      const permutations = (arr: number[]): number[][] => {
        const res: number[][] = []; const used = new Array(arr.length).fill(false); const path: number[] = [];
        const back = () => { if (path.length === arr.length) { res.push([...path]); return; } for (let i = 0; i < arr.length; i++) { if (used[i]) continue; used[i] = true; path.push(arr[i]); back(); path.pop(); used[i] = false; } };
        back(); return res;
      };

      let counter = 1;
      // Fairness: track totals and variance to avoid extreme imbalance
      const fairnessWeight = 0.5; // variance weight
      const spreadWeight = 1.0;   // max-min spread weight
      const minRaiseWeight = 0.5; // reward raising the minimum team total
      const lowerBound = 10;      // soft lower bound target per team
      const lowerBoundWeight = 0.5;
      const allTeamsSet = new Set<number>(config.teams);
      const teamTotals = new Map<number, number>();
      Array.from(allTeamsSet).forEach(t => teamTotals.set(t, 0));
      const computeVariance = (totals: Map<number, number>) => {
        const values = Array.from(totals.values());
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
        return variance;
      };
      const computeMinMax = (totals: Map<number, number>) => {
        const values = Array.from(totals.values());
        if (values.length === 0) return { min: 0, max: 0 };
        let min = values[0], max = values[0];
        for (let i = 1; i < values.length; i++) {
          const v = values[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        return { min, max };
      };
      const computeDeficit = (totals: Map<number, number>, bound: number) => {
        let deficit = 0;
        for (const val of totals.values()) {
          if (val < bound) deficit += (bound - val);
        }
        return deficit;
      };
      // Helpers for stochastic search (to avoid identical previews while aiming for high scores)
      const shuffle = (arr: number[]) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
      };

      /** Geen ploeg twee keer te dicht op elkaar (beker + competitie / dual). */
      const assignmentRespectsTeamDays = (
        mondayIso: string,
        matchesList: DivisionAwareMatch[],
        chosen: Array<{ r: number; c: number }>,
      ): boolean => {
        const datesByTeam = new Map<number, string[]>();
        const byTeam = config.cupTeamDatesByMonday?.[mondayIso] ?? {};
        for (const [idStr, dates] of Object.entries(byTeam)) {
          const id = Number(idStr);
          if (!Number.isFinite(id)) continue;
          const list = datesByTeam.get(id) ?? [];
          for (const d of dates) list.push(String(d).slice(0, 10));
          datesByTeam.set(id, list);
        }
        const claim = (teamId: number, date: string): boolean => {
          const list = datesByTeam.get(teamId) ?? [];
          const minGap = dualWeek ? MIN_DUAL_WEEK_DAY_GAP : 1;
          for (const existing of list) {
            if (minGap <= 1) {
              if (existing === date) return false;
            } else if (!hasMinimumDaySeparation(existing, date, minGap)) {
              return false;
            }
          }
          list.push(date);
          datesByTeam.set(teamId, list);
          return true;
        };
        for (const ch of chosen) {
          const mt = matchesList[ch.r];
          const dow = slotDetails[ch.c]?.timeslot?.day_of_week;
          if (typeof dow !== "number") return false;
          const slotDate = matchDateFromWeekMonday(mondayIso, dow);
          if (!claim(mt.home, slotDate)) return false;
          if (!claim(mt.away, slotDate)) return false;
        }
        return true;
      };

      for (const [weekIndex, matchesList] of weekToMatches.entries()) {
        const m = matchesList.length;
        if (m === 0) continue;

        const weekMonday = playingWeeks[weekIndex];
        const mondayIso = toMondayIso(weekMonday);
        const blocked = new Set(slotCtx.getBlockedSlotIndices(weekMonday));
        for (const idx of config.cupOccupiedSlotsByMonday?.[mondayIso] ?? []) {
          blocked.add(idx);
        }
        const isSharedCupWeek =
          softShare && cupDay != null && sharedCupMondaySet.has(mondayIso);
        // Alleen door de beker geclaimde momenten vallen weg; de rest van de bekerdag
        // blijft beschikbaar voor ploegen zonder bekerwedstrijd die week.
        let availableSlots = slotCtx
          .getAvailableSlotIndices(weekMonday)
          .filter((idx) => !blocked.has(idx));

        // Competitiedag eerst (bv. vrijdag); bij tekort geleidelijk dichterbij
        // uitbreiden (donderdag vóór dinsdag) — niet meteen alle weekdagen openzetten.
        if (compDay != null && m > 0) {
          const unscoped = availableSlots;
          availableSlots = scopeSlotsByPreferredDayDistance(
            unscoped,
            compDay,
            m,
            (idx) => slotCtx.slotDetails[idx]?.timeslot?.day_of_week,
          );
          availableSlots = appendPeriodBoundedSlots(
            availableSlots,
            unscoped,
            (idx) => {
              const ts = slotCtx.slotDetails[idx]?.timeslot;
              return ts ? isPeriodBoundedTimeslot(ts) : false;
            },
          );
        }

        if (m > availableSlots.length) {
          return {
            success: false,
            message: `Week van ${weekMonday}: ${m} wedstrijden nodig maar slechts ${availableSlots.length} slots vrij` +
              (isSharedCupWeek ? ` (bekerdag/slots gereserveerd)` : " (veldblokkades/beker)."),
            plan: [],
          };
        }

        // Build score matrix m x 7 with seasonal fairness boosts and adaptive fallback
        const { applyAdaptiveFallback } = await import("@/services/core/teamPreferencesService");
        const {
          pickPriorityCandidateSlots,
          slotPriorityScoreBonus,
        } = await import("@/lib/slotPriorityPacking");
        const scoreMatrix: Array<Array<{ combined: number; h: number; a: number }>> = [];
        
        for (let r = 0; r < m; r++) {
          const { home, away } = matchesList[r];
          const row: Array<{ combined: number; h: number; a: number }> = [];
          // Echte bekerdatums van deze twee ploegen deze week (leeg = vrij te plannen)
          const matchCupDates = cupDatesForTeams(mondayIso, [home, away]);
          
          // Calculate base scores for all slots first
          const homeSlotScores = new Array(totalAvailableSlots).fill(0);
          const awaySlotScores = new Array(totalAvailableSlots).fill(0);
          
          for (let c = 0; c < totalAvailableSlots; c++) {
            if (blocked.has(c)) continue;
            const { venue, timeslot } = slotDetails[c];
            const hRes = scoreTeamForDetails(teamPreferences.get(home), timeslot, venue, venues);
            const aRes = scoreTeamForDetails(teamPreferences.get(away), timeslot, venue, venues);
            homeSlotScores[c] = hRes.score;
            awaySlotScores[c] = aRes.score;
          }
          
          // Apply adaptive fallback if needed
          const adjustedHomeScores = applyAdaptiveFallback(home, homeSlotScores, teamPreferences);
          const adjustedAwayScores = applyAdaptiveFallback(away, awaySlotScores, teamPreferences);
          
          // Apply seasonal fairness boosts to adjusted scores
          for (let c = 0; c < totalAvailableSlots; c++) {
            if (blocked.has(c)) {
              row.push({ combined: -1, h: 0, a: 0 });
              continue;
            }
            // Ploeg met beker deze week: alleen slots ≥3 dagen ná die bekerwedstrijd
            if (!slotRespectsCupGap(mondayIso, c, matchCupDates)) {
              row.push({ combined: -1, h: 0, a: 0 });
              continue;
            }
            const homeBoost = calculateFairnessBoost(home, teamFairness);
            const awayBoost = calculateFairnessBoost(away, teamFairness);
            
            // Create pseudo-deficit for teams with no matches to enable boosting in preview
            const homeFairness = teamFairness.find(tf => tf.teamId === home);
            const awayFairness = teamFairness.find(tf => tf.teamId === away);
            
            const homeHasPseudoDeficit = homeFairness?.totalMatches === 0;
            const awayHasPseudoDeficit = awayFairness?.totalMatches === 0;
            
            let finalHomeBoost = homeBoost;
            let finalAwayBoost = awayBoost;
            
            // Apply pseudo-deficit boost for teams with no matches (1.2x boost)
            if (homeHasPseudoDeficit && homeBoost === 0) {
              finalHomeBoost = 1.2;
            }
            if (awayHasPseudoDeficit && awayBoost === 0) {
              finalAwayBoost = 1.2;
            }
            
            const homeScore = adjustedHomeScores[c] * finalHomeBoost;
            const awayScore = adjustedAwayScores[c] * finalAwayBoost;
            let combined = homeScore + awayScore;

            // Trek competitie naar voorkeursdag (late dag, bv. vrijdag) — alle weken
            if (compDay != null) {
              const dow = slotDetails[c]?.timeslot?.day_of_week;
              if (typeof dow === "number") {
                const dist = Math.abs(dow - compDay);
                combined += Math.max(0, 4 - dist) * (isSharedCupWeek ? 1.25 : 0.95);
              }
            } else if (isSharedCupWeek && cupDay != null) {
              const dow = slotDetails[c]?.timeslot?.day_of_week;
              if (typeof dow === "number" && dow !== cupDay) {
                combined += 0.4;
              }
            }

            // Zachte prioriteitsbonus: 20:00/19:00 voor 18:00, zonder lage slots uit te sluiten
            combined += slotPriorityScoreBonus(c, totalAvailableSlots);

            row.push({ 
              combined, 
              h: homeScore, 
              a: awayScore 
            });
          }
          scoreMatrix.push(row);
        }

        // Ruimere kandidaten (~1.5× m): hogere prioriteit eerst, lagere uren mogen meedoen
        const candidateSlots = pickPriorityCandidateSlots(
          availableSlots,
          m,
          (c) => scoreMatrix.some((row) => (row[c]?.combined ?? -1) >= 0),
        );

        const allSlots = candidateSlots;
        let assignment: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
        let bestEval = -1;
        // Combinatie-zoek alleen bij kleine m (anders te traag); greedy vult daarna
        if (m <= candidateSlots.length && m <= 8) {
          const slotCombos = combinations(allSlots, m);
          for (const slots of slotCombos) {
            const perms = permutations(slots);
            for (const perm of perms) {
              let sum = 0; const chosen: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
              for (let r = 0; r < m; r++) {
                const c = perm[r]; const s = scoreMatrix[r][c];
                if (s.combined < 0) { sum = Number.NEGATIVE_INFINITY; break; }
                sum += s.combined; chosen.push({ r, c, h: s.h, a: s.a, combined: s.combined });
              }
              if (!Number.isFinite(sum)) continue;
              if (!assignmentRespectsTeamDays(mondayIso, matchesList, chosen)) continue;
              // Fairness-adjusted evaluation
              const baseVar = computeVariance(teamTotals);
              const { min: baseMin, max: baseMax } = computeMinMax(teamTotals);
              const tempTotals = new Map(teamTotals);
              for (const ch of chosen) {
                const mt = matchesList[ch.r];
                tempTotals.set(mt.home, (tempTotals.get(mt.home) || 0) + ch.h);
                tempTotals.set(mt.away, (tempTotals.get(mt.away) || 0) + ch.a);
              }
              const newVar = computeVariance(tempTotals);
              const { min: newMin, max: newMax } = computeMinMax(tempTotals);
              const fairnessPenalty = newVar - baseVar;
              const spreadDelta = (newMax - newMin) - (baseMax - baseMin);
              const minRaise = newMin - baseMin; // reward increasing the minimum
              const baseDef = computeDeficit(teamTotals, lowerBound);
              const newDef = computeDeficit(tempTotals, lowerBound);
              const evalScore = sum
                - fairnessWeight * fairnessPenalty
                - spreadWeight * spreadDelta
                + minRaiseWeight * minRaise
                - lowerBoundWeight * (newDef - baseDef)
                + Math.random() * 0.1; // Add small randomization for variety
              if (evalScore > bestEval || (evalScore === bestEval && Math.random() < 0.5)) { bestEval = evalScore; assignment = chosen; }
            }
          }
        }

        // Enhanced multi-sample search strategy for preview variation
        const useMultiSampleSearch = true; // Always use for preview variation
        
        if (assignment.length === 0 || useMultiSampleSearch) {
          // Generate 30-50 alternative solutions and select top 10% based on fairness score
          const totalSamples = 30 + Math.floor(Math.random() * 20); // 30-50 samples
          const allSolutions: Array<{
            assignment: Array<{ r: number; c: number; h: number; a: number; combined: number }>;
            evalScore: number;
            totalScore: number;
            fairnessScore: number;
          }> = [];
          
          for (let sample = 0; sample < totalSamples; sample++) {
            const attempts = 3 + Math.floor(Math.random() * 3); // 3-5 attempts per sample
            let bestGreedy: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
            let bestGreedyEval = -1;
          for (let attempt = 0; attempt < attempts; attempt++) {
            const order = shuffle(Array.from({ length: m }, (_, i) => i));
            const used = new Set<number>();
            const chosen: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
            for (const r of order) {
              let bestC = -1, best = -1, bh = 0, ba = 0;
              for (const c of candidateSlots) {
                if (used.has(c)) continue;
                const s = scoreMatrix[r][c];
                if (s.combined < 0) continue;
                // Small random jitter in tie-breaking
                const jitter = Math.random() * 0.0001;
                if (s.combined + jitter > best) { best = s.combined + jitter; bestC = c; bh = s.h; ba = s.a; }
              }
              if (bestC === -1) { // fallback: eerste toegestane slot (geen cup-gap-schending)
                for (const c of candidateSlots) {
                  if (used.has(c)) continue;
                  const s = scoreMatrix[r][c];
                  if (s.combined < 0) continue;
                  bestC = c;
                  bh = s.h;
                  ba = s.a;
                  best = s.combined;
                  break;
                }
              }
              if (bestC === -1) {
                bestGreedy = [];
                bestGreedyEval = -1;
                break;
              }
              used.add(bestC);
              chosen.push({ r, c: bestC, h: bh, a: ba, combined: scoreMatrix[r][bestC].combined });
            }
            if (chosen.length !== m) continue;
            if (!assignmentRespectsTeamDays(mondayIso, matchesList, chosen)) continue;
            // Compare sums (remove jitter effect for comparison by recomputing actual sum)
            const trueSum = chosen.reduce((acc, ch) => acc + scoreMatrix[ch.r][ch.c].combined, 0);
            // Enhanced evaluation with seasonal fairness
            const baseVar = computeVariance(teamTotals);
            const { min: baseMin, max: baseMax } = computeMinMax(teamTotals);
            const tempTotals = new Map(teamTotals);
            
            for (const ch of chosen) {
              const mt = matchesList[ch.r];
              tempTotals.set(mt.home, (tempTotals.get(mt.home) || 0) + ch.h);
              tempTotals.set(mt.away, (tempTotals.get(mt.away) || 0) + ch.a);
            }
            
            const newVar = computeVariance(tempTotals);
            const { min: newMin, max: newMax } = computeMinMax(tempTotals);
            const fairnessPenalty = newVar - baseVar;
            const spreadDelta = (newMax - newMin) - (baseMax - baseMin);
            const minRaise = newMin - baseMin;
            const baseDef = computeDeficit(teamTotals, lowerBound);
            const newDef = computeDeficit(tempTotals, lowerBound);
            const evalScore = trueSum
              - fairnessWeight * fairnessPenalty
              - spreadWeight * spreadDelta
              + minRaiseWeight * minRaise
              - lowerBoundWeight * (newDef - baseDef)
              + Math.random() * 0.1; // Add small randomization for variety
            if (evalScore > bestGreedyEval || (evalScore === bestGreedyEval && Math.random() < 0.5)) {
              bestGreedyEval = evalScore;
              bestGreedy = chosen.map(ch => ({ ...ch, combined: scoreMatrix[ch.r][ch.c].combined }));
            }
            }
            
            if (bestGreedy.length > 0) {
              // Calculate fairness score for this solution
              const baseVar = computeVariance(teamTotals);
              const tempTotals = new Map(teamTotals);
              
              for (const ch of bestGreedy) {
                const mt = matchesList[ch.r];
                tempTotals.set(mt.home, (tempTotals.get(mt.home) || 0) + ch.h);
                tempTotals.set(mt.away, (tempTotals.get(mt.away) || 0) + ch.a);
              }
              
              const newVar = computeVariance(tempTotals);
              const fairnessScore = Math.max(0, 100 - (newVar - baseVar) * 10);
              const totalScore = bestGreedy.reduce((sum, ch) => sum + ch.combined, 0);
              
              allSolutions.push({
                assignment: bestGreedy,
                evalScore: bestGreedyEval,
                totalScore,
                fairnessScore
              });
            }
          }
          
          // Select from top 10% solutions randomly (weighted by fairness + score)
          if (allSolutions.length > 0) {
            allSolutions.sort((a, b) => (b.fairnessScore + b.totalScore * 0.1) - (a.fairnessScore + a.totalScore * 0.1));
            const topSolutions = allSolutions.slice(0, Math.max(1, Math.floor(allSolutions.length * 0.1)));
            const selectedSolution = topSolutions[Math.floor(Math.random() * topSolutions.length)];
            
            assignment = selectedSolution.assignment;
            bestEval = selectedSolution.evalScore;
            
            console.log(`🎲 Multi-sample search: Generated ${allSolutions.length} solutions, selected from top ${topSolutions.length} (fairness: ${selectedSolution.fairnessScore.toFixed(1)}, score: ${selectedSolution.totalScore.toFixed(1)})`);
          }
        }

        // Nooit stilzwijgend wedstrijden laten vallen: alles of een duidelijke fout.
        if (assignment.length !== m) {
          return {
            success: false,
            message:
              `Week van ${weekMonday}: ${m} wedstrijden konden niet allemaal een geldig ` +
              `speelmoment krijgen (${assignment.length} geplaatst)` +
              (isSharedCupWeek
                ? ". Op bekerweken moet een ploeg met beker minstens 3 dagen later spelen."
                : ". Controleer veldblokkades en tijdslots voor deze week."),
            plan: [],
          };
        }

        // Emit plan for week and update team totals for fairness
        for (const asn of assignment) {
          const match = matchesList[asn.r];
          const { venue, timeslot } = slotDetails[asn.c];
          const baseDate = playingWeeks[weekIndex];
          const matchDate = matchDateFromWeekMonday(
            baseDate,
            timeslot?.day_of_week,
          );
          const matchTime = timeslot?.start_time || '19:00';
          plan.push({
            unique_number: `REG-${String(counter).padStart(3, '0')}`,
            speeldag: this.formatSpeeldagLabel(match),
            home_team_id: match.home,
            away_team_id: match.away,
            match_date: matchDate,
            match_time: matchTime,
            venue,
            details: { homeScore: asn.h, awayScore: asn.a, combined: asn.combined, maxCombined: 6 }
          });
          totalCombined += asn.combined; counter++;
          teamTotals.set(match.home, (teamTotals.get(match.home) || 0) + asn.h);
          teamTotals.set(match.away, (teamTotals.get(match.away) || 0) + asn.a);
        }
      }

      // Voeg BYE-rijen toe bij oneven aantal teams: per speeldag/reeks 1 team heeft bye
      const byeGroups = new Map<string, { teams: Set<number>; sample: DivisionAwareMatch }>();
      for (const m of regularMatches) {
        const key = m.matchdayKey;
        const group = byeGroups.get(key) ?? {
          teams: new Set<number>(),
          sample: m,
        };
        // Teams in this division only
        const divisionTeams = regularMatches
          .filter((x) => x.divisionId === m.divisionId)
          .flatMap((x) => [x.home, x.away]);
        divisionTeams.forEach((t) => group.teams.add(t));
        byeGroups.set(key, group);
      }

      for (const [md, group] of byeGroups) {
        if (group.teams.size % 2 === 0) continue;
        const mdMatches = matchesByMatchday.get(md) || [];
        const present = new Set<number>();
        mdMatches.forEach((m) => {
          present.add(m.home);
          present.add(m.away);
        });
        const byeTeam = Array.from(group.teams).find((t) => !present.has(t));
        if (typeof byeTeam === "number") {
          const assignedWeek = matchdayToWeek.get(md) ?? 0;
          const baseDate = playingWeeks[assignedWeek];
          const byeDate = matchDateFromWeekMonday(
            baseDate,
            compDay ?? cupDay ?? 1,
          );
          plan.push({
            unique_number: `BYE-${md}`.slice(0, 40),
            speeldag: this.formatSpeeldagLabel(group.sample),
            home_team_id: byeTeam,
            away_team_id: null,
            match_date: byeDate,
            match_time: "00:00",
            venue: "BYE",
            details: { homeScore: 0, awayScore: 0, combined: 0, maxCombined: 0 },
          });
        }
      }

      // Convert teamTotals map to plain object
      const totalsObj: Record<number, number> = {};
      Array.from(teamTotals.entries()).forEach(([teamId, total]) => { totalsObj[teamId] = total; });
      return { success: true, message: 'Preview competitie gegenereerd', plan, totalCombined, teamTotals: totalsObj };
    } catch (e) {
      console.error('Error previewing competition:', e);
      return { success: false, message: 'Fout bij preview competitie', plan: [] };
    }
  },

  // Genereer meerdere alternatieve previews en geef top X% terug op basis van totale score
  async previewCompetitionTop(
    config: CompetitionConfig,
    samples: number = 40,
    topPercent: number = 0.05
  ): Promise<{ success: boolean; message: string; previews: Array<{ plan: Array<{ unique_number: string; speeldag: string; home_team_id: number; away_team_id: number | null; match_date: string; match_time: string; venue: string; details: { homeScore: number; awayScore: number; combined: number; maxCombined: number } }>; totalCombined: number }> }> {
    try {
      // Validate basic input
      const inputValidation = this.validateCompetitionInput(config);
      if (!inputValidation.isValid) {
        return { success: false, message: inputValidation.message!, previews: [] };
      }

      // Generate weeks once
      const { weeks: playingWeeks } = await this.generatePlayingWeeks(config);
      if (playingWeeks.length === 0) {
        return { success: false, message: 'Geen beschikbare speelweken', previews: [] };
      }

      // Generate regular matches once (per reeks indien van toepassing)
      const regularMatches = this.generateDivisionAwareRegularMatches(config);

      // Load preferences and venues once
      const seasonData = await seasonService.getSeasonData(config.organizationId);
      const allTeamsData = await teamService.getAllTeams();
      const selectedTeamsSet = new Set(config.teams);
      const teamPreferences = normalizeTeamsPreferences(allTeamsData.filter(t => selectedTeamsSet.has(t.team_id)));
      const venues = seasonData.venues || [];

      // Prepare common structures (per reeks via matchdayKey)
      const allTeamsSet = new Set<number>();
      regularMatches.forEach((m) => {
        allTeamsSet.add(m.home);
        allTeamsSet.add(m.away);
      });

      const matchesByMatchdayBase = new Map<string, DivisionAwareMatch[]>();
      regularMatches.forEach((m) => {
        const arr = matchesByMatchdayBase.get(m.matchdayKey) || [];
        arr.push(m);
        matchesByMatchdayBase.set(m.matchdayKey, arr);
      });

      // Preload slot planning (veldblokkades + priority slots)
      const slotCtx = await loadSlotPlanningContext(config.organizationId);
      const totalAvailableSlots = slotCtx.totalSlots;
      const slotDetails = slotCtx.slotDetails;
      const matchesPerWeekCap = 7;

      // Helper for one preview using prepared data
      const generateOnePreview = async () => {
        const teamsPerWeek: Map<number, Set<number>> = new Map();
        const weekToMatches: Map<number, DivisionAwareMatch[]> = new Map();
        for (let w = 0; w < playingWeeks.length; w++) {
          teamsPerWeek.set(w, new Set());
          weekToMatches.set(w, []);
        }

        const matchesByMatchday = new Map(matchesByMatchdayBase);
        const currentWeekByPool = new Map<string, number>();
        const sortedMatchdays = Array.from(matchesByMatchday.keys()).sort(compareMatchdayKeys);
        const matchdayToWeek: Map<string, number> = new Map();

        for (const md of sortedMatchdays) {
          const mdMatches = matchesByMatchday.get(md)!;
          const { poolKey } = parseMatchdayKey(md);
          let poolWeek = currentWeekByPool.get(poolKey) ?? 0;
          let maxWeekUsed = poolWeek;
          for (const m of mdMatches) {
            let placed = false;
            for (let w = poolWeek; w < playingWeeks.length; w++) {
              const teamSet = teamsPerWeek.get(w)!;
              const list = weekToMatches.get(w)!;
              if (list.length >= slotCtx.getWeekCapacity(playingWeeks[w])) continue;
              if (teamSet.has(m.home) || teamSet.has(m.away)) continue;
              teamSet.add(m.home); teamSet.add(m.away);
              list.push(m);
              if (!matchdayToWeek.has(md)) matchdayToWeek.set(md, w);
              maxWeekUsed = Math.max(maxWeekUsed, w);
              placed = true; break;
            }
            if (!placed) {
              return { plan: [], totalCombined: -1 };
            }
          }
          poolWeek = maxWeekUsed;
          while (
            poolWeek < playingWeeks.length &&
            weekToMatches.get(poolWeek)!.length >=
              slotCtx.getWeekCapacity(playingWeeks[poolWeek])
          ) {
            poolWeek++;
          }
          currentWeekByPool.set(poolKey, poolWeek);
        }

        // Score matrix per week and stochastic assignment (same rules as previewCompetition)
        const plan: Array<{ unique_number: string; speeldag: string; home_team_id: number; away_team_id: number | null; match_date: string; match_time: string; venue: string; details: { homeScore: number; awayScore: number; combined: number; maxCombined: number } } > = [];
        let totalCombined = 0;

        // Helpers
        const combinations = (arr: number[], k: number): number[][] => {
          const res: number[][] = []; const back = (start: number, path: number[]) => {
            if (path.length === k) { res.push([...path]); return; }
            for (let i = start; i < arr.length; i++) { path.push(arr[i]); back(i + 1, path); path.pop(); }
          }; back(0, []); return res;
        };
        const permutations = (arr: number[]): number[][] => {
          const res: number[][] = []; const used = new Array(arr.length).fill(false); const path: number[] = [];
          const back = () => { if (path.length === arr.length) { res.push([...path]); return; } for (let i = 0; i < arr.length; i++) { if (used[i]) continue; used[i] = true; path.push(arr[i]); back(); path.pop(); used[i] = false; } };
          back(); return res;
        };
        const shuffle = (arr: number[]) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };

        let counter = 1;
        for (const [weekIndex, matchesList] of weekToMatches.entries()) {
          const m = matchesList.length;
          if (m === 0) continue;

          const {
            pickPriorityCandidateSlots,
            slotPriorityScoreBonus,
          } = await import("@/lib/slotPriorityPacking");
          const scoreMatrix: Array<Array<{ combined: number; h: number; a: number }>> = [];
          for (let r = 0; r < m; r++) {
            const { home, away } = matchesList[r];
            const row: Array<{ combined: number; h: number; a: number }> = [];
            for (let c = 0; c < totalAvailableSlots; c++) {
              const { venue, timeslot } = slotDetails[c];
              const hRes = scoreTeamForDetails(teamPreferences.get(home), timeslot, venue, venues);
              const aRes = scoreTeamForDetails(teamPreferences.get(away), timeslot, venue, venues);
              const combined =
                (hRes.score as number) +
                (aRes.score as number) +
                slotPriorityScoreBonus(c, totalAvailableSlots);
              row.push({
                combined,
                h: hRes.score as number,
                a: aRes.score as number,
              });
            }
            scoreMatrix.push(row);
          }

          const candidateSlots = pickPriorityCandidateSlots(
            Array.from({ length: totalAvailableSlots }, (_, i) => i),
            m,
          );
          let assignment: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
          let bestSum = -1;
          if (m <= candidateSlots.length && m <= 8) {
            const slotCombos = combinations(candidateSlots, m);
            for (const slots of slotCombos) {
              const perms = permutations(slots);
              for (const perm of perms) {
                let sum = 0; const chosen: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
                for (let r = 0; r < m; r++) {
                  const c = perm[r]; const s = scoreMatrix[r][c]; sum += s.combined; chosen.push({ r, c, h: s.h, a: s.a, combined: s.combined });
                }
                if (sum > bestSum || (sum === bestSum && Math.random() < 0.5)) { bestSum = sum; assignment = chosen; }
              }
            }
          }

          if (assignment.length === 0) {
            const attempts = 10 + Math.floor(Math.random() * 5);
            let bestGreedy: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
            let bestGreedySum = -1;
            for (let attempt = 0; attempt < attempts; attempt++) {
              const order = shuffle(Array.from({ length: m }, (_, i) => i));
              const used = new Set<number>();
              const chosen: Array<{ r: number; c: number; h: number; a: number; combined: number }> = [];
              for (const r of order) {
                let bestC = -1, best = -1, bh = 0, ba = 0;
                for (const c of candidateSlots) {
                  if (used.has(c)) continue;
                  const s = scoreMatrix[r][c];
                  const jitter = Math.random() * 0.0001;
                  if (s.combined + jitter > best) { best = s.combined + jitter; bestC = c; bh = s.h; ba = s.a; }
                }
                if (bestC === -1) {
                  for (const c of candidateSlots) {
                    if (!used.has(c)) {
                      bestC = c;
                      const s = scoreMatrix[r][c];
                      bh = s.h;
                      ba = s.a;
                      best = s.combined;
                      break;
                    }
                  }
                }
                used.add(bestC);
                chosen.push({ r, c: bestC, h: bh, a: ba, combined: scoreMatrix[r][bestC].combined });
              }
              const trueSum = chosen.reduce((acc, ch) => acc + scoreMatrix[ch.r][ch.c].combined, 0);
              if (trueSum > bestGreedySum || (trueSum === bestGreedySum && Math.random() < 0.5)) { bestGreedySum = trueSum; bestGreedy = chosen; }
            }
            assignment = bestGreedy;
            bestSum = bestGreedySum;
          }

          // Emit plan for week
          for (const asn of assignment) {
            const match = matchesList[asn.r];
            const { venue, timeslot } = slotDetails[asn.c];
            const baseDate = playingWeeks[weekIndex];
            const matchDate = matchDateFromWeekMonday(
              baseDate,
              timeslot?.day_of_week,
            );
            const matchTime = timeslot?.start_time || '19:00';
            plan.push({
              unique_number: `REG-${String(counter).padStart(3, '0')}`,
              speeldag: this.formatSpeeldagLabel(match),
              home_team_id: match.home,
              away_team_id: match.away,
              match_date: matchDate,
              match_time: matchTime,
              venue,
              details: { homeScore: asn.h, awayScore: asn.a, combined: asn.combined, maxCombined: 6 }
            });
            totalCombined += asn.combined; counter++;
          }
        }

        // BYE rows per reeks/speeldag (Tuesday date)
        const byeGroups = new Map<string, { teams: Set<number>; sample: DivisionAwareMatch }>();
        for (const m of regularMatches) {
          const key = m.matchdayKey;
          const group = byeGroups.get(key) ?? {
            teams: new Set<number>(),
            sample: m,
          };
          const divisionTeams = regularMatches
            .filter((x) => x.divisionId === m.divisionId)
            .flatMap((x) => [x.home, x.away]);
          divisionTeams.forEach((t) => group.teams.add(t));
          byeGroups.set(key, group);
        }
        for (const [md, group] of byeGroups) {
          if (group.teams.size % 2 === 0) continue;
          const mdMatches = matchesByMatchdayBase.get(md) || [];
          const present = new Set<number>();
          mdMatches.forEach((m) => {
            present.add(m.home);
            present.add(m.away);
          });
          const byeTeam = Array.from(group.teams).find((t) => !present.has(t));
          if (typeof byeTeam === "number") {
            const assignedWeek = matchdayToWeek.get(md) ?? 0;
            const baseDate = playingWeeks[assignedWeek];
            const byeDate = matchDateFromWeekMonday(
              baseDate,
              config.competitionPreferredDayOfWeek ?? 1,
            );
            plan.push({
              unique_number: `BYE-${md}`.slice(0, 40),
              speeldag: this.formatSpeeldagLabel(group.sample),
              home_team_id: byeTeam,
              away_team_id: null,
              match_date: byeDate,
              match_time: "00:00",
              venue: "BYE",
              details: { homeScore: 0, awayScore: 0, combined: 0, maxCombined: 0 },
            });
          }
        }

        return { plan, totalCombined };
      };

      // Generate multiple previews and select top X%
      const results: Array<{ plan: any[]; totalCombined: number }> = [];
      const runs = Math.max(1, samples);
      for (let i = 0; i < runs; i++) {
        const res = await generateOnePreview();
        if (res.plan.length > 0) results.push(res);
      }

      if (results.length === 0) {
        return { success: false, message: 'Geen alternatieven beschikbaar', previews: [] };
      }

      results.sort((a, b) => b.totalCombined - a.totalCombined);
      const topCount = Math.max(1, Math.ceil(results.length * Math.max(0.01, Math.min(1, topPercent))));
      const top = results.slice(0, topCount);
      return { success: true, message: `Top ${topCount}/${results.length} alternatieven`, previews: top };
    } catch (e) {
      console.error('Error generating top previews:', e);
      return { success: false, message: 'Fout bij genereren top previews', previews: [] };
    }
  },

  async createCompetitionFromPlan(plan: Array<{ unique_number: string; speeldag: string; home_team_id: number; away_team_id: number | null; match_date: string; match_time: string; venue: string }>): Promise<{ success: boolean; message: string }> {
    try {
      const existing = await fetchMatchesForSession({ is_cup_match: false });
      const existingCompetition = existing.filter((m) => !m.is_playoff_match);
      if (existingCompetition.length > 0) {
        return {
          success: false,
          message:
            "Er bestaat al een competitie. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
        };
      }

      // Verwijder BYE-rijen (away_team_id === null) bij import
      const filteredPlan = plan.filter(p => p.away_team_id !== null);

      const rows = filteredPlan.map(p => this.createMatchObject(
        p.unique_number,
        p.speeldag,
        p.home_team_id,
        p.away_team_id,
        localDateTimeToISO(p.match_date, p.match_time),
        p.venue
      ));

      const insertResult = await bulkInsertMatchesForSession(rows);
      if (!insertResult.success) throw new Error(insertResult.error || 'Import mislukt');
      return { success: true, message: 'Competitieplan geïmporteerd' };
    } catch (e) {
      console.error('Error importing competition plan:', e);
      return { success: false, message: 'Fout bij importeren competitieplan' };
    }
  },

  // Hoofdfunctie voor het genereren van competitie
  async generateCompetition(config: CompetitionConfig): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🏆 Start competitie generatie:', config);

      // Validaties
      const inputValidation = this.validateCompetitionInput(config);
      if (!inputValidation.isValid) {
        return { success: false, message: inputValidation.message! };
      }

      const existingCompetition = await this.checkExistingCompetition();
      if (existingCompetition.exists) {
        return { success: false, message: existingCompetition.message! };
      }

      const seasonValidation = await this.validateSeasonData(config.organizationId);
      if (!seasonValidation.isValid) {
        return { success: false, message: seasonValidation.message! };
      }

      // Genereer automatisch speelweken
      const { weeks: playingWeeks, message: weeksMessage } = await this.generatePlayingWeeks(config);
      if (playingWeeks.length === 0) {
        return { success: false, message: "Geen beschikbare speelweken gevonden. Controleer seizoen data, bekerwedstrijden en vakanties." };
      }
      
      console.log('📅 Automatisch gegenereerde speelweken:', playingWeeks);
      console.log(weeksMessage);

      // Bereken reguliere competitie wedstrijden (per reeks indien van toepassing)
      const regularMatches = this.generateDivisionAwareRegularMatches(config);
      const totalRegularMatches = regularMatches.length;
      const weeksNeeded = this.calculateWeeksNeeded(totalRegularMatches, 7);
      
      console.log(`⚽ Reguliere wedstrijden: ${totalRegularMatches} (${weeksNeeded} weken nodig)`);
      
      // Controleer of we genoeg weken hebben
      if (playingWeeks.length < weeksNeeded) {
        const teamsCount = config.teams.length;
        const roundsCount = config.format.regular_rounds;
        
        // Bereken alternatieven
        const alternatives = [];
        
        // Optie 1: Verminder teams
        if (teamsCount > 8) {
          const reducedTeams = Math.max(8, teamsCount - 2);
          const reducedMatches = this.calculateRegularMatches(Array(reducedTeams).fill(0), roundsCount);
          const reducedWeeks = this.calculateWeeksNeeded(reducedMatches, 7);
          alternatives.push(`- Verminder naar ${reducedTeams} teams: ${reducedWeeks} weken nodig`);
        }
        
        // Optie 2: Verminder teams (reguliere competitie is altijd 1 ronde)
        if (teamsCount > 12) {
          const reducedTeams = Math.max(12, teamsCount - 2);
          const reducedMatches = this.calculateRegularMatches(Array(reducedTeams).fill(0), 1);
          const reducedWeeks = this.calculateWeeksNeeded(reducedMatches, 7);
          alternatives.push(`- Verminder naar ${reducedTeams} teams: ${reducedWeeks} weken nodig`);
        }
        
        // Optie 3: Uitzonderlijk dubbel spelen (gespreide dagen)
        const moreMatchesPerWeek = this.calculateWeeksNeeded(totalRegularMatches, 8);
        if (moreMatchesPerWeek <= playingWeeks.length) {
          alternatives.push(
            `- Uitzonderlijk 2× per week in ~${weeksNeeded - playingWeeks.length} week(en), bij voorkeur gespreid (bv. maandag + vrijdag): ${moreMatchesPerWeek} weken nodig`,
          );
        }
        
        const alternativesText = alternatives.length > 0 ? `\n\nAlternatieven:\n${alternatives.join('\n')}` : '';
        
        return { 
          success: false, 
          message: `Niet genoeg speelweken beschikbaar voor ${teamsCount} teams in reguliere competitie. ` +
                   `Nodig: ${weeksNeeded} weken, Beschikbaar: ${playingWeeks.length} weken. ` +
                   `Voor 4 maanden (16-18 weken) kun je maximaal ${Math.floor(playingWeeks.length * 7 / (teamsCount * (teamsCount - 1) / 2))} teams spelen.` +
                   alternativesText
        };
      }

      // Laad teamvoorkeuren en normaliseer
      const allTeamsData = await teamService.getAllTeams();
      const selectedTeamsSet = new Set(config.teams);
      const teamPreferencesRaw = allTeamsData.filter(t => selectedTeamsSet.has(t.team_id));
      const teamPreferences = normalizeTeamsPreferences(teamPreferencesRaw);

      // Verdeel reguliere wedstrijden over weken met voorkeur-scoring
      const distributedRegularMatches = await this.distributeMatchesOverWeeks(regularMatches, playingWeeks, {
        teamPreferences,
        venues: seasonValidation.data?.venues,
        dayNames: seasonValidation.data?.day_names,
        organizationId: config.organizationId,
      });
      console.log(`📊 Verdeelde reguliere wedstrijden: ${distributedRegularMatches.length}`);

      // Genereer alle wedstrijd objecten voor reguliere competitie
      const regularSeasonMatches = [];
      let matchCounter = 1;

      for (const distributedMatch of distributedRegularMatches) {
        const { match, week, slot } = distributedMatch;
        
        // Haal venue en timeslot op basis van prioriteit
        const { venue, timeslot } = await priorityOrderService.getMatchDetails(slot, 7);
        
        // Bepaal correcte datum
        const baseDate = playingWeeks[week];
        const matchDate = matchDateFromWeekMonday(
          baseDate,
          timeslot?.day_of_week,
        );
        
        // Format match datum met tijd (UTC opslag, behoud lokale kloktijd)
        const matchDateTime = localDateTimeToISO(matchDate, timeslot?.start_time || '19:00');
        
        // Gebruik de correcte speeldag van het round-robin algoritme (+ reeksnaam)
        const matchday = match.matchday || Math.floor((matchCounter - 1) / 8) + 1;
        const speeldagLabel = this.formatSpeeldagLabel({
          matchday,
          divisionName: (match as DivisionAwareMatch).divisionName ?? null,
        });
        
        console.log(
          `🎯 Reguliere wedstrijd ${matchCounter}: Week ${week + 1}, ${speeldagLabel}, day=${timeslot?.day_of_week ?? "?"}, Slot ${slot + 1}, ${venue} (Team ${match.home} vs Team ${match.away})`,
        );        
        regularSeasonMatches.push(this.createMatchObject(
          `REG-${matchCounter}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          speeldagLabel,
          match.home,
          match.away,
          matchDateTime,
          venue
        ));
        
        matchCounter++;
      }

      // Playoff wedstrijden worden later apart gegenereerd
      let playoffMatches = [];
      console.log(`🏆 Playoff wedstrijden worden later apart gegenereerd op basis van eindstand`);

      // Sla alle wedstrijden op in database
      const allMatches = [...regularSeasonMatches, ...playoffMatches];
      
      try {
        const insertResult = await bulkInsertMatchesForSession(allMatches);
        if (!insertResult.success) {
          console.error('❌ Fout bij opslaan wedstrijden:', insertResult.error);
          return { success: false, message: `Fout bij opslaan: ${insertResult.error || 'onbekend'}` };
        }
      } catch (error) {
        console.error('❌ Fout bij opslaan wedstrijden:', error);
        return { success: false, message: `Fout bij opslaan: ${error instanceof Error ? error.message : 'Onbekende fout'}` };
      }

      console.log(`✅ Reguliere competitie succesvol gegenereerd: ${regularSeasonMatches.length} wedstrijden`);
      
      return { 
        success: true, 
        message: `Reguliere competitie succesvol gegenereerd! ${regularSeasonMatches.length} wedstrijden. Playoffs kunnen later apart worden gegenereerd op basis van de eindstand. ${weeksMessage}` 
      };

    } catch (error) {
      console.error('❌ Fout bij genereren competitie:', error);
      return { 
        success: false, 
        message: `Fout bij genereren competitie: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  // Haal alle competitie wedstrijden op
  async getCompetitionMatches(): Promise<CompetitionMatch[]> {
    try {
      const data = await fetchMatchesForSession({ is_cup_match: false });

      // Map data en detecteer playoff wedstrijden uit speeldag veld
      return data.map((match: any) => {
        const isPlayoff = match.speeldag?.includes('[PLAYOFF:');
        let playoffRound: string | undefined;
        let playoffPosition: string | undefined;
        
        if (isPlayoff) {
          // Extraheer playoff informatie uit speeldag
          const playoffMatch = match.speeldag.match(/\[PLAYOFF: ([^\]]+)\]/);
          playoffRound = playoffMatch ? playoffMatch[1] : undefined;
          playoffPosition = `pos_${match.match_id}`;
        }

        return {
          ...match,
          is_playoff_match: isPlayoff,
          playoff_round: playoffRound,
          playoff_position: playoffPosition
        };
      });
    } catch (error) {
      console.error('Error fetching competition matches:', error);
      throw error;
    }
  },

  /** Wedstrijden worden nooit hard verwijderd (cascade wist ook team_costs/saldi). */
  async deleteCompetition(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message:
        "Competitiewedstrijden mogen niet verwijderd worden. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
    };
  },

  // Update competitie wedstrijd
  async updateCompetitionMatch(matchId: number, updateData: Partial<CompetitionMatch>): Promise<{ success: boolean; message: string }> {
    try {
      // Filter playoff velden uit voor database compatibiliteit
      const { is_playoff_match, playoff_round, playoff_position, ...databaseUpdateData } = updateData as any;
      
      const { data: rpcData, error } = await supabase.rpc('update_match_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: matchId,
        p_update_data: databaseUpdateData,
      });

      if (error) {
        console.error('Error updating competition match:', error);
        return { success: false, message: `Fout bij updaten: ${error.message}` };
      }
      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!result?.success) {
        return { success: false, message: result?.message || 'Fout bij updaten' };
      }

      return { success: true, message: "Wedstrijd succesvol bijgewerkt" };
    } catch (error) {
      console.error('Error updating competition match:', error);
      return { 
        success: false, 
        message: `Fout bij updaten wedstrijd: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  /** Wedstrijden worden nooit hard verwijderd (cascade wist ook team_costs/saldi). */
  async deletePlayoffMatches(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message:
        "Playoffwedstrijden mogen niet verwijderd worden. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
    };
  },

  // Genereer beschikbare speelweken voor playoffs (zonder weekbehoefte-berekening)
  async generatePlayoffWeeks(start_date: string, end_date: string): Promise<string[]> {
    return playoffService.generatePlayoffWeeks(start_date, end_date);
  },

  // Genereer rondes voor playoffs met configurable aantal rondes
  generatePlayoffRoundMatchesCustom(teams: number[], roundType: string, rounds: number): Array<{ home: number; away: number; round: string }> {
    const matches: Array<{ home: number; away: number; round: string }> = [];
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          if (round % 2 === 1) {
            matches.push({ home: teams[i], away: teams[j], round: `${roundType}_r${round}` });
          } else {
            matches.push({ home: teams[j], away: teams[i], round: `${roundType}_r${round}` });
          }
        }
      }
    }
    return matches;
  },

  // Genereer en sla playoff wedstrijden op volgens 7 slots/week, met venue/tijd
  async generateAndSavePlayoffs(
    topTeams: number[],
    bottomTeams: number[],
    rounds: number,
    start_date: string,
    end_date: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const seasonValidation = await this.validateSeasonData();
      if (!seasonValidation.isValid) {
        return { success: false, message: seasonValidation.message! };
      }

      const playingWeeks = await this.generatePlayoffWeeks(start_date, end_date);
      if (playingWeeks.length === 0) {
        return { success: false, message: "Geen beschikbare speelweken binnen de geselecteerde periode." };
      }

      const topMatches = this.generatePlayoffRoundMatchesCustom(topTeams, 'top_playoff', rounds);
      const bottomMatches = this.generatePlayoffRoundMatchesCustom(bottomTeams, 'bottom_playoff', rounds);

      // Interleave top/bottom
      const allMatches: Array<{ home: number; away: number; round: string }> = [];
      const maxLen = Math.max(topMatches.length, bottomMatches.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < topMatches.length) allMatches.push(topMatches[i]);
        if (i < bottomMatches.length) allMatches.push(bottomMatches[i]);
      }

      // Distributie met 7 slots/week, geen team 2x per week, met voorkeur-scoring
      const matchesPerWeek = 7;
      const slotCtx = await loadSlotPlanningContext(config.organizationId);
      const teamsPerWeek: Map<number, Set<number>> = new Map();
      const slotsPerWeek: Map<number, number> = new Map();
      for (let w = 0; w < playingWeeks.length; w++) {
        teamsPerWeek.set(w, new Set());
        slotsPerWeek.set(w, 0);
      }

      const placed: Array<{ match: { home: number; away: number; round: string }; week: number; slot: number }> = [];

      // Laad teamvoorkeuren voor alle betrokken teams
      const allTeamsData = await teamService.getAllTeams();
      const involvedTeams = new Set<number>([...topTeams, ...bottomTeams]);
      const teamPrefs = normalizeTeamsPreferences(allTeamsData.filter(t => involvedTeams.has(t.team_id)));
      const venues = seasonValidation.data?.venues || [];

      for (const m of allMatches) {
        // Kies beste week obv score voor slot = slotsUsed
        let bestWeek: number | null = null;
        let bestSlotForWeek = 0;
        let bestScore = -1;
        for (let w = 0; w < playingWeeks.length; w++) {
          const weekTeams = teamsPerWeek.get(w)!;
          const slotsUsed = slotsPerWeek.get(w)!;
          const weekMonday = playingWeeks[w];
          const weekCap = slotCtx.getWeekCapacity(weekMonday);
          if (slotsUsed >= weekCap) continue;
          if (weekTeams.has(m.home) || weekTeams.has(m.away)) continue;

          const slotIndex = slotCtx.getSlotIndexForUsage(weekMonday, slotsUsed);
          if (slotIndex === null) continue;
          const { venue, timeslot } = await priorityOrderService.getMatchDetails(slotIndex, 7);
          const h = scoreTeamForDetails(teamPrefs.get(m.home), timeslot, venue, venues);
          const a = scoreTeamForDetails(teamPrefs.get(m.away), timeslot, venue, venues);
          const combined = h.score + a.score;
          if (combined > bestScore) {
            bestScore = combined;
            bestWeek = w;
            bestSlotForWeek = slotIndex;
          }
        }

        if (bestWeek !== null) {
          const weekTeams = teamsPerWeek.get(bestWeek)!;
          weekTeams.add(m.home); weekTeams.add(m.away);
          teamsPerWeek.set(bestWeek, weekTeams);
          slotsPerWeek.set(bestWeek, bestSlotForWeek + 1);
          placed.push({ match: m, week: bestWeek, slot: bestSlotForWeek });
        } else {
          return { success: false, message: "Onvoldoende weken/slots om alle playoff wedstrijden in te plannen." };
        }
      }

      // Maak DB records
      const matchInserts: any[] = [];
      let counter = 1;
      for (const { match, week, slot } of placed) {
        const { venue, timeslot } = await priorityOrderService.getMatchDetails(slot, 7);
        const baseDate = playingWeeks[week];
        const matchDate = matchDateFromWeekMonday(
          baseDate,
          timeslot?.day_of_week,
        );
        const matchDateTime = localDateTimeToISO(matchDate, timeslot?.start_time || '19:00');

        matchInserts.push(this.createMatchObject(
          `PO-${counter}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          `Playoff`,
          match.home,
          match.away,
          matchDateTime,
          venue,
          true,
          match.round
        ));
        counter++;
      }

      const insertResult = await bulkInsertMatchesForSession(matchInserts);
      if (!insertResult.success) {
        console.error('Fout bij opslaan playoff wedstrijden:', insertResult.error);
        return { success: false, message: `Fout bij opslaan: ${insertResult.error || 'onbekend'}` };
      }

      return { success: true, message: `${matchInserts.length} playoff wedstrijden succesvol aangemaakt.` };
    } catch (e) {
      console.error('Fout bij genereren playoffs:', e);
      return { success: false, message: e instanceof Error ? e.message : 'Onbekende fout' };
    }
  }
};