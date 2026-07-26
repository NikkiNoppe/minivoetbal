import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import { localDateTimeToISO } from "@/lib/dateUtils";
import { normalizeVenueName } from "@/lib/utils";
import { matchDateFromWeekMonday } from "@/lib/cupBracketPlan";
import { seasonService } from "@/services/seasonService";
import { priorityOrderService } from "@/services/priorityOrderService";
import { loadSlotPlanningContext } from '@/services/match/slotPlanningContext';
import { teamService } from "@/services/core/teamService";
import { normalizeTeamsPreferences, scoreTeamForDetails } from "@/services/core/teamPreferencesService";
import {
  bulkInsertMatchesForSession,
  fetchMatchesForSession,
} from "@/services/core/matchesSessionBulk";

export interface PlayoffMatch {
  match_id: number;
  home_team_id: number | null;
  away_team_id: number | null;
  home_position: number | null;
  away_position: number | null;
  playoff_type: string | null;
  is_playoff_finalized: boolean;
  match_date: string;
  location: string | null;
  speeldag: string | null;
  home_score: number | null;
  away_score: number | null;
  home_team_name?: string;
  away_team_name?: string;
}

export const playoffService = {
  addDaysToDate(dateStr: string, days: number): string {
    // Parse als lokale datum om DST problemen te voorkomen
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    return `${newYear}-${newMonth}-${newDay}`;
  },

  async validateSeasonData(organizationId?: number): Promise<{ isValid: boolean; message?: string; data?: any }> {
    const seasonData = await seasonService.getSeasonData(organizationId);
    const venues = seasonData.venues || [];
    const timeslots = seasonData.venue_timeslots || [];
    if (venues.length === 0) return { isValid: false, message: "Geen venues beschikbaar in de database. Configureer eerst de competitiedata." };
    if (timeslots.length === 0) return { isValid: false, message: "Geen tijdslots beschikbaar in de database. Configureer eerst de competitiedata." };
    return { isValid: true, data: { venues, timeslots } };
  },

  splitTopBottomByRanking(teamsInRankingOrder: number[]): { top: number[]; bottom: number[] } {
    const total = teamsInRankingOrder.length;
    const half = Math.floor(total / 2);
    const top = teamsInRankingOrder.slice(0, half);
    const bottom = teamsInRankingOrder.slice(half);
    return { top, bottom };
  },

  // Round-robin algoritme voor posities (Circle Method) - hergebruikt competitie logica
  // Retourneert matches gegroepeerd per speeldag zodat elk team/positie max 1x per speeldag speelt
  generatePlayoffRoundRobinMatches(
    positions: number[], 
    playoffType: 'top' | 'bottom', 
    rounds: number
  ): Array<{ home_position: number; away_position: number; round: string; matchday: number }> {
    const matches: Array<{ home_position: number; away_position: number; round: string; matchday: number }> = [];
    const originalPositions = [...positions];
    const originalCount = originalPositions.length;
    const isOdd = originalCount % 2 !== 0;
    const BYE_POSITION = -1;

    // Werkset voor algoritme (voeg BYE toe bij oneven aantal)
    const arr = isOdd ? [...originalPositions, BYE_POSITION] : [...originalPositions];
    const n = arr.length; // even

    console.log(`🏆 Genereer playoff round-robin voor ${originalCount} posities${isOdd ? ' (met BYE)' : ''}: [${originalPositions.join(', ')}]`);

    const numMatchdays = n - 1; // Bij 8 teams: 7 speeldagen, bij 7 teams (+BYE=8): 7 speeldagen

    for (let round = 1; round <= rounds; round++) {
      // Reset arr voor elke ronde
      const roundArr = isOdd ? [...originalPositions, BYE_POSITION] : [...originalPositions];
      
      for (let matchday = 1; matchday <= numMatchdays; matchday++) {
        const globalMatchday = (round - 1) * numMatchdays + matchday;
        
        for (let i = 0; i < n / 2; i++) {
          const home = roundArr[i];
          const away = roundArr[n - 1 - i];
          
          // Skip BYE matches
          if (home === BYE_POSITION || away === BYE_POSITION) continue;
          
          // Alternate home/away between rounds
          if (round % 2 === 1) {
            matches.push({ 
              home_position: home, 
              away_position: away, 
              round: `${playoffType}_playoff_r${round}`,
              matchday: globalMatchday
            });
          } else {
            matches.push({ 
              home_position: away, 
              away_position: home, 
              round: `${playoffType}_playoff_r${round}`,
              matchday: globalMatchday
            });
          }
        }

        // Rotate (houd index 0 vast) - Circle Method
        const last = roundArr.pop() as number;
        roundArr.splice(1, 0, last);
      }
    }

    console.log(`✅ Playoff ${playoffType}: ${matches.length} wedstrijden gegenereerd over ${numMatchdays * rounds} speeldagen`);
    return matches;
  },

  // Legacy functie - behouden voor backward compatibility
  generatePositionBasedMatches(
    positions: number[], 
    playoffType: 'top' | 'bottom', 
    rounds: number
  ): Array<{ home_position: number; away_position: number; round: string }> {
    // Delegate naar nieuwe round-robin functie
    return this.generatePlayoffRoundRobinMatches(positions, playoffType, rounds)
      .map(({ home_position, away_position, round }) => ({ home_position, away_position, round }));
  },

  generatePlayoffRoundMatches(teams: number[], roundType: string): Array<{ home: number; away: number; round: string }> {
    const matches: Array<{ home: number; away: number; round: string }> = [];
    for (let round = 1; round <= 2; round++) {
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          if (round === 1) {
            matches.push({ home: teams[i], away: teams[j], round: `${roundType}_r${round}` });
          } else {
            matches.push({ home: teams[j], away: teams[i], round: `${roundType}_r${round}` });
          }
        }
      }
    }
    return matches;
  },

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

  async generatePlayoffWeeks(
    start_date: string,
    end_date: string,
    organizationId?: number,
  ): Promise<string[]> {
    const seasonData = await seasonService.getSeasonData(organizationId);
    const vacations = seasonData.vacation_periods || [];

    const {
      listSeasonPlayableWeeks,
      buildSeasonSlotGrids,
      buildSlotDetailsFromSeasonData,
      capacityForWeek,
    } = await import("@/lib/seasonCalendar");
    const { filterActiveSlotUnavailability } = await import("@/services/slotUnavailabilityService");
    const { toMondayIso } = await import("@/lib/competitionPlanningEstimate");

    const playable = listSeasonPlayableWeeks(start_date, end_date, vacations);
    const existingMatchesAll = await fetchMatchesForSession({});
    const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
    const grids = buildSeasonSlotGrids({
      weekMondays: playable,
      slotDetails,
      blocks: filterActiveSlotUnavailability(seasonData.slot_unavailability),
      vacations,
      matches: existingMatchesAll.map((m: Record<string, unknown>) => ({
        match_date: m.match_date as string | undefined,
        location: m.location as string | undefined,
        match_time: m.match_time as string | undefined,
        is_cup_match: Boolean(m.is_cup_match),
        is_playoff_match: Boolean(m.is_playoff_match),
      })),
    });

    // Hard vermijden: competitie- én bekerweken (en bestaande playoff)
    const busyMondays = new Set(
      existingMatchesAll
        .filter((m: any) => m?.match_date)
        .map((m: any) => toMondayIso(String(m.match_date))),
    );

    return playable.filter(
      (monday) => !busyMondays.has(monday) && capacityForWeek(grids, monday) > 0,
    );
  },

  // Calculate which position has BYE for a given matchday (for odd number of teams)
  getByePositionForMatchday(
    positions: number[], 
    matchday: number
  ): number | null {
    if (positions.length % 2 === 0) return null; // No bye with even number
    
    const BYE_POSITION = -1;
    const arr = [...positions, BYE_POSITION];
    const n = arr.length;
    const numMatchdays = n - 1;
    
    // Normalize matchday to single round
    const normalizedMatchday = ((matchday - 1) % numMatchdays) + 1;
    
    // Simulate round-robin rotation to this matchday
    for (let day = 1; day < normalizedMatchday; day++) {
      const last = arr.pop()!;
      arr.splice(1, 0, last);
    }
    
    // Find which real position plays against BYE
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home === BYE_POSITION) return away;
      if (away === BYE_POSITION) return home;
    }
    return null;
  },

  // Get BYE info for all playoff matchdays
  getByeInfoForPlayoffs(
    bottomPositions: number[],
    rounds: number
  ): Map<number, number> {
    const byeInfo = new Map<number, number>();
    if (bottomPositions.length % 2 === 0) return byeInfo; // No bye needed
    
    const numMatchdays = bottomPositions.length; // With BYE added it becomes even, so n-1 = positions.length
    const totalMatchdays = numMatchdays * rounds;
    
    for (let matchday = 1; matchday <= totalMatchdays; matchday++) {
      const byePosition = this.getByePositionForMatchday(bottomPositions, matchday);
      if (byePosition) byeInfo.set(matchday, byePosition);
    }
    return byeInfo;
  },

  // Get timeslots filtered by day of week
  async getTimeslotsForDay(dayOfWeek: number): Promise<Array<{ time: string; venue: string }>> {
    const seasonData = await seasonService.getSeasonData();
    const timeslots = seasonData.venue_timeslots || [];
    const venues = seasonData.venues || [];
    
    return timeslots
      .filter((ts: any) => ts.day_of_week === dayOfWeek)
      .sort((a: any, b: any) => (a.priority || 99) - (b.priority || 99))
      .map((ts: any) => {
        const venue = venues.find((v: any) => v.venue_id === ts.venue_id);
        return {
          time: ts.start_time,
          venue: ts.venue_name || venue?.name || 'Onbekend'
        };
      });
  },

  // NEW: Generate position-based playoffs (concept planning)
  // Uses round-robin algorithm: each matchday, every position plays max 1 match
  // Top 8: 4 matches per matchday on MONDAY, Bottom 7: 3 matches per matchday on TUESDAY (1 bye)
  async generatePositionBasedPlayoffs(
    topPositions: number[], // e.g. [1,2,3,4,5,6,7,8] for top 8
    bottomPositions: number[], // e.g. [9,10,11,12,13,14,15] for bottom 7
    rounds: number,
    start_date: string,
    end_date: string,
    organizationId?: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const existingPlayoffs = (await fetchMatchesForSession({})).filter(
        (m) => m.is_playoff_match,
      );
      if (existingPlayoffs.length > 0) {
        return {
          success: false,
          message:
            "Er bestaan al playoffwedstrijden. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
        };
      }

      const seasonValidation = await this.validateSeasonData(organizationId);
      if (!seasonValidation.isValid) return { success: false, message: seasonValidation.message! };
      
      const playingWeeks = await this.generatePlayoffWeeks(
        start_date,
        end_date,
        organizationId,
      );
      if (playingWeeks.length === 0) return { success: false, message: "Geen beschikbare speelweken binnen de geselecteerde periode." };

      // Get timeslots per day - PO1 on Monday (day 1), PO2 on Tuesday (day 2)
      const mondaySlots = await this.getTimeslotsForDay(1);
      const tuesdaySlots = await this.getTimeslotsForDay(2);
      
      console.log(`📅 Monday slots (for PO1): ${mondaySlots.length}`, mondaySlots);
      console.log(`📅 Tuesday slots (for PO2): ${tuesdaySlots.length}`, tuesdaySlots);

      // Generate position-based matches using round-robin (with proper matchday grouping)
      const topMatches = topPositions.length > 0 
        ? this.generatePlayoffRoundRobinMatches(topPositions, 'top', rounds) 
        : [];
      const bottomMatches = bottomPositions.length > 0 
        ? this.generatePlayoffRoundRobinMatches(bottomPositions, 'bottom', rounds) 
        : [];
      
      // Calculate matchdays per round
      const topMatchdays = (topPositions.length > 0) 
        ? (topPositions.length % 2 === 0 ? topPositions.length - 1 : topPositions.length) 
        : 0;
      const bottomMatchdays = (bottomPositions.length > 0) 
        ? (bottomPositions.length % 2 === 0 ? bottomPositions.length - 1 : bottomPositions.length) 
        : 0;
      const totalMatchdays = Math.max(topMatchdays, bottomMatchdays) * rounds;
      
      console.log(`📊 Playoff planning: Top ${topPositions.length} posities (${topMatchdays} speeldagen/ronde), Bottom ${bottomPositions.length} posities (${bottomMatchdays} speeldagen/ronde)`);
      console.log(`📊 Totaal ${totalMatchdays} speeldagen nodig, ${playingWeeks.length} weken beschikbaar`);
      
      if (playingWeeks.length < totalMatchdays) {
        return { 
          success: false, 
          message: `Onvoldoende weken: ${totalMatchdays} speeldagen nodig, maar slechts ${playingWeeks.length} weken beschikbaar.` 
        };
      }

      // Create combined schedule per matchday
      const matchInserts: any[] = [];
      let counter = 1;

      for (let matchday = 1; matchday <= totalMatchdays; matchday++) {
        const weekIndex = matchday - 1;
        if (weekIndex >= playingWeeks.length) break;
        
        const baseDate = playingWeeks[weekIndex]; // Monday of this week
        
        // Alternate day assignment per matchday for fair distribution
        // Odd matchday: PO1=Monday, PO2=Tuesday
        // Even matchday: PO1=Tuesday, PO2=Monday
        const isOddMatchday = matchday % 2 === 1;
        const po1PrimaryDayOffset = isOddMatchday ? 0 : 1;  // 0 = Monday, 1 = Tuesday
        const po2PrimaryDayOffset = isOddMatchday ? 1 : 0;
        const po1PrimarySlots = isOddMatchday ? mondaySlots : tuesdaySlots;
        const po2PrimarySlots = isOddMatchday ? tuesdaySlots : mondaySlots;
        
        // Overflow slots: the OTHER day's slots for when primary day doesn't have enough
        const po1OverflowSlots = isOddMatchday ? tuesdaySlots : mondaySlots;
        const po1OverflowDayOffset = isOddMatchday ? 1 : 0;
        
        // Get top matches for this matchday
        const topMatchesForDay = topMatches.filter(m => m.matchday === matchday);
        
        // PO2 uses 3 slots max, so on the PO2 day there's always 1 free slot we can use for overflow
        // Find the free Bavikhove slot on PO2's day (the one PO2 won't use)
        // PO2 has 3 matches, uses indices 0,1,2 of its slots
        // If PO2 is on Monday (4 slots), slot index 3 is free (usually Bavikhove 19:30)
        const po2SlotsCount = po2PrimarySlots.length;
        const bottomMatchesCount = bottomMatches.filter(m => m.matchday === matchday).length;
        
        // Find the free slot on PO2's day that PO2 won't use
        const freeSlotOnPo2Day = po2SlotsCount > bottomMatchesCount 
          ? po2PrimarySlots[po2SlotsCount - 1] // Last slot is typically Bavikhove
          : null;
        
        let slotIndex = 0;
        
        for (const match of topMatchesForDay) {
          let slot: { time: string; venue: string };
          let matchDate: string;
          
          if (slotIndex < po1PrimarySlots.length) {
            // Use primary day slots
            slot = po1PrimarySlots[slotIndex] || { time: '19:00', venue: 'De Dageraad' };
            matchDate = this.addDaysToDate(baseDate, po1PrimaryDayOffset);
          } else if (freeSlotOnPo2Day) {
            // Overflow: use the free slot on PO2's day (the Bavikhove slot that PO2 doesn't use)
            slot = freeSlotOnPo2Day;
            matchDate = this.addDaysToDate(baseDate, po2PrimaryDayOffset);
          } else {
            // Fallback: use overflow day's slots (shouldn't happen with current config)
            const overflowIndex = slotIndex - po1PrimarySlots.length;
            slot = po1OverflowSlots[overflowIndex % po1OverflowSlots.length] || { time: '19:00', venue: 'De Dageraad' };
            matchDate = this.addDaysToDate(baseDate, po1OverflowDayOffset);
          }
          
          const matchDateTime = localDateTimeToISO(matchDate, slot.time);
          
          matchInserts.push({
            unique_number: `PO-${counter}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            speeldag: `Playoff ${matchday}`,
            home_team_id: null,
            away_team_id: null,
            home_position: match.home_position,
            away_position: match.away_position,
            playoff_type: 'top',
            is_playoff_finalized: false,
            is_playoff_match: true,
            match_date: matchDateTime,
            location: normalizeVenueName(slot.venue),
            is_cup_match: false,
            is_submitted: false,
            is_locked: false
          });
          counter++;
          slotIndex++;
        }
        
        // Get bottom matches for this matchday
        const bottomMatchesForDay = bottomMatches.filter(m => m.matchday === matchday);
        slotIndex = 0;
        
        for (const match of bottomMatchesForDay) {
          const slot = po2PrimarySlots[slotIndex % po2PrimarySlots.length] || { time: '18:30', venue: 'De Dageraad' };
          const po2Date = this.addDaysToDate(baseDate, po2PrimaryDayOffset);
          const matchDateTime = localDateTimeToISO(po2Date, slot.time);
          
          matchInserts.push({
            unique_number: `PO-${counter}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            speeldag: `Playoff ${matchday}`,
            home_team_id: null,
            away_team_id: null,
            home_position: match.home_position,
            away_position: match.away_position,
            playoff_type: 'bottom',
            is_playoff_finalized: false,
            is_playoff_match: true,
            match_date: matchDateTime,
            location: normalizeVenueName(slot.venue),
            is_cup_match: false,
            is_submitted: false,
            is_locked: false
          });
          counter++;
          slotIndex++;
        }
      }

      const insertResult = await bulkInsertMatchesForSession(matchInserts);
      if (!insertResult.success) {
        return { success: false, message: `Fout bij opslaan: ${insertResult.error || 'onbekend'}` };
      }

      return { 
        success: true, 
        message: `${matchInserts.length} playoff wedstrijden succesvol aangemaakt (concept). PO1/PO2 wisselen wekelijks van dag (ma↔di) voor eerlijke verdeling.` 
      };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Onbekende fout' };
    }
  },

  // NEW: Finalize playoffs - assign actual teams based on current standings
  async finalizePlayoffs(
    standingsMap: Map<number, number> // position -> team_id
  ): Promise<{ success: boolean; message: string }> {
    try {
      const playoffMatches = (await fetchMatchesForSession({}))
        .filter(
          (m) =>
            m.is_playoff_match &&
            !m.is_playoff_finalized &&
            m.home_position != null,
        );

      if (playoffMatches.length === 0) {
        return { success: false, message: "Geen concept playoff wedstrijden gevonden om te finaliseren." };
      }

      // Update each match with actual team IDs
      let updatedCount = 0;
      for (const match of playoffMatches) {
        const homeTeamId = standingsMap.get(match.home_position as number);
        const awayTeamId = standingsMap.get(match.away_position as number);

        if (!homeTeamId || !awayTeamId) {
          const missingPositions: string[] = [];
          if (!homeTeamId) missingPositions.push(`thuis positie ${match.home_position}`);
          if (!awayTeamId) missingPositions.push(`uit positie ${match.away_position}`);
          
          console.error(`Match ${match.match_id}: Ontbrekende team mapping voor: ${missingPositions.join(', ')}`);
          console.error('Beschikbare posities in standingsMap:', Array.from(standingsMap.keys()).sort((a, b) => a - b));
          
          // Stop finalisatie - dit is een kritieke fout die opgelost moet worden
          return { 
            success: false, 
            message: `Finalisatie mislukt: Kon ${missingPositions.join(' en ')} niet mappen naar teams. Controleer of alle 15 teams in de stand staan.` 
          };
        }

        const { data: rpcData, error: updateError } = await supabase.rpc('update_match_for_session', {
          ...getRpcSessionArgs(),
          p_match_id: match.match_id as number,
          p_update_data: {
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            is_playoff_finalized: true,
          },
        });

        if (updateError) {
          console.error(`Fout bij updaten match ${match.match_id}:`, updateError);
          continue;
        }
        const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcResult?.success) {
          console.error(`Fout bij updaten match ${match.match_id}:`, rpcResult?.message);
          continue;
        }
        updatedCount++;
      }

      return { 
        success: true, 
        message: `${updatedCount} playoff wedstrijden succesvol gefinaliseerd met echte teams.` 
      };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Onbekende fout' };
    }
  },

  // NEW: Unfinalize playoffs - revert to position-based (clear team assignments)
  async unfinalizePlayoffs(): Promise<{ success: boolean; message: string }> {
    try {
      const playoffMatches = (await fetchMatchesForSession({})).filter(
        (m) => m.is_playoff_match && m.is_playoff_finalized,
      );

      if (playoffMatches.length === 0) {
        return { success: false, message: "Geen gefinaliseerde playoff wedstrijden gevonden." };
      }

      for (const match of playoffMatches) {
        const { data: rpcData, error: updateError } = await supabase.rpc('update_match_for_session', {
          ...getRpcSessionArgs(),
          p_match_id: match.match_id as number,
          p_update_data: {
            home_team_id: null,
            away_team_id: null,
            is_playoff_finalized: false,
          },
        });

        if (updateError) {
          return { success: false, message: `Fout bij terugzetten: ${updateError.message}` };
        }
        const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcResult?.success) {
          return { success: false, message: rpcResult?.message || 'Fout bij terugzetten' };
        }
      }

      return { 
        success: true, 
        message: `${playoffMatches.length} playoff wedstrijden teruggezet naar concept (posities).` 
      };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Onbekende fout' };
    }
  },

  // NEW: Get playoff matches with team names resolved
  async getPlayoffMatches(): Promise<PlayoffMatch[]> {
    const matches = (await fetchMatchesForSession({})).filter((m) => m.is_playoff_match);

    if (matches.length === 0) {
      return [];
    }

    // Get team names
    const teamIds = new Set<number>();
    matches.forEach(m => {
      if (m.home_team_id) teamIds.add(m.home_team_id as number);
      if (m.away_team_id) teamIds.add(m.away_team_id as number);
    });

    const teams = await teamService.getAllTeams();
    const teamMap = new Map(teams.map(t => [t.team_id, t.team_name]));

    return matches.map(m => ({
      match_id: m.match_id as number,
      home_team_id: m.home_team_id as number | null,
      away_team_id: m.away_team_id as number | null,
      home_position: m.home_position as number | null,
      away_position: m.away_position as number | null,
      playoff_type: m.playoff_type as string | null,
      is_playoff_finalized: !!m.is_playoff_finalized,
      match_date: m.match_date as string,
      location: m.location as string | null,
      speeldag: m.speeldag as string | null,
      home_score: m.home_score as number | null,
      away_score: m.away_score as number | null,
      home_team_name: m.home_team_id ? teamMap.get(m.home_team_id as number) : undefined,
      away_team_name: m.away_team_id ? teamMap.get(m.away_team_id as number) : undefined,
    }));
  },

  // Check if there are any position-based (concept) playoffs
  async hasConceptPlayoffs(): Promise<boolean> {
    const count = (await fetchMatchesForSession({})).filter(
      (m) => m.is_playoff_match && !m.is_playoff_finalized && m.home_position != null,
    ).length;
    return count > 0;
  },

  // Check if there are any finalized playoffs
  async hasFinalizedPlayoffs(): Promise<boolean> {
    const count = (await fetchMatchesForSession({})).filter(
      (m) => m.is_playoff_match && m.is_playoff_finalized,
    ).length;
    return count > 0;
  },

  async generateAndSavePlayoffs(
    topTeams: number[],
    bottomTeams: number[],
    rounds: number,
    start_date: string,
    end_date: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const existingPlayoffs = (await fetchMatchesForSession({})).filter(
        (m) => m.is_playoff_match,
      );
      if (existingPlayoffs.length > 0) {
        return {
          success: false,
          message:
            "Er bestaan al playoffwedstrijden. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.",
        };
      }

      const seasonValidation = await this.validateSeasonData();
      if (!seasonValidation.isValid) return { success: false, message: seasonValidation.message! };
      const playingWeeks = await this.generatePlayoffWeeks(start_date, end_date);
      if (playingWeeks.length === 0) return { success: false, message: "Geen beschikbare speelweken binnen de geselecteerde periode." };

      const topMatches = this.generatePlayoffRoundMatchesCustom(topTeams, 'top_playoff', rounds);
      const bottomMatches = this.generatePlayoffRoundMatchesCustom(bottomTeams, 'bottom_playoff', rounds);
      const allMatches: Array<{ home: number; away: number; round: string }> = [];
      const maxLen = Math.max(topMatches.length, bottomMatches.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < topMatches.length) allMatches.push(topMatches[i]);
        if (i < bottomMatches.length) allMatches.push(bottomMatches[i]);
      }

      const matchesPerWeek = 7;
      const slotCtx = await loadSlotPlanningContext();
      const teamsPerWeek: Map<number, Set<number>> = new Map();
      const slotsPerWeek: Map<number, number> = new Map();
      for (let w = 0; w < playingWeeks.length; w++) { teamsPerWeek.set(w, new Set()); slotsPerWeek.set(w, 0); }

      // Teamvoorkeuren laden
      const allTeamsData = await teamService.getAllTeams();
      const involvedTeams = new Set<number>([...topTeams, ...bottomTeams]);
      const teamPrefs = normalizeTeamsPreferences(allTeamsData.filter(t => involvedTeams.has(t.team_id)));
      const venues = seasonValidation.data?.venues || [];

      const placed: Array<{ match: { home: number; away: number; round: string }; week: number; slot: number }> = [];
      for (const m of allMatches) {
        let bestWeek: number | null = null; let bestSlotForWeek = 0; let bestScore = -1;
        for (let w = 0; w < playingWeeks.length; w++) {
          const weekTeams = teamsPerWeek.get(w)!; const slotsUsed = slotsPerWeek.get(w)!;
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
          if (combined > bestScore) { bestScore = combined; bestWeek = w; bestSlotForWeek = slotIndex; }
        }
        if (bestWeek === null) return { success: false, message: "Onvoldoende weken/slots om alle playoff wedstrijden in te plannen." };
        const weekTeams = teamsPerWeek.get(bestWeek)!; weekTeams.add(m.home); weekTeams.add(m.away);
        teamsPerWeek.set(bestWeek, weekTeams); slotsPerWeek.set(bestWeek, bestSlotForWeek + 1);
        placed.push({ match: m, week: bestWeek, slot: bestSlotForWeek });
      }

      const matchInserts: any[] = []; let counter = 1;
      for (const { match, week, slot } of placed) {
        const { venue, timeslot } = await priorityOrderService.getMatchDetails(slot, 7);
        const baseDate = playingWeeks[week];
        const matchDate = matchDateFromWeekMonday(
          baseDate,
          timeslot?.day_of_week,
        );
        const matchDateTime = localDateTimeToISO(matchDate, timeslot?.start_time || '19:00');
        matchInserts.push({
          unique_number: `PO-${counter}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          speeldag: `Playoff`,
          home_team_id: match.home,
          away_team_id: match.away,
          is_playoff_match: true,
          is_playoff_finalized: true, // Direct finalized because we have team IDs
          match_date: matchDateTime,
          location: venue,
          is_cup_match: false,
          is_submitted: false,
          is_locked: false
        });
        counter++;
      }

      const insertResult = await bulkInsertMatchesForSession(matchInserts);
      if (!insertResult.success) {
        return { success: false, message: `Fout bij opslaan: ${insertResult.error || 'onbekend'}` };
      }
      return { success: true, message: `${matchInserts.length} playoff wedstrijden succesvol aangemaakt.` };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Onbekende fout' };
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
};
