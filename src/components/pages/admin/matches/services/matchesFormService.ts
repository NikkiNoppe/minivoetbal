import { supabase } from "@/integrations/supabase/client";
import { MatchFormData } from "../types";
import { localDateTimeToISO, isoToLocalDateTime } from "@/lib/dateUtils";
import { cupService } from "@/services/match";
import { scheduleBackgroundSideEffects } from "@/services/match/backgroundSideEffects";
import { sortCupMatches, sortLeagueMatches } from "@/lib/matchSortingUtils";
import { getRpcSessionArgs } from "@/lib/authSession";
import { fetchMatchForSession } from "@/services/core/matchesSessionFetch";

export const fetchUpcomingMatches = async (
  teamId: number,
  hasElevatedPermissions: boolean = false,
  competitionType?: 'league' | 'cup' | 'playoff',
  refereeFilter?: { userId: number; username: string }
): Promise<MatchFormData[]> => {
  try {
    const sessionArgs = getRpcSessionArgs();
    const { data: allMatches, error } = await supabase.rpc('get_matches_for_forms', {
      ...sessionArgs,
      p_team_id: hasElevatedPermissions ? 0 : teamId,
      p_has_elevated_permissions: hasElevatedPermissions,
      p_competition_type: competitionType ?? null,
      p_referee_user_id: refereeFilter?.userId ?? null,
      p_referee_username: refereeFilter?.username ?? null,
    });

    if (error) {
      console.error(`❌ Error fetching matches (${competitionType || 'all'}):`, error);
      const message =
        error.code === '22P02'
          ? 'Ongeldige sessie. Log opnieuw in.'
          : error.message?.includes('Geen actieve sessie')
            ? 'Geen actieve sessie. Log opnieuw in.'
            : error.message || 'Kon wedstrijdformulieren niet laden.';
      throw new Error(message);
    }

    if (!allMatches) return [];

    if (
      hasElevatedPermissions &&
      allMatches.length === 0 &&
      process.env.NODE_ENV === 'development'
    ) {
      console.warn(
        `[matchesFormService] Admin/referee fetch returned 0 ${competitionType ?? 'all'} matches — check session token / DB migration 20260609230000`,
      );
    }

    const matches: MatchFormData[] = (allMatches as any[]).map((row: any) => {
      const { date, time } = isoToLocalDateTime(row.match_date);
      
      // Use speeldag for matchday display, with special handling for cup and playoff matches
      let matchdayDisplay = (row.speeldag || "Te bepalen");
      const isPlayoff = (row as any).is_playoff_match === true;
      const isCup = row.is_cup_match === true;
      
      // Normalize all playoff speeldag variants to "Playoff X"
      if (isPlayoff || matchdayDisplay.toLowerCase().includes('playoff')) {
        const num = matchdayDisplay.match(/(\d+)/);
        matchdayDisplay = num ? `Playoff ${num[1]}` : 'Playoff';
      }
      
      if (isCup && !matchdayDisplay.startsWith('🏆')) {
        matchdayDisplay = `🏆 ${matchdayDisplay}`;
      }

      const processedRefereeNotes = row.referee_notes || "";

      return {
        matchId: row.match_id,
        uniqueNumber: row.unique_number || "",
        date,
        time,
        homeTeamId: row.home_team_id ?? 0,
        homeTeamName: row.home_team_name ?? "Nog te bepalen",
        awayTeamId: row.away_team_id ?? 0,
        awayTeamName: row.away_team_name ?? "Nog te bepalen",
        location: row.location || "Te bepalen",
        matchday: matchdayDisplay,
        isCompleted: !!row.is_submitted,
        isLocked: !!row.is_locked,
        homeScore: row.home_score ?? undefined,
        awayScore: row.away_score ?? undefined,
        referee: row.referee,
        refereeNotes: processedRefereeNotes,
        homePlayers: row.home_players && Array.isArray(row.home_players) ? row.home_players : [],
        awayPlayers: row.away_players && Array.isArray(row.away_players) ? row.away_players : [],
        // Poll-related fields (backward compatible)
        assignedRefereeId: row.assigned_referee_id,
        pollGroupId: row.poll_group_id,
        pollMonth: row.poll_month
      };
    });

    // Apply appropriate sorting based on competition type
    if (competitionType === 'cup') {
      return sortCupMatches(matches);
    } else if (competitionType === 'league') {
      return sortLeagueMatches(matches);
    }

    return matches;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`❌ Error in fetchUpcomingMatches (${competitionType || 'all'}):`, error);
    }
    throw error;
  }
};

