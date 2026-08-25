import { supabase } from "@/integrations/supabase/client";
import { seasonService } from "@/services/seasonService";
import { priorityOrderService } from "@/services/priorityOrderService";
import { teamService } from "@/services/core/teamService";
import { normalizeTeamsPreferences, scoreTeamForDetails, TeamPreferencesNormalized } from "@/services/core/teamPreferencesService";
import { localDateTimeToISO } from "@/lib/dateUtils";
import { normalizeVenueName } from "@/lib/utils";
import { getRpcSessionArgs } from "@/lib/authSession";
import {
  bulkInsertMatchesForSession,
  fetchMatchesForSession,
} from "@/services/core/matchesSessionBulk";
import {
  invokeSyncMatchCostsForMatch,
  shouldSyncMatchCostsAfterMatchUpdate,
} from "@/services/financial/matchCostService";
import { fetchPublicMatches, isCupMatch } from "@/services/public/publicScheduleFetch";
import {
  earlyWeekSlotBonus,
  getCupBracketPlan,
  matchDateFromWeekMonday,
  nextSlotAfterVoorronde,
  weekIndexForRoundMatch,
  type CupRoundSpec,
} from "@/lib/cupBracketPlan";
import {
  buildNextRoundPrefill,
  pinForcedVoorrondeOrder,
  seedCupTeamOrder,
  type CupTeamRankMap,
} from "@/lib/cupTeamSeeding";
import { pickPriorityCandidateSlots, slotPriorityScoreBonus } from "@/lib/slotPriorityPacking";
import { scopeSlotsByCupDayPreference } from "@/lib/competitionPreferredDayScope";
import {
  pickSpacedPlayDayPair,
  getConfiguredPlayDays,
  toMondayIso,
  orderCupDayPreference,
  cupDayPreferenceBonus,
} from "@/lib/competitionPlanningEstimate";
import { requireOrganizationId } from "@/lib/organizationScope";

export interface CupMatch {
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
  tournament_round: string;
  tournament_position: string | null;
  next_match_id: number | null;
  is_submitted: boolean;
  is_locked: boolean;
  referee?: string;
  referee_notes?: string;
}

export interface TournamentBracket {
  voorronde: any[];
  achtste_finales: any[];
  kwartfinales: any[];
  halve_finales: any[];
  finale: any;
}