export const updateMatchForm = async (matchData: MatchFormData): Promise<{advanceMessage?: string}> => {
  try {
    // First check if this is a cup match that's being completed
    const existingMatch = await fetchMatchForSession(matchData.matchId);
    if (!existingMatch) {
      throw new Error('Wedstrijd niet gevonden of geen toegang');
    }

    const isCupMatch = existingMatch?.is_cup_match;
    const wasAlreadySubmitted = existingMatch?.is_submitted;
    const isBeingCompleted = matchData.isCompleted && !wasAlreadySubmitted;

    const processedRefereeNotes = matchData.refereeNotes !== undefined && matchData.refereeNotes !== null ? matchData.refereeNotes : null;
    
    console.log('💾 [matchesFormService] updateMatchForm - Referee notes:', {
      matchId: matchData.matchId,
      original: matchData.refereeNotes,
      originalType: typeof matchData.refereeNotes,
      originalLength: matchData.refereeNotes?.length || 0,
      isUndefined: matchData.refereeNotes === undefined,
      isNull: matchData.refereeNotes === null,
      isEmpty: matchData.refereeNotes === "",
      processed: processedRefereeNotes,
      processedType: typeof processedRefereeNotes
    });

    // Update the match
    const updatePayload = {
      match_date: localDateTimeToISO(matchData.date, matchData.time),
      home_team_id: matchData.homeTeamId,
      away_team_id: matchData.awayTeamId,
      location: matchData.location,
      speeldag: matchData.matchday,
      home_score: matchData.homeScore,
      away_score: matchData.awayScore,
      referee: matchData.referee,
      referee_notes: processedRefereeNotes,
      is_submitted: matchData.isCompleted,
      is_locked: matchData.isLocked,
      home_players: matchData.homePlayers as any,
      away_players: matchData.awayPlayers as any,
      // Preserve poll data if present
      assigned_referee_id: (matchData as any).assignedRefereeId || null,
      poll_group_id: (matchData as any).pollGroupId || null,
      poll_month: (matchData as any).pollMonth || null
    };
    
    console.log('💾 [matchesFormService] updateMatchForm - Update payload:', {
      matchId: matchData.matchId,
      referee_notes: updatePayload.referee_notes,
      referee_notesType: typeof updatePayload.referee_notes,
      referee_notesLength: updatePayload.referee_notes?.length || 0
    });
    
    // Get user ID from localStorage
    const authDataString = localStorage.getItem('auth_data');
    let userId: number | null = null;
    if (authDataString) {
      try {
        const authData = JSON.parse(authDataString);
        userId = authData?.user?.id;
      } catch (e) {
        console.warn('Could not parse auth_data');
      }
    }
    
    const { data, error } = await supabase.rpc('update_match_for_session', {
      ...getRpcSessionArgs(),
      p_match_id: matchData.matchId,
      p_update_data: updatePayload
    });

    if (error) {
      console.error('❌ [matchesFormService] RPC Error updating match:', error);
      throw error;
    }
    
    // Check RPC result for success/failure
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || !result.success) {
      console.error('❌ [matchesFormService] RPC returned failure:', result);
      throw new Error(result?.message || "Geen toegang om deze wedstrijd bij te werken.");
    }
    
    console.log('✅ [matchesFormService] Match updated successfully via RPC:', {
      matchId: matchData.matchId,
      referee_notes: processedRefereeNotes,
      result
    });

    // Zelfde achtergrond-sync als competitiewedstrijden: kaartboetes, wedstrijdkosten, enz.
    scheduleBackgroundSideEffects(
      matchData.matchId,
      {
        homePlayers: matchData.homePlayers,
        awayPlayers: matchData.awayPlayers,
        isCompleted: matchData.isCompleted,
        referee: matchData.referee,
        _submissionTransition: isBeingCompleted,
      },
      {
        match_date: updatePayload.match_date,
        home_team_id: matchData.homeTeamId,
        away_team_id: matchData.awayTeamId,
        is_cup_match: isCupMatch,
        unique_number: existingMatch?.unique_number,
      },
      !!isCupMatch,
      false,
    );

    // If this is a cup match with scores, check for winner advancement (both new completions and score changes)
    if (isCupMatch && matchData.isCompleted && 
        matchData.homeScore !== undefined && matchData.awayScore !== undefined) {
      console.log('🏆 Cup match with scores being updated:', {
        matchId: matchData.matchId,
        uniqueNumber: matchData.uniqueNumber,
        homeScore: matchData.homeScore,
        awayScore: matchData.awayScore,
        isCupMatch,
        wasAlreadySubmitted,
        isBeingCompleted
      });
      
      try {
        const advanceResult = await cupService.autoAdvanceWinner(matchData.matchId);
        console.log('🚀 Auto-advance result:', advanceResult);
        
        if (advanceResult.success) {
          console.log('✅ Winner advancement processed:', advanceResult.message);
          return { advanceMessage: advanceResult.message };
        } else {
          console.log('⚠️ Could not process winner advancement:', advanceResult.message);
          // Still return some info for draws or other cases
          if (advanceResult.message.includes("Gelijkspel")) {
            return { advanceMessage: "Gelijkspel gedetecteerd - doorschuiving gewist" };
          }
        }
      } catch (advanceError) {
        console.error('❌ Error during auto-advance:', advanceError);
        // Don't throw here - the match update was successful, auto-advance is a bonus feature
      }
    }

    // If cup match scores were cleared back to null, remove advancement to next round
    if (isCupMatch && (matchData.homeScore === null || matchData.awayScore === null)) {
      try {
        const current = await cupService.getCupMatchById(matchData.matchId);
        if (current && current.unique_number) {
          const nextRound = cupService.getNextRound(current.unique_number);
          if (nextRound) {
            await cupService.clearAdvancement(current.unique_number, nextRound);
            await cupService.clearAdvancementCascade(current.unique_number);
            return { advanceMessage: "Doorstroming gewist na verwijderen scores" };
          }
        }
      } catch (clearErr) {
        console.error('❌ Error clearing advancement after scores cleared:', clearErr);
        // non-fatal: match update already succeeded
      }
    }

    return {};

  } catch (error) {
    console.error('Error in updateMatchForm:', error);
    throw error;
  }
};

export const lockMatchForm = async (matchId: number): Promise<void> => {
  try {
    const { data, error } = await supabase.rpc('update_match_for_session', {
      ...getRpcSessionArgs(),
      p_match_id: matchId,
      p_update_data: { is_locked: true },
    });

    if (error) {
      console.error('Error locking match:', error);
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) {
      throw new Error(result?.message || 'Kon wedstrijd niet vergrendelen');
    }
    
    if (!data || data.length === 0) {
      throw new Error("Geen toegang om deze wedstrijd te vergrendelen.");
    }
  } catch (error) {
    console.error('Error in lockMatchForm:', error);
    throw error;
  }
};