export const bekerService = {
  addDaysToDate(dateStr: string, days: number): string {
    // Parse date in YYYY-MM-DD format and add days
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // Create in local timezone
    date.setDate(date.getDate() + days);
    
    // Return in YYYY-MM-DD format
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    return `${newYear}-${newMonth}-${newDay}`;
  },

  

  // Allow manual assignment (byes) when odd number of teams: admin can prefill next-round slots
  async assignTeamToMatch(uniqueNumber: string, asHome: boolean, teamId: number): Promise<{ success: boolean; message: string }> {
    try {
      const rows = await fetchMatchesForSession({ unique_number: uniqueNumber, is_cup_match: true });
      const match = rows[0];

      if (!match) {
        return { success: false, message: 'Wedstrijd niet gevonden.' };
      }

      const updateData: Record<string, unknown> = asHome
        ? { home_team_id: teamId }
        : { away_team_id: teamId };

      const { data: rpcData, error: updateError } = await supabase.rpc('update_match_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: match.match_id as number,
        p_update_data: updateData as any,
      });

      if (updateError) throw updateError;
      const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcResult?.success) throw new Error(rpcResult?.message || 'Update mislukt');

      return { success: true, message: 'Team succesvol toegewezen aan wedstrijd.' };
    } catch (error) {
      return { success: false, message: `Fout bij toewijzen team: ${error instanceof Error ? error.message : 'Onbekende fout'}` };
    }
  },

  // Ensure QFs are fully populated once all 1/8 fixtures have teams; remove stray pre-assigned bye teams
  async reconcileQuarterFinals(): Promise<{ success: boolean; message: string }> {
    try {
      const cupMatches = await fetchMatchesForSession({ is_cup_match: true });
      const eight = cupMatches.filter((m) => String(m.unique_number).startsWith('1/8-'));
      const participants = new Set<number>();
      let complete = true;
      eight.forEach(m => {
        if (m.home_team_id == null || m.away_team_id == null) complete = false;
        if (m.home_team_id != null) participants.add(m.home_team_id as number);
        if (m.away_team_id != null) participants.add(m.away_team_id as number);
      });
      if (!complete) return { success: true, message: 'Nog niet alle 1/8 finales gevuld' };

      const qfs = cupMatches.filter((m) => String(m.unique_number).startsWith('QF-'));

      for (const qf of qfs) {
        const payload: Record<string, unknown> = {};
        if (qf.home_team_id != null && !participants.has(qf.home_team_id as number)) payload.home_team_id = null;
        if (qf.away_team_id != null && !participants.has(qf.away_team_id as number)) payload.away_team_id = null;
        if (Object.keys(payload).length > 0) {
          await supabase.rpc('update_match_for_session', {
            ...getRpcSessionArgs(),
            p_match_id: qf.match_id as number,
            p_update_data: payload as any,
          });
        }
      }
      return { success: true, message: 'Kwartfinales gereconcilieerd' };
    } catch (e) {
      return { success: false, message: 'Reconciliatie mislukt' };
    }
  },

  // Helper functions for validation
  validateCupTournamentInput(
    teams: number[],
    selectedDates: string[],
    slotsPerWeek: number = 7,
  ): { isValid: boolean; message?: string; requiredWeeks?: number } {
    if (teams.length < 2) {
      return { isValid: false, message: "Selecteer minstens 2 teams" };
    }

    const plan = getCupBracketPlan(teams.length, slotsPerWeek);
    if (selectedDates.length !== plan.requiredWeeks) {
      const roundSummary = plan.rounds
        .map((r) =>
          r.byeCount > 0
            ? `${r.name} (${r.matchCount} wedstrijden, ${r.byeCount} bye)`
            : `${r.name} (${r.matchCount})`,
        )
        .join(" → ");
      return {
        isValid: false,
        message: `Selecteer exact ${plan.requiredWeeks} speelweken voor ${teams.length} team(s): ${roundSummary}`,
        requiredWeeks: plan.requiredWeeks,
      };
    }

    return { isValid: true, requiredWeeks: plan.requiredWeeks };
  },

  async checkExistingCupTournament(): Promise<{ exists: boolean; message?: string }> {
    const existingMatches = await fetchMatchesForSession({ is_cup_match: true });

    if (existingMatches.length > 0) {
      return { exists: true, message: "Er bestaat al een bekertoernooi. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten." };
    }

    return { exists: false };
  },

  async validateSeasonData(organizationId?: number): Promise<{ isValid: boolean; message?: string; data?: any }> {
    const orgId = requireOrganizationId(organizationId);
    const seasonData = await seasonService.getSeasonData(orgId);

    const venues = seasonData.venues || [];
    const timeslots = seasonData.venue_timeslots || [];
    const vacations = seasonData.vacation_periods || [];
    const { normalizeSeasonSetup } = await import("@/lib/seasonSetup");
    const playableVacationWeeks =
      normalizeSeasonSetup(seasonData.season_setup).playableVacationWeeks ?? [];

    if (venues.length === 0) {
      return { isValid: false, message: "Geen venues beschikbaar in de database. Configureer eerst de competitiedata." };
    }

    if (timeslots.length === 0) {
      return { isValid: false, message: "Geen tijdslots beschikbaar in de database. Configureer eerst de competitiedata." };
    }

    return {
      isValid: true,
      data: { venues, timeslots, vacations, playableVacationWeeks, organizationId: orgId },
    };
  },

  validateVacationConflicts(
    selectedDates: string[],
    vacations: any[],
    playableVacationWeeks: string[] = [],
  ): { isValid: boolean; message?: string } {
    const exceptions = new Set(
      playableVacationWeeks.map((d) => toMondayIso(String(d).split("T")[0])),
    );
    for (const dateStr of selectedDates) {
      const selectedIso = dateStr.split("T")[0];
      const selectedDate = new Date(`${selectedIso}T12:00:00`);
      const vacation = vacations.find((v: any) => {
        if (!v.is_active) return false;
        const vacStart = new Date(`${String(v.start_date).split("T")[0]}T12:00:00`);
        const vacEnd = new Date(`${String(v.end_date).split("T")[0]}T12:00:00`);
        return selectedDate >= vacStart && selectedDate <= vacEnd;
      });

      if (vacation) {
        if (exceptions.has(toMondayIso(selectedIso))) {
          continue;
        }
        return {
          isValid: false,
          message: `Geselecteerde datum ${selectedDate.toLocaleDateString("nl-BE")} valt in vakantieperiode: ${vacation?.name}`,
        };
      }
    }

    return { isValid: true };
  },

  /** Speelweken als lokale maandagen (YYYY-MM-DD) — timezone-veilig. */
  convertToPlayingWeeks(selectedDates: string[]): string[] {
    return selectedDates.map((dateStr) => toMondayIso(dateStr));
  },

  createMatchObject(
    uniqueNumber: string, 
    speeldag: string, 
    homeTeamId: number | null, 
    awayTeamId: number | null, 
    dateStr: string,
    timeStr: string,
    venue: string
  ) {
    // Store as UTC ISO while preserving the intended local clock time
    const matchDateTime = localDateTimeToISO(dateStr, timeStr);
    
    return {
      unique_number: uniqueNumber,
      speeldag,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDateTime,
      location: normalizeVenueName(venue),
      is_cup_match: true,
      is_submitted: false,
      is_locked: false
    };
  },

  cupUniqueNumber(prefix: string, matchIndex1Based: number): string {
    if (prefix === "FINAL") return "FINAL";
    return `${prefix}-${matchIndex1Based}`;
  },

  cupSpeeldagLabel(prefix: string, matchIndex1Based: number): string {
    switch (prefix) {
      case "VR":
        return `Voorronde ${matchIndex1Based}`;
      case "1/16":
        return `1/16 Finale ${matchIndex1Based}`;
      case "1/8":
        return `1/8 Finale ${matchIndex1Based}`;
      case "QF":
        return `Kwartfinale ${matchIndex1Based}`;
      case "SF":
        return `Halve Finale ${matchIndex1Based}`;
      case "FINAL":
        return "Finale";
      default:
        return `${prefix} ${matchIndex1Based}`;
    }
  },

  async createEightFinals(shuffledTeams: number[], playingWeeks: string[], opts?: { teamPreferences?: Map<number, TeamPreferencesNormalized>; venues?: any[]; slotsPerWeek?: number; earlyDay?: number; organizationId?: number }): Promise<any[]> {
    // Legacy: openingsronde met bekende teams (prefix 1/8 tenzij caller createPopulatedCupRound gebruikt).
    const slotsPerWeek = Math.max(1, opts?.slotsPerWeek ?? 7);
    const matchCount = Math.floor(shuffledTeams.length / 2);
    const weeksNeeded = Math.max(1, Math.ceil(matchCount / slotsPerWeek));
    const round: CupRoundSpec = {
      kind: "r16",
      name: "Achtste Finales",
      prefix: "1/8",
      teamsEntering: shuffledTeams.length,
      matchCount,
      byeCount: 0,
      teamsExiting: matchCount,
      weeksNeeded,
      weekOffset: 0,
    };
    return this.createPopulatedCupRound(shuffledTeams, round, playingWeeks, opts);
  },

  async createPopulatedCupRound(
    orderedTeams: number[],
    round: CupRoundSpec,
    playingWeeks: string[],
    opts?: {
      teamPreferences?: Map<number, TeamPreferencesNormalized>;
      venues?: any[];
      slotsPerWeek?: number;
      earlyDay?: number;
      preferredCupDays?: number[];
      organizationId?: number;
    },
  ): Promise<any[]> {
    const cupMatches = [];
    const numberOfPairs = Math.min(round.matchCount, Math.floor(orderedTeams.length / 2));
    const slotsPerWeek = Math.max(1, opts?.slotsPerWeek ?? 7);
    const earlyDay = opts?.earlyDay ?? 1;
    const preferredCupDays = opts?.preferredCupDays;

    const { loadSlotPlanningContext } = await import("@/services/match/slotPlanningContext");
    const slotCtx = await loadSlotPlanningContext(opts?.organizationId);
    const totalAvailableSlots = slotCtx.totalSlots;
    const slotDetails = slotCtx.slotDetails;

    for (let i = 0; i < numberOfPairs; i++) {
      const homeTeamIndex = i * 2;
      const awayTeamIndex = i * 2 + 1;
      const weekIndex = weekIndexForRoundMatch(round, i, slotsPerWeek);
      const cycleIndex = i % totalAvailableSlots;

      let bestSlot = cycleIndex;
      let bestScore = -1;

      for (let offset = 0; offset < totalAvailableSlots; offset++) {
        const slotIndex = (cycleIndex + offset) % totalAvailableSlots;
        const { venue, timeslot } = slotDetails[slotIndex];
        let combined = 0;

        if (opts?.teamPreferences && opts?.venues) {
          const homeId = orderedTeams[homeTeamIndex];
          const awayId = orderedTeams[awayTeamIndex];
          const h = scoreTeamForDetails(opts.teamPreferences.get(homeId), timeslot, venue, opts.venues);
          const a = scoreTeamForDetails(opts.teamPreferences.get(awayId), timeslot, venue, opts.venues);
          combined = h.score + a.score;
        }
        combined += preferredCupDays?.length
          ? cupDayPreferenceBonus(timeslot?.day_of_week, preferredCupDays)
          : earlyWeekSlotBonus(timeslot?.day_of_week, earlyDay);

        if (combined > bestScore) {
          bestScore = combined;
          bestSlot = slotIndex;
        }
      }

      const { venue, timeslot } = slotDetails[bestSlot];
      const baseDate = playingWeeks[weekIndex];
      const matchDate = matchDateFromWeekMonday(baseDate, timeslot?.day_of_week);
      const matchTime = timeslot?.start_time || "19:00";

      cupMatches.push(
        bekerService.createMatchObject(
          bekerService.cupUniqueNumber(round.prefix, i + 1),
          bekerService.cupSpeeldagLabel(round.prefix, i + 1),
          orderedTeams[homeTeamIndex],
          orderedTeams[awayTeamIndex],
          matchDate,
          matchTime,
          venue,
        ),
      );
    }

    return cupMatches;
  },

  async createEmptyCupRound(
    round: CupRoundSpec,
    playingWeeks: string[],
    organizationId?: number,
    prefillSlots?: Array<number | null>,
  ): Promise<any[]> {
    const cupMatches = [];
    const { loadSlotPlanningContext } = await import("@/services/match/slotPlanningContext");
    const slotCtx = await loadSlotPlanningContext(organizationId);
    const slotDetails = slotCtx.slotDetails;
    const slots = prefillSlots ?? [];

    for (let i = 0; i < round.matchCount; i++) {
      const slotIndex = Math.min(i, Math.max(0, slotDetails.length - 1));
      const { venue, timeslot } = slotDetails[slotIndex] ?? { venue: "Onbekend", timeslot: null };
      const weekIndex = weekIndexForRoundMatch(round, i, Math.max(1, slotDetails.length || 7));
      const baseDate = playingWeeks[Math.min(weekIndex, playingWeeks.length - 1)];
      const matchDate = matchDateFromWeekMonday(baseDate, timeslot?.day_of_week);
      const matchTime = timeslot?.start_time || "19:00";
      const home = slots[i * 2] ?? null;
      const away = slots[i * 2 + 1] ?? null;

      cupMatches.push(
        bekerService.createMatchObject(
          bekerService.cupUniqueNumber(round.prefix, i + 1),
          bekerService.cupSpeeldagLabel(round.prefix, i + 1),
          home,
          away,
          matchDate,
          matchTime,
          venue,
        ),
      );
    }

    return cupMatches;
  },

  async createQuarterFinals(playingWeeks: string[], organizationId?: number): Promise<any[]> {
    const round: CupRoundSpec = {
      kind: "qf",
      name: "Kwart Finales",
      prefix: "QF",
      teamsEntering: 8,
      matchCount: 4,
      byeCount: 0,
      teamsExiting: 4,
      weeksNeeded: 1,
      weekOffset: Math.max(0, playingWeeks.length - 3),
    };
    return this.createEmptyCupRound(round, playingWeeks, organizationId);
  },

  async createSemiFinals(playingWeeks: string[], organizationId?: number): Promise<any[]> {
    const round: CupRoundSpec = {
      kind: "sf",
      name: "Halve Finales",
      prefix: "SF",
      teamsEntering: 4,
      matchCount: 2,
      byeCount: 0,
      teamsExiting: 2,
      weeksNeeded: 1,
      weekOffset: Math.max(0, playingWeeks.length - 2),
    };
    return this.createEmptyCupRound(round, playingWeeks, organizationId);
  },

  async createFinal(playingWeeks: string[], organizationId?: number): Promise<any[]> {
    const round: CupRoundSpec = {
      kind: "final",
      name: "Finale",
      prefix: "FINAL",
      teamsEntering: 2,
      matchCount: 1,
      byeCount: 0,
      teamsExiting: 1,
      weeksNeeded: 1,
      weekOffset: Math.max(0, playingWeeks.length - 1),
    };
    return this.createEmptyCupRound(round, playingWeeks, organizationId);
  },

  /**
   * Preview cup tournament plan without DB writes.
   * Returns detailed planned matches including preference scores for 1/8 finales.
   */
  async previewCupTournament(
    teams: number[],
    selectedDates: string[],
    attempts?: number,
    byeTeamId?: number | null,
    organizationId?: number,
    options?: { teamRank?: CupTeamRankMap; forcedPlayingTeamIds?: number[] },
  ): Promise<{
    success: boolean;
    message: string;
    plan: Array<{ unique_number: string; speeldag: string; home_team_id: number | null; away_team_id: number | null; match_date: string; match_time: string; venue: string; slot_index: number; details: { homeScore?: number; awayScore?: number; combined?: number; maxCombined: number; priority?: number; day_of_week?: number } }>,
    totalCombined?: number
  }> {
    // Validate input — slots from season data when available
    const seasonValidationEarly = await bekerService.validateSeasonData(organizationId);
    if (teams.length < 2) {
      return { success: false, message: "Selecteer minstens 2 teams", plan: [] };
    }
    if (selectedDates.length < 3) {
      return {
        success: false,
        message: "Selecteer minstens 3 speelweken (kwart/halve/finale)",
        plan: [],
      };
    }

    try {
      // Load and validate season data
      const seasonValidation = seasonValidationEarly;
      if (!seasonValidation.isValid) {
        return { success: false, message: seasonValidation.message!, plan: [] };
      }

      const { venues, vacations, timeslots, playableVacationWeeks } = seasonValidation.data!;
      const playDays = getConfiguredPlayDays(timeslots || []);
      const daySep = pickSpacedPlayDayPair(playDays);
      const preferredCupDays = orderCupDayPreference(daySep.early, daySep.late, playDays);

      // Validate vacation conflicts
      const vacationValidation = bekerService.validateVacationConflicts(
        selectedDates,
        vacations,
        playableVacationWeeks ?? [],
      );
      if (!vacationValidation.isValid) {
        return { success: false, message: vacationValidation.message!, plan: [] };
      }

      // Convert selected dates to playing weeks (Mondays)
      const playingWeeks = bekerService.convertToPlayingWeeks(selectedDates);

      // Team preferences (only useful for 1/8 finales)
      const allTeamsData = await teamService.getAllTeams();
      const selectedTeamsSet = new Set(teams);
      const teamPreferences = normalizeTeamsPreferences(allTeamsData.filter(t => selectedTeamsSet.has(t.team_id)));

      const { loadSlotPlanningContext } = await import("@/services/match/slotPlanningContext");
      const slotCtx = await loadSlotPlanningContext(organizationId);

      // Occupancy-aware grids: competitie/playoff bezetten slots (niet alleen config-blocks)
      const existingMatches = await fetchMatchesForSession({}).catch(() => []);
      const { buildSeasonSlotGrids, resolveEffectiveSlotsPerWeek } = await import("@/lib/seasonCalendar");
      const occupancyGrids = buildSeasonSlotGrids({
        weekMondays: playingWeeks,
        slotDetails: slotCtx.slotDetails,
        blocks: slotCtx.blocks,
        vacations: slotCtx.vacations,
        matches: existingMatches.map((m) => ({
          match_date: m.match_date as string | undefined,
          location: m.location as string | undefined,
          match_time: m.match_time as string | undefined,
          is_cup_match: Boolean(m.is_cup_match),
          is_playoff_match: Boolean(m.is_playoff_match),
        })),
      });

      const nominalSlots = Math.max(1, timeslots?.length || slotCtx.totalSlots || 7);
      const effectiveSlots = resolveEffectiveSlotsPerWeek(occupancyGrids, nominalSlots);
      const planCheck = getCupBracketPlan(teams.length, Math.max(1, effectiveSlots || 1));
      if (selectedDates.length !== planCheck.requiredWeeks) {
        return {
          success: false,
          message: `Selecteer exact ${planCheck.requiredWeeks} speelweken voor ${teams.length} team(s) (effectieve capaciteit ~${effectiveSlots || 1}/week)`,
          plan: [],
        };
      }

      const getFreeSlotIndices = (weekMonday: string): number[] => {
        const grid = occupancyGrids.get(weekMonday);
        if (!grid) return slotCtx.getAvailableSlotIndices(weekMonday);
        return grid.slots.filter((s) => s.status === "available").map((s) => s.index);
      };
      const getBlockedIncludingOccupancy = (weekMonday: string): Set<number> => {
        const grid = occupancyGrids.get(weekMonday);
        if (!grid) return slotCtx.getBlockedSlotIndices(weekMonday);
        return new Set(
          grid.slots.filter((s) => s.status !== "available").map((s) => s.index),
        );
      };

      // Helper to build a plan for a given shuffled order and compute total combined score
      const bracketPlan = planCheck;
      const buildPlanForOrder = async (fullOrder: number[]) => {
        const plan: Array<{ unique_number: string; speeldag: string; home_team_id: number | null; away_team_id: number | null; match_date: string; match_time: string; venue: string; slot_index: number; details: { homeScore?: number; awayScore?: number; combined?: number; maxCombined: number; priority?: number; day_of_week?: number } }> = [];
        let totalCombined = 0;
        let failureReason: string | null = null;

        const firstRound = bracketPlan.rounds[0];
        if (!firstRound) {
          return { plan: [], totalCombined: -1, failureReason: "Geen geldig bracket." };
        }

        const byeTeams = fullOrder.slice(0, firstRound.byeCount);
        const order = fullOrder.slice(firstRound.byeCount);
        const numberOfPairs = firstRound.matchCount;
        const totalAvailableSlots = slotCtx.totalSlots;
        const slotDetails = slotCtx.slotDetails;
        if (!slotDetails.length) {
          return {
            plan: [],
            totalCombined: -1,
            failureReason: "Geen tijdslots geconfigureerd voor deze organisatie.",
          };
        }

        const weekToIndices = new Map<number, number[]>();
        for (let i = 0; i < numberOfPairs; i++) {
          const weekIndex = weekIndexForRoundMatch(
            firstRound,
            i,
            Math.max(1, effectiveSlots || totalAvailableSlots),
          );
          const arr = weekToIndices.get(weekIndex) || [];
          arr.push(i);
          weekToIndices.set(weekIndex, arr);
        }

        const combinations = (arr: number[], k: number): number[][] => {
          const res: number[][] = [];
          const backtrack = (start: number, path: number[]) => {
            if (path.length === k) { res.push([...path]); return; }
            for (let i = start; i < arr.length; i++) {
              path.push(arr[i]);
              backtrack(i + 1, path);
              path.pop();
            }
          };
          backtrack(0, []);
          return res;
        };
        const permutations = (arr: number[]): number[][] => {
          const res: number[][] = [];
          const used = new Array(arr.length).fill(false);
          const path: number[] = [];
          const backtrack = () => {
            if (path.length === arr.length) { res.push([...path]); return; }
            for (let i = 0; i < arr.length; i++) {
              if (used[i]) continue;
              used[i] = true; path.push(arr[i]);
              backtrack();
              path.pop(); used[i] = false;
            }
          };
          backtrack();
          return res;
        };

        for (const [weekIndex, matchIndices] of weekToIndices.entries()) {
          const m = matchIndices.length;
          const weekMonday = playingWeeks[weekIndex];
          if (!weekMonday) {
            failureReason = `Ontbrekende speelweek voor index ${weekIndex}. Selecteer opnieuw ${playingWeeks.length} geldige data.`;
            return { plan: [], totalCombined: -1, failureReason };
          }
          const blocked = getBlockedIncludingOccupancy(weekMonday);
          const availableSlots = getFreeSlotIndices(weekMonday);
          if (m > availableSlots.length) {
            const mondayLabel = new Date(`${weekMonday}T12:00:00`).toLocaleDateString("nl-BE");
            const grid = occupancyGrids.get(weekMonday);
            const occ =
              grid
                ? ` (config ${grid.blockedConfig}, competitie ${grid.occupiedCompetition}, beker ${grid.occupiedCup}, playoff ${grid.occupiedPlayoff})`
                : blocked.size > 0
                  ? ` (${blocked.size} geblokkeerd)`
                  : "";
            failureReason =
              `Te weinig vrije slots in speelweek van ${mondayLabel}: ` +
              `${m} wedstrijd${m === 1 ? "" : "en"} nodig, ${availableSlots.length} beschikbaar` +
              `${occ}.`;
            return { plan: [], totalCombined: -1, failureReason };
          }
          const scoreMatrix: Array<Array<{ combined: number; h: number; a: number }>> = [];
          for (let r = 0; r < m; r++) {
            const i = matchIndices[r];
            const homeId = order[i * 2];
            const awayId = order[i * 2 + 1];
            const row: Array<{ combined: number; h: number; a: number }> = [];
            for (let c = 0; c < totalAvailableSlots; c++) {
              if (blocked.has(c)) {
                row.push({ combined: -1, h: 0, a: 0 });
                continue;
              }
              const { venue, timeslot } = slotDetails[c];
              let hScore = 0, aScore = 0, combined = 0;
              if (teamPreferences && venues) {
                const h = scoreTeamForDetails(teamPreferences.get(homeId), timeslot, venue, venues);
                const a = scoreTeamForDetails(teamPreferences.get(awayId), timeslot, venue, venues);
                hScore = h.score as number; aScore = a.score as number; combined = hScore + aScore;
              }
              combined += cupDayPreferenceBonus(timeslot?.day_of_week, preferredCupDays);
              combined += slotPriorityScoreBonus(c, totalAvailableSlots);
              row.push({ combined, h: hScore, a: aScore });
            }
            scoreMatrix.push(row);
          }

          // Bekerdag eerst volledig vullen; pas uitwijken als die dag te klein is.
          const cupDayScoped = scopeSlotsByCupDayPreference(
            availableSlots,
            m,
            (s) => slotDetails[s]?.timeslot?.day_of_week,
            preferredCupDays,
          );
          const allSlots = pickPriorityCandidateSlots(
            cupDayScoped,
            m,
            (c) => !blocked.has(c),
          );
          let assignment: Array<{ matchIdx: number; slot: number; h: number; a: number; combined: number }> = [];
          let bestSum = -1;
          if (m <= allSlots.length && m <= 8) {
            const slotCombos = combinations(allSlots, m);
            for (const slots of slotCombos) {
              const perms = permutations(slots);
              for (const perm of perms) {
                let sum = 0;
                const chosen: Array<{ matchIdx: number; slot: number; h: number; a: number; combined: number }> = [];
                for (let r = 0; r < m; r++) {
                  const slot = perm[r];
                  const s = scoreMatrix[r][slot];
                  sum += s.combined;
                  chosen.push({ matchIdx: matchIndices[r], slot, h: s.h, a: s.a, combined: s.combined });
                }
                if (sum > bestSum) { bestSum = sum; assignment = chosen; }
              }
            }
          } else {
            const used = new Set<number>();
            for (let r = 0; r < m; r++) {
              let bestSlot = -1; let best = -1; let bestH = 0; let bestA = 0;
              for (const c of allSlots) {
                if (used.has(c)) continue;
                const s = scoreMatrix[r][c];
                if (s.combined > best) { best = s.combined; bestSlot = c; bestH = s.h; bestA = s.a; }
              }
              if (bestSlot === -1) {
                bestSlot = allSlots[0] ?? 0;
                const s = scoreMatrix[r][bestSlot];
                best = s.combined; bestH = s.h; bestA = s.a;
              }
              used.add(bestSlot);
              assignment.push({ matchIdx: matchIndices[r], slot: bestSlot, h: bestH, a: bestA, combined: best });
              bestSum += best;
            }
          }

          for (const asn of assignment) {
            const i = asn.matchIdx;
            const { venue, timeslot } = slotDetails[asn.slot];
            const baseDate = playingWeeks[weekIndex];
            const matchDate = matchDateFromWeekMonday(baseDate, timeslot?.day_of_week);
            const matchTime = timeslot?.start_time || "19:00";
            totalCombined += asn.combined;
            plan.push({
              unique_number: bekerService.cupUniqueNumber(firstRound.prefix, i + 1),
              speeldag: bekerService.cupSpeeldagLabel(firstRound.prefix, i + 1),
              home_team_id: order[i * 2],
              away_team_id: order[i * 2 + 1],
              match_date: matchDate,
              match_time: matchTime,
              venue,
              slot_index: asn.slot,
              details: {
                homeScore: asn.h,
                awayScore: asn.a,
                combined: asn.combined,
                maxCombined: 6,
                priority: timeslot?.priority,
                day_of_week: timeslot?.day_of_week,
              },
            });
          }
        }

        // Track slots claimed by openingsronde so latere rondes niet botsen
        const usedSlotsByWeek = new Map<number, Set<number>>();
        for (const p of plan) {
          if (typeof p.slot_index !== "number") continue;
          const monday = toMondayIso(p.match_date);
          const wi = playingWeeks.findIndex((w) => toMondayIso(w) === monday);
          if (wi < 0) continue;
          const set = usedSlotsByWeek.get(wi) ?? new Set<number>();
          set.add(p.slot_index);
          usedSlotsByWeek.set(wi, set);
        }

        const nextMatchCount =
          bracketPlan.rounds[1]?.matchCount ?? Math.floor(firstRound.teamsExiting / 2);
        const prefill =
          firstRound.byeCount > 0
            ? buildNextRoundPrefill(byeTeams, nextMatchCount)
            : [];

        // Latere rondes: unieke slots; ma → di → …; vermijd dag vóór competitie (do als vr)
        for (let ri = 1; ri < bracketPlan.rounds.length; ri++) {
          const round = bracketPlan.rounds[ri];
          for (let i = 0; i < round.matchCount; i++) {
            const weekIndex = weekIndexForRoundMatch(
              round,
              i,
              Math.max(1, effectiveSlots || totalAvailableSlots),
            );
            const weekMonday = playingWeeks[Math.min(weekIndex, playingWeeks.length - 1)];
            const used = usedSlotsByWeek.get(weekIndex) ?? new Set<number>();
            usedSlotsByWeek.set(weekIndex, used);

            const free = getFreeSlotIndices(weekMonday).filter((s) => !used.has(s));
            const slotIndex =
              scopeSlotsByCupDayPreference(
                free,
                1,
                (s) => slotDetails[s]?.timeslot?.day_of_week,
                preferredCupDays,
              )[0] ?? Math.min(i, Math.max(0, slotDetails.length - 1));
            used.add(slotIndex);

            const { venue, timeslot } = slotDetails[slotIndex] ?? {
              venue: "Onbekend",
              timeslot: null as any,
            };
            const matchDate = matchDateFromWeekMonday(weekMonday, timeslot?.day_of_week);
            const matchTime = timeslot?.start_time || "19:00";
            const home =
              ri === 1 && firstRound.byeCount > 0 ? prefill[i * 2] ?? null : null;
            const away =
              ri === 1 && firstRound.byeCount > 0 ? prefill[i * 2 + 1] ?? null : null;
            plan.push({
              unique_number: bekerService.cupUniqueNumber(round.prefix, i + 1),
              speeldag: bekerService.cupSpeeldagLabel(round.prefix, i + 1),
              home_team_id: home,
              away_team_id: away,
              match_date: matchDate,
              match_time: matchTime,
              venue,
              slot_index: slotIndex,
              details: {
                maxCombined: 6,
                priority: timeslot?.priority,
                day_of_week: timeslot?.day_of_week,
              },
            });
          }
        }

        return { plan, totalCombined, failureReason } as const;
      };

      // Try multiple seeded attempts; keep the plan with highest total combined score
      const tries = Math.max(1, attempts ?? 12);
      let bestPlan: Array<{ unique_number: string; speeldag: string; home_team_id: number | null; away_team_id: number | null; match_date: string; match_time: string; venue: string; slot_index: number; details: { homeScore?: number; awayScore?: number; combined?: number; maxCombined: number; priority?: number; day_of_week?: number } }> | null = null;
      let bestScore = -1;
      let lastFailure: string | null = null;
      const firstByeCount = bracketPlan.rounds[0]?.byeCount ?? 0;
      const teamRank = options?.teamRank ?? {};
      const forcedPlayingTeamIds = (options?.forcedPlayingTeamIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && teams.includes(id));
      for (let t = 0; t < tries; t++) {
        const shuffled = pinForcedVoorrondeOrder(
          seedCupTeamOrder({
            teams,
            teamRank,
            byeCount: firstByeCount,
            forcedByeTeamId:
              byeTeamId != null && !forcedPlayingTeamIds.includes(byeTeamId)
                ? byeTeamId
                : null,
            forcedPlayingTeamIds,
          }),
          firstByeCount,
          forcedPlayingTeamIds,
        );
        const { plan: p, totalCombined, failureReason } = await buildPlanForOrder(shuffled);
        if (failureReason) lastFailure = failureReason;
        if (!p.length) continue;
        if (totalCombined > bestScore) {
          bestScore = totalCombined;
          bestPlan = p;
        }
      }

      if (!bestPlan || bestPlan.length === 0) {
        return {
          success: false,
          message:
            lastFailure ||
            "Geen geldig bekerschema gegenereerd. Controleer speeldata, tijdslots en slotblokkades.",
          plan: [],
        };
      }

      return {
        success: true,
        message: "Preview gegenereerd",
        plan: bestPlan,
        totalCombined: bestScore >= 0 ? bestScore : undefined,
      };
    } catch (error) {
      console.error('Error previewing cup tournament:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Fout bij genereren preview",
        plan: [],
      };
    }
  },

  /**
   * Confirm/import a prepared plan into the database (idempotent simple insert).
   */
  async createCupFromPlan(plan: Array<{ unique_number: string; speeldag: string; home_team_id: number | null; away_team_id: number | null; match_date: string; match_time: string; venue: string }>): Promise<{ success: boolean; message: string }> {
    try {
      const existingCup = await fetchMatchesForSession({ is_cup_match: true });
      if (existingCup.length > 0) {
        return {
          success: false,
          message:
            "Er bestaat al een bekertoernooi. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
        };
      }

      const cupMatches = plan.map(p => bekerService.createMatchObject(
        p.unique_number,
        p.speeldag,
        p.home_team_id,
        p.away_team_id,
        p.match_date,
        p.match_time,
        p.venue
      ));

      const insertResult = await bulkInsertMatchesForSession(cupMatches);
      if (!insertResult.success) throw new Error(insertResult.error || 'Import mislukt');
      return { success: true, message: 'Beker schema geïmporteerd' };
    } catch (error) {
      console.error('Error importing cup plan:', error);
      return { success: false, message: 'Fout bij importeren schema' };
    }
  },

  async createCupTournament(
    teams: number[],
    selectedDates: string[],
    byeTeamId?: number | null,
    organizationId?: number,
    options?: { teamRank?: CupTeamRankMap; forcedPlayingTeamIds?: number[] },
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🏆 Starting cup tournament creation...');

      // Check if cup matches already exist
      const existingCheck = await bekerService.checkExistingCupTournament();
      if (existingCheck.exists) {
        return { success: false, message: existingCheck.message! };
      }

      // Load and validate season data
      console.log('📋 Loading competition data from database...');
      const seasonValidation = await bekerService.validateSeasonData(organizationId);
      if (!seasonValidation.isValid) {
        return { success: false, message: seasonValidation.message! };
      }

      const { venues, timeslots, vacations, playableVacationWeeks } = seasonValidation.data!;
      const slotsPerWeek = Math.max(1, timeslots?.length || 7);
      const playDays = getConfiguredPlayDays(timeslots || []);
      const daySep = pickSpacedPlayDayPair(playDays);
      const earlyDay = daySep.early;
      const preferredCupDays = orderCupDayPreference(daySep.early, daySep.late, playDays);

      const inputValidation = bekerService.validateCupTournamentInput(teams, selectedDates, slotsPerWeek);
      if (!inputValidation.isValid) {
        return { success: false, message: inputValidation.message! };
      }

      console.log('🏟️ Available venues:', venues.length);
      console.log('⏰ Available timeslots:', timeslots.length);
      console.log('🏖️ Vacation periods:', vacations.length);

      // Validate vacation conflicts
      const vacationValidation = bekerService.validateVacationConflicts(
        selectedDates,
        vacations,
        playableVacationWeeks ?? [],
      );
      if (!vacationValidation.isValid) {
        return { success: false, message: vacationValidation.message! };
      }

      // Seed: voorronde bij voorkeur lagere reeks; byes (reeks 1) vooraan
      const plan = getCupBracketPlan(teams.length, slotsPerWeek);
      const firstRound = plan.rounds[0];
      if (!firstRound) {
        return { success: false, message: "Geen geldig bekerbracket voor dit aantal teams." };
      }

      const forcedPlayingTeamIds = (options?.forcedPlayingTeamIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && teams.includes(id));
      const shuffledTeams = pinForcedVoorrondeOrder(
        seedCupTeamOrder({
          teams,
          teamRank: options?.teamRank ?? {},
          byeCount: firstRound.byeCount,
          forcedByeTeamId:
            byeTeamId != null && !forcedPlayingTeamIds.includes(byeTeamId)
              ? byeTeamId
              : null,
          forcedPlayingTeamIds,
        }),
        firstRound.byeCount,
        forcedPlayingTeamIds,
      );

      // Convert selected dates to playing weeks (Mondays)
      const playingWeeks = bekerService.convertToPlayingWeeks(selectedDates);
      console.log('📅 Original dates:', selectedDates);
      console.log('📅 Converted to playing weeks (Mondays):', playingWeeks);

      // Get prioritized timeslots for optimal match scheduling
      console.log('🎯 Getting prioritized timeslots for optimal scheduling...');
      const prioritizedTimeslots = await priorityOrderService.getPrioritizedTimeslots();
      console.log('🎯 Available prioritized timeslots:', prioritizedTimeslots.length);
      console.log('🎯 Timeslots details:', prioritizedTimeslots.map(t => `${t.priority}. ${t.venue_name} - ${t.start_time}`));

      // Show the priority order for information
      await priorityOrderService.showPriorityOrder();

      // Teamvoorkeuren inladen voor de openingsronde (enige ronde met alle teams bekend)
      const allTeamsData = await teamService.getAllTeams();
      const selectedTeamsSet = new Set(teams);
      const teamPreferences = normalizeTeamsPreferences(allTeamsData.filter(t => selectedTeamsSet.has(t.team_id)));

      const cupMatches: any[] = [];

      const byeTeams = shuffledTeams.slice(0, firstRound.byeCount);
      const playingTeams = shuffledTeams.slice(firstRound.byeCount);

      console.log(
        `🏆 Openingsronde ${firstRound.name}: ${firstRound.matchCount} wedstrijden` +
          (firstRound.byeCount ? `, ${firstRound.byeCount} bye(s)` : ""),
      );
      const opening = await bekerService.createPopulatedCupRound(
        playingTeams,
        firstRound,
        playingWeeks,
        {
          teamPreferences,
          venues,
          slotsPerWeek,
          earlyDay,
          preferredCupDays,
          organizationId,
        },
      );
      cupMatches.push(...opening);

      // Latere rondes: byes gespreid over de bracket
      const nextMatchCount =
        plan.rounds[1]?.matchCount ?? Math.floor(firstRound.teamsExiting / 2);
      const prefill =
        firstRound.byeCount > 0
          ? buildNextRoundPrefill(byeTeams, nextMatchCount)
          : [];

      for (let ri = 1; ri < plan.rounds.length; ri++) {
        const round = plan.rounds[ri];
        const slotsForRound =
          ri === 1 && firstRound.byeCount > 0
            ? prefill.slice(0, round.matchCount * 2)
            : undefined;
        console.log(`🏆 Ronde ${round.name}: ${round.matchCount} wedstrijd(en)`);
        const rows = await bekerService.createEmptyCupRound(
          round,
          playingWeeks,
          organizationId,
          slotsForRound,
        );
        cupMatches.push(...rows);
      }

      const insertResult = await bulkInsertMatchesForSession(cupMatches);
      if (!insertResult.success) throw new Error(insertResult.error || 'Insert mislukt');

      console.log('✅ Cup tournament created successfully with optimal timeslot distribution');
      const weeksUsed = selectedDates.length;
      const roundSummary = plan.rounds
        .map((r) =>
          r.byeCount > 0
            ? `${r.name} (${r.matchCount}w/${r.byeCount} bye)`
            : `${r.name} (${r.matchCount})`,
        )
        .join(" → ");
      return {
        success: true,
        message: `Bekertoernooi succesvol aangemaakt! Schema over ${weeksUsed} week(en): ${roundSummary}. Gebruikt ${venues.length} venue(s), ${timeslots.length} tijdslot(s) en ${vacations.length} vakantieperiode(s) uit de database.`,
      };

    } catch (error) {
      console.error('Error creating cup tournament:', error);
      return { 
        success: false, 
        message: `Fout bij aanmaken toernooi: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async getCupMatches(organizationId?: number): Promise<any> {
    const orgId = requireOrganizationId(organizationId);
    const [allMatches, teamMap] = await Promise.all([
      fetchPublicMatches(orgId),
      teamService.getPublicTeamMap(orgId),
    ]);

    const data = allMatches
      .filter(isCupMatch)
      .sort((a, b) => (a.unique_number ?? '').localeCompare(b.unique_number ?? ''));

    const resolveTeamName = (
      teamId: number | null | undefined,
      fromMatch: string | null | undefined,
    ): string => {
      if (fromMatch && fromMatch !== 'Te spelen') return fromMatch;
      if (teamId && teamMap.has(teamId)) return teamMap.get(teamId)!;
      return 'Te spelen';
    };

    // Transform data and group by round
    const matches = (data || []).map((match: any) => ({
      match_id: match.match_id,
      unique_number: match.unique_number,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      home_team_name: resolveTeamName(match.home_team_id, match.home_team_name),
      away_team_name: resolveTeamName(match.away_team_id, match.away_team_name),
      home_score: match.home_score,
      away_score: match.away_score,
      match_date: match.match_date,
      location: match.location,
      speeldag: match.speeldag,
      is_submitted: match.is_submitted,
      is_locked: match.is_locked,
      referee: match.referee,
    }));

    return bekerService.groupMatchesByRound(matches);
  },

  groupMatchesByRound(matches: any[]): TournamentBracket {
    const voorronde = matches.filter((m) => m.unique_number?.startsWith("VR-"));
    const achtste_finales = matches.filter((m) => m.unique_number?.startsWith("1/8-"));
    const kwartfinales = matches.filter((m) => m.unique_number?.startsWith("QF-"));
    const halve_finales = matches.filter((m) => m.unique_number?.startsWith("SF-"));
    const finale = matches.find((m) => m.unique_number === "FINAL") || null;

    return {
      voorronde,
      achtste_finales,
      kwartfinales,
      halve_finales,
      finale,
    };
  },

  /** Wedstrijden worden nooit hard verwijderd (cascade wist ook team_costs/saldi). */
  async deleteCupTournament(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message:
        "Bekerwedstrijden mogen niet verwijderd worden. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
    };
  },

  async updateCupMatch(matchId: number, updateData: Partial<CupMatch>): Promise<{ success: boolean; message: string }> {
    try {
      const prior = await bekerService.getCupMatchById(matchId);

      const updateObject: any = {};
      
      if (updateData.home_score !== undefined) updateObject.home_score = updateData.home_score;
      if (updateData.away_score !== undefined) updateObject.away_score = updateData.away_score;
      if (updateData.referee !== undefined) updateObject.referee = updateData.referee;
      if (updateData.referee_notes !== undefined) updateObject.referee_notes = updateData.referee_notes;
      if (updateData.is_submitted !== undefined) updateObject.is_submitted = updateData.is_submitted;
      if (updateData.is_locked !== undefined) updateObject.is_locked = updateData.is_locked;
      if (updateData.match_date !== undefined) updateObject.match_date = updateData.match_date;
      if (updateData.location !== undefined) updateObject.location = updateData.location;

      updateObject.updated_at = new Date().toISOString();

      const { data: rpcData, error } = await supabase.rpc('update_match_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: matchId,
        p_update_data: updateObject,
      });

      if (error) throw error;
      const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcResult?.success) throw new Error(rpcResult?.message || 'Update mislukt');

      // After updating, re-evaluate winner advancement logic using persisted values
      try {
        const currentMatch = await bekerService.getCupMatchById(matchId);
        if (currentMatch) {
          const nextRound = bekerService.getNextRound(currentMatch.unique_number!);
          const hsNew = currentMatch.home_score;
          const asNew = currentMatch.away_score;
          if (nextRound) {
            if (hsNew == null || asNew == null || hsNew === asNew) {
              // Unknown winner (empty or tie): clear downstream
              await bekerService.clearAdvancement(currentMatch.unique_number!, nextRound);
              await bekerService.clearAdvancementCascade(currentMatch.unique_number!);
            } else {
              const newWinnerTeamId = hsNew > asNew ? currentMatch.home_team_id! : currentMatch.away_team_id!;
              await bekerService.updateAdvancement(currentMatch.unique_number!, newWinnerTeamId, nextRound);
            }
          }
        }
      } catch (advErr) {
        console.warn('Warning: advancement update after cup match edit failed', advErr);
      }

      try {
        const after = await bekerService.getCupMatchById(matchId);
        if (
          after &&
          after.is_submitted &&
          after.home_score != null &&
          after.away_score != null &&
          after.home_team_id &&
          after.away_team_id
        ) {
          const submissionTransition = !!(prior && !prior.is_submitted && after.is_submitted);
          const shouldSyncCosts = await shouldSyncMatchCostsAfterMatchUpdate(matchId, submissionTransition);
          if (shouldSyncCosts) {
            const res = await invokeSyncMatchCostsForMatch({
              matchId,
              matchDateISO: after.match_date,
              homeTeamId: after.home_team_id,
              awayTeamId: after.away_team_id,
              isSubmitted: true,
              referee: after.referee ?? null,
            });
            if (!res.success) {
              console.warn("[updateCupMatch] sync-match-costs failed:", res.message);
            }
          }
        }
      } catch (costSyncErr) {
        console.warn("[updateCupMatch] match cost sync error:", costSyncErr);
      }

      return { success: true, message: "Bekerwedstrijd succesvol bijgewerkt!" };
    } catch (error) {
      console.error('Error updating cup match:', error);
      return { 
        success: false, 
        message: `Fout bij bijwerken wedstrijd: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async getCupMatchById(matchId: number): Promise<CupMatch | null> {
    const rows = await fetchMatchesForSession({ match_id: matchId, is_cup_match: true });
    const data = rows[0];
    if (!data) {
      console.error('Error fetching cup match: not found');
      return null;
    }

    const teamMap = await teamService.getPublicTeamMap();

    return {
      match_id: data.match_id as number,
      unique_number: data.unique_number as string | undefined,
      home_team_id: data.home_team_id as number | null,
      away_team_id: data.away_team_id as number | null,
      home_team_name: data.home_team_id ? teamMap.get(data.home_team_id as number) || 'Te spelen' : 'Te spelen',
      away_team_name: data.away_team_id ? teamMap.get(data.away_team_id as number) || 'Te spelen' : 'Te spelen',
      home_score: data.home_score as number | null,
      away_score: data.away_score as number | null,
      match_date: data.match_date as string,
      location: data.location as string,
      tournament_round: data.speeldag as string,
      tournament_position: null,
      next_match_id: null,
      is_submitted: data.is_submitted as boolean,
      is_locked: data.is_locked as boolean,
      referee: data.referee as string | undefined,
      referee_notes: data.referee_notes as string | undefined
    };
  },

  // Helper functions for winner advancement
  getNextMatchUniqueNumber(currentUniqueNumber: string): string | null {
    const matchNumber = bekerService.extractMatchNumber(currentUniqueNumber);

    if (currentUniqueNumber.startsWith("VR-")) {
      // Zonder matchlijst niet deterministisch; advanceWinner/reconcile lossen dit op.
      return null;
    }
    if (currentUniqueNumber.startsWith("1/16-")) {
      return `1/8-${Math.ceil(matchNumber / 2)}`;
    }
    if (currentUniqueNumber.startsWith("1/8-")) {
      return `QF-${Math.ceil(matchNumber / 2)}`;
    }
    if (currentUniqueNumber.startsWith("QF-")) {
      return `SF-${Math.ceil(matchNumber / 2)}`;
    }
    if (currentUniqueNumber.startsWith("SF-")) {
      return "FINAL";
    }

    return null;
  },

  resolveVoorrondeNextFromMatches(
    vrMatchNumber: number,
    cupMatches: Array<{ unique_number?: string | null }>,
  ): { unique: string; isHome: boolean } | null {
    const vrCount = cupMatches.filter((m) =>
      String(m.unique_number || "").startsWith("VR-"),
    ).length;
    if (vrCount <= 0) return null;

    const nextPrefix = ["1/16-", "1/8-", "QF-", "SF-"].find((p) =>
      cupMatches.some((m) => String(m.unique_number || "").startsWith(p)),
    );
    if (!nextPrefix) return null;
    const nextMatchCount = cupMatches.filter((m) =>
      String(m.unique_number || "").startsWith(nextPrefix),
    ).length;
    if (nextMatchCount <= 0) return null;

    const slot = nextSlotAfterVoorronde(vrMatchNumber, vrCount, nextMatchCount);
    const prefix = nextPrefix.replace(/-$/, "");
    return {
      unique: `${prefix}-${slot.matchNumber}`,
      isHome: slot.isHome,
    };
  },

  shouldBeHomeTeam(uniqueNumber: string, matchNumber: number): boolean {
    if (uniqueNumber.startsWith("1/8-") || uniqueNumber.startsWith("1/16-")) {
      return matchNumber % 2 === 0;
    }
    return matchNumber % 2 === 1;
  },

  getNextRound(currentUniqueNumber: string): string | null {
    if (currentUniqueNumber.startsWith("VR-")) {
      return "Volgende ronde";
    }
    if (currentUniqueNumber.startsWith("1/16-")) {
      return "Achtste finale";
    }
    if (currentUniqueNumber.startsWith("1/8-")) {
      return "Kwartfinale";
    }
    if (currentUniqueNumber.startsWith("QF-")) {
      return "Halve Finale";
    }
    if (currentUniqueNumber.startsWith("SF-")) {
      return "Finale";
    }
    return null;
  },

  async advanceWinner(matchId: number, winnerTeamId: number, nextRound: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🏆 Advancing winner (Team ${winnerTeamId}) to ${nextRound}...`);
      
      // Get current match details
      const currentMatch = await bekerService.getCupMatchById(matchId);
      if (!currentMatch) {
        return { success: false, message: "Wedstrijd niet gevonden." };
      }

      const unique = currentMatch.unique_number!;
      let nextMatchUniqueNumber: string | null = null;
      let shouldBeHome: boolean;

      if (unique.startsWith("VR-")) {
        const allCup = await fetchMatchesForSession({ is_cup_match: true });
        const resolved = bekerService.resolveVoorrondeNextFromMatches(
          bekerService.extractMatchNumber(unique),
          allCup,
        );
        if (!resolved) {
          return { success: false, message: "Geen volgende ronde gevonden na voorronde." };
        }
        nextMatchUniqueNumber = resolved.unique;
        shouldBeHome = resolved.isHome;
      } else {
        nextMatchUniqueNumber = bekerService.getNextMatchUniqueNumber(unique);
        shouldBeHome = bekerService.shouldBeHomeTeam(
          unique,
          bekerService.extractMatchNumber(unique),
        );
      }

      if (!nextMatchUniqueNumber) {
        return { success: false, message: "Geen volgende ronde gevonden." };
      }

      // Find the next match
      const nextRows = await fetchMatchesForSession({
        unique_number: nextMatchUniqueNumber,
        is_cup_match: true,
      });
      const nextMatch = nextRows[0];

      if (!nextMatch) {
        return { success: false, message: "Volgende wedstrijd niet gevonden." };
      }

      const loserTeamId = (currentMatch.home_team_id === winnerTeamId) ? currentMatch.away_team_id : currentMatch.home_team_id;

      // Prepare update: set reserved slot to winner; if the opposite slot contains the loser from this match, clear it
      const updateData: any = {};
      if (shouldBeHome) {
        updateData.home_team_id = winnerTeamId;
        if (nextMatch.away_team_id === loserTeamId) {
          updateData.away_team_id = null;
        }
      } else {
        updateData.away_team_id = winnerTeamId;
        if (nextMatch.home_team_id === loserTeamId) {
          updateData.home_team_id = null;
        }
      }

      // Update the next match with the decided slot
      const { data: rpcData, error: updateError } = await supabase.rpc('update_match_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: nextMatch.match_id as number,
        p_update_data: updateData,
      });

      if (updateError) throw updateError;
      const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcResult?.success) throw new Error(rpcResult?.message || 'Update mislukt');

      console.log(`✅ Winner advanced successfully to ${nextRound}`);
      return { success: true, message: `Winnaar succesvol doorgestroomd naar ${nextRound}!` };
    } catch (error) {
      console.error('Error advancing winner:', error);
      return { 
        success: false, 
        message: `Fout bij doorstromen winnaar: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async autoAdvanceWinner(matchId: number): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🤖 Auto-advancing winner for match ${matchId}...`);
      
      // Get current match details
      const currentMatch = await bekerService.getCupMatchById(matchId);
      if (!currentMatch) {
        return { success: false, message: "Wedstrijd niet gevonden." };
      }

      // Check if match has scores
      if (currentMatch.home_score === null || currentMatch.away_score === null) {
        return { success: false, message: "Wedstrijd heeft nog geen scores." };
      }

      // Determine winner
      let winnerTeamId: number;
      if (currentMatch.home_score > currentMatch.away_score) {
        winnerTeamId = currentMatch.home_team_id!;
      } else if (currentMatch.away_score > currentMatch.home_score) {
        winnerTeamId = currentMatch.away_team_id!;
      } else {
        return { success: false, message: "Gelijkspel - kan geen winnaar bepalen." };
      }

      // Get next round
      const nextRound = bekerService.getNextRound(currentMatch.unique_number!);
      if (!nextRound) {
        return { success: false, message: "Geen volgende ronde gevonden." };
      }

      // Advance winner
      return await bekerService.advanceWinner(matchId, winnerTeamId, nextRound);
    } catch (error) {
      console.error('Error auto-advancing winner:', error);
      return { 
        success: false, 
        message: `Fout bij automatisch doorstromen: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async updateAdvancement(currentMatchUniqueNumber: string, newWinnerTeamId: number, nextRound: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 Updating advancement for ${currentMatchUniqueNumber} with new winner ${newWinnerTeamId}...`);
      
      const nextMatchUniqueNumber = bekerService.getNextMatchUniqueNumber(currentMatchUniqueNumber);
      if (!nextMatchUniqueNumber) {
        return { success: false, message: "Geen volgende wedstrijd gevonden." };
      }

      // Find the next match
      const nextRows = await fetchMatchesForSession({
        unique_number: nextMatchUniqueNumber,
        is_cup_match: true,
      });
      const nextMatch = nextRows[0];

      if (!nextMatch) {
        return { success: false, message: "Volgende wedstrijd niet gevonden." };
      }

      // Determine reserved slot for this upstream match (no fallback). Also remove the previous loser if present.
      const shouldBeHome = bekerService.shouldBeHomeTeam(currentMatchUniqueNumber, bekerService.extractMatchNumber(currentMatchUniqueNumber));

      const currentRows = await fetchMatchesForSession({
        unique_number: currentMatchUniqueNumber,
        is_cup_match: true,
      });
      const currentMatchData = currentRows[0];

      let loserTeamId: number | null = null;
      if (currentMatchData) {
        const h = currentMatchData.home_team_id as number | null;
        const a = currentMatchData.away_team_id as number | null;
        if (h === newWinnerTeamId) loserTeamId = a;
        else if (a === newWinnerTeamId) loserTeamId = h;
      }

      const updateData: any = {};
      if (shouldBeHome) {
        updateData.home_team_id = newWinnerTeamId;
        if (loserTeamId && nextMatch.away_team_id === loserTeamId) updateData.away_team_id = null;
      } else {
        updateData.away_team_id = newWinnerTeamId;
        if (loserTeamId && nextMatch.home_team_id === loserTeamId) updateData.home_team_id = null;
      }

      // Update the next match with the decided slot
      const { data: rpcData, error: updateError } = await supabase.rpc('update_match_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: nextMatch.match_id as number,
        p_update_data: updateData,
      });

      if (updateError) throw updateError;
      const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcResult?.success) throw new Error(rpcResult?.message || 'Update mislukt');

      console.log(`✅ Advancement updated successfully`);
      return { success: true, message: "Doorstroming succesvol bijgewerkt!" };
    } catch (error) {
      console.error('Error updating advancement:', error);
      return { 
        success: false, 
        message: `Fout bij bijwerken doorstroming: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async checkAndCascadeUpdate(matchId: number): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 Checking for cascade updates for match ${matchId}...`);
      
      const currentMatch = await bekerService.getCupMatchById(matchId);
      if (!currentMatch) {
        return { success: false, message: "Wedstrijd niet gevonden." };
      }

      // Check if this match affects later rounds
      const nextMatchUniqueNumber = bekerService.getNextMatchUniqueNumber(currentMatch.unique_number!);
      if (!nextMatchUniqueNumber) {
        return { success: true, message: "Geen cascade updates nodig." };
      }

      // Check if next match already has teams assigned
      const nextRows = await fetchMatchesForSession({
        unique_number: nextMatchUniqueNumber,
        is_cup_match: true,
      });
      const nextMatch = nextRows[0];

      if (nextMatch && (nextMatch.home_team_id || nextMatch.away_team_id)) {
        const { data: rpcData, error: clearError } = await supabase.rpc('update_match_for_session', {
          ...getRpcSessionArgs(),
          p_match_id: nextMatch.match_id as number,
          p_update_data: { home_team_id: null, away_team_id: null },
        });

        if (clearError) throw clearError;
        const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcResult?.success) throw new Error(rpcResult?.message || 'Clear mislukt');

        console.log(`✅ Cleared next match teams due to result change`);
        return { success: true, message: "Volgende ronde teams gewist vanwege resultaatwijziging." };
      }

      return { success: true, message: "Geen cascade updates nodig." };
    } catch (error) {
      console.error('Error checking cascade updates:', error);
      return { 
        success: false, 
        message: `Fout bij controleren cascade updates: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async clearAdvancement(currentMatchUniqueNumber: string, nextRound: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Clearing advancement for ${currentMatchUniqueNumber}...`);
      
      const nextMatchUniqueNumber = bekerService.getNextMatchUniqueNumber(currentMatchUniqueNumber);
      if (!nextMatchUniqueNumber) {
        return { success: false, message: "Geen volgende wedstrijd gevonden." };
      }

      const nextRows = await fetchMatchesForSession({
        unique_number: nextMatchUniqueNumber,
        is_cup_match: true,
      });
      const nextMatch = nextRows[0];
      if (!nextMatch) {
        return { success: false, message: "Geen volgende wedstrijd gevonden." };
      }

      const { data: rpcData, error: clearError } = await supabase.rpc('update_match_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: nextMatch.match_id as number,
        p_update_data: { home_team_id: null, away_team_id: null },
      });

      if (clearError) throw clearError;
      const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcResult?.success) throw new Error(rpcResult?.message || 'Clear mislukt');

      console.log(`✅ Advancement cleared successfully`);
      return { success: true, message: "Doorstroming succesvol gewist!" };
    } catch (error) {
      console.error('Error clearing advancement:', error);
      return { 
        success: false, 
        message: `Fout bij wissen doorstroming: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },

  async clearAdvancementCascade(currentMatchUniqueNumber: string): Promise<void> {
    try {
      let next = bekerService.getNextMatchUniqueNumber(currentMatchUniqueNumber);
      while (next) {
        const nextRows = await fetchMatchesForSession({ unique_number: next, is_cup_match: true });
        const nextMatch = nextRows[0];
        if (nextMatch) {
          await supabase.rpc('update_match_for_session', {
            ...getRpcSessionArgs(),
            p_match_id: nextMatch.match_id as number,
            p_update_data: { home_team_id: null, away_team_id: null },
          });
        }
        next = bekerService.getNextMatchUniqueNumber(next);
      }
    } catch (_) {
      // best-effort; ignore errors in cascade
    }
  },

  // Utility functions
  extractMatchNumber(uniqueNumber: string): number {
    // Prefer the number after the last hyphen (e.g., '1/8-3' -> 3, 'QF-2' -> 2)
    const parts = uniqueNumber.split('-');
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!isNaN(parsed)) return parsed;

    // Fallback: take the last number sequence in the string
    const allNumbers = uniqueNumber.match(/\d+/g);
    if (allNumbers && allNumbers.length > 0) {
      const last = allNumbers[allNumbers.length - 1];
      const fallbackParsed = parseInt(last, 10);
      if (!isNaN(fallbackParsed)) return fallbackParsed;
    }
    return 0;
  },

  /**
   * Defensive fallback: scan all submitted cup matches with scores and verify
   * that their winner has been advanced to the next round. If not, advance them.
   * This catches edge cases where matches were updated outside the normal flow
   * (e.g. direct DB edits) and the bracket got out of sync.
   */
  async reconcileAdvancements(): Promise<{ success: boolean; advancedCount: number; message: string }> {
    try {
      const cupMatches = await fetchMatchesForSession({ is_cup_match: true });

      if (cupMatches.length === 0) {
        return { success: true, advancedCount: 0, message: 'Geen bekerwedstrijden gevonden.' };
      }

      // Index next-round matches by unique_number for quick lookup
      const byUnique = new Map<string, any>();
      cupMatches.forEach(m => {
        if (m.unique_number) byUnique.set(m.unique_number as string, m);
      });

      let advancedCount = 0;

      for (const m of cupMatches) {
        // Skip if not playable / no winner determinable
        if (!m.unique_number) continue;
        if (m.home_score == null || m.away_score == null) continue;
        if (m.home_score === m.away_score) continue;
        if (m.home_team_id == null || m.away_team_id == null) continue;

        const unique = m.unique_number as string;
        let nextUnique: string | null = null;
        let shouldBeHome: boolean;

        if (unique.startsWith("VR-")) {
          const resolved = bekerService.resolveVoorrondeNextFromMatches(
            bekerService.extractMatchNumber(unique),
            cupMatches,
          );
          if (!resolved) continue;
          nextUnique = resolved.unique;
          shouldBeHome = resolved.isHome;
        } else {
          nextUnique = bekerService.getNextMatchUniqueNumber(unique);
          if (!nextUnique) continue;
          shouldBeHome = bekerService.shouldBeHomeTeam(
            unique,
            bekerService.extractMatchNumber(unique),
          );
        }

        const nextMatch = byUnique.get(nextUnique);
        if (!nextMatch) continue;

        const winnerTeamId = m.home_score > m.away_score ? m.home_team_id : m.away_team_id;

        const slotAlreadyFilled = shouldBeHome
          ? nextMatch.home_team_id === winnerTeamId
          : nextMatch.away_team_id === winnerTeamId;

        if (slotAlreadyFilled) continue;

        const nextRound = bekerService.getNextRound(unique);
        if (!nextRound) continue;

        const result = await bekerService.advanceWinner(m.match_id as number, winnerTeamId as number, nextRound);
        if (result.success) {
          advancedCount += 1;
        }
      }

      return {
        success: true,
        advancedCount,
        message: advancedCount > 0
          ? `${advancedCount} winnaar(s) alsnog doorgeschoven.`
          : 'Bracket was al synchroon.'
      };
    } catch (error) {
      console.error('Error in reconcileAdvancements:', error);
      return {
        success: false,
        advancedCount: 0,
        message: `Reconciliatie mislukt: ${error instanceof Error ? error.message : 'Onbekende fout'}`
      };
    }
  }
}; 