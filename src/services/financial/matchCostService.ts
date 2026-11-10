import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionHeaders, getRpcSessionArgs } from "@/lib/authSession";
import { fetchAllMatchesForSession, fetchMatchForSession } from "@/services/core/matchesSessionFetch";
import { fetchCostsForSession } from "@/services/financial/costsSessionFetch";
import { fetchTeamTransactionsByTeamId } from "@/services/financial/financialTransactionsFetch";
import { fetchTeamsForSession } from "@/services/core/teamsSessionFetch";
import { isAdminMatchCostName } from "@/services/financial/teamCostCategories";

export { isAdminMatchCostName };

export interface TeamCostForMatchRow {
  id: number;
  team_id: number;
  cost_setting_id: number;
  match_id: number;
  amount: number;
  transaction_date: string;
  cost_name: string;
  cost_category: string;
  cost_default_amount: number;
}

/** Wedstrijdkosten/boetes voor één wedstrijd — sessie-RPC (werkt met connection pooling). */
export async function fetchTeamCostsForMatch(matchId: number): Promise<TeamCostForMatchRow[]> {
  const { data, error } = await supabase.rpc("get_team_costs_for_match", {
    ...getRpcSessionArgs(),
    p_match_id: matchId,
  });
  if (error) throw error;
  return (data as TeamCostForMatchRow[]) ?? [];
}

/**
 * Zelfde regels als DB public.cost_name_implies_match_cost_suppression.
 * Boete-typen waarvoor géén standaard wedstrijdkosten (veld/scheids/admin) horen.
 */
export function costNameImpliesMatchCostSuppression(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase().trim();
  if (!n) return false;
  return (
    n.includes("forfait") ||
    (n.includes("walk") && n.includes("over")) ||
    n.includes("vrijstelling") ||
    n.includes("niet gespeeld") ||
    n.includes("niet afgewerkt")
  );
}

/** Standaard snelknop-boete: «Forfait verwittigd» (€25), niet «tijdens de wedstrijd». */
export function findForfaitVerwittigdPenaltyCost<
  T extends { id: number; name?: string | null; amount?: number | string | null },
>(penalties: T[]): T | undefined {
  const forfaits = penalties.filter((cs) => costNameImpliesMatchCostSuppression(cs.name));
  const verwittigd = forfaits.find((cs) => (cs.name || "").toLowerCase().includes("verwittigd"));
  if (verwittigd) return verwittigd;

  const sortedForfaits = [...forfaits]
    .filter((cs) => (cs.name || "").toLowerCase().includes("forfait"))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "nl"));
  return sortedForfaits[1] ?? sortedForfaits[0];
}

/** Forfait vóór aanvang — geen wedstrijd gespeeld; scheidsrechter hoort niet toegewezen te blijven. */
export function costNameIsForfaitVerwittigd(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase().trim();
  return n.includes("forfait") && n.includes("verwittigd");
}

/** Reglement: forfait-uitslag is 10-0 voor de winnaar. */
export const FORFAIT_WIN_SCORE = 10;
export const FORFAIT_LOSE_SCORE = 0;

/** True bij reglementaire forfait-uitslag 10-0 of 0-10. */
export function isForfaitScore(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): boolean {
  if (homeScore == null || awayScore == null) return false;
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return false;
  return (
    (homeScore === FORFAIT_WIN_SCORE && awayScore === FORFAIT_LOSE_SCORE) ||
    (homeScore === FORFAIT_LOSE_SCORE && awayScore === FORFAIT_WIN_SCORE)
  );
}

/**
 * Uitslag bij forfait: verliezend team (boete) krijgt 0, tegenstander 10.
 * Thuis forfait → 0-10; uit forfait → 10-0.
 */
export function scoresForForfaitLoser(
  losingTeamId: number,
  homeTeamId: number,
  awayTeamId: number,
): { homeScore: number; awayScore: number } | null {
  if (losingTeamId === homeTeamId) {
    return { homeScore: FORFAIT_LOSE_SCORE, awayScore: FORFAIT_WIN_SCORE };
  }
  if (losingTeamId === awayTeamId) {
    return { homeScore: FORFAIT_WIN_SCORE, awayScore: FORFAIT_LOSE_SCORE };
  }
  return null;
}

/** Forfait-boete + uitslag botst alleen als de score géén reglementaire forfait-uitslag is. */
export function forfaitConflictsWithScores(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): boolean {
  if (homeScore == null || awayScore == null) return false;
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return false;
  return !isForfaitScore(homeScore, awayScore);
}

/** Matches DB public.match_has_forfait_penalty (via RPC + fallback). */
export async function matchHasForfaitPenalty(matchId: number): Promise<boolean> {
  if (!matchId) return false;

  const { data: rpcData, error: rpcError } = await supabase.rpc("match_has_forfait_penalty", {
    p_match_id: matchId,
  });
  if (!rpcError && typeof rpcData === "boolean") return rpcData;

  const rows = await fetchTeamCostsForMatch(matchId);
  return rows.some((row) => {
    if (row.cost_category !== "penalty") return false;
    return costNameImpliesMatchCostSuppression(row.cost_name);
  });
}

/** True wanneer admin handmatig standaard wedstrijdkosten heeft verwijderd — geen auto sync tot reset. */
export async function matchSkipAutoMatchCosts(matchId: number): Promise<boolean> {
  if (!matchId) return false;
  const match = await fetchMatchForSession(matchId);
  if (!match) return false;
  return (match as { skip_auto_match_costs?: boolean }).skip_auto_match_costs === true;
}

export async function clearSkipAutoMatchCostsForAdmin(matchId: number): Promise<{ success: boolean; message?: string }> {
  try {
    const authDataString = localStorage.getItem("auth_data");
    let userId: number | null = null;
    if (authDataString) {
      try {
        const authData = JSON.parse(authDataString);
        userId = authData?.user?.id ?? null;
      } catch {
        /* ignore */
      }
    }
    if (!userId) {
      return { success: false, message: "Niet ingelogd." };
    }
    const { data, error } = await supabase.rpc("admin_clear_skip_auto_match_costs_for_session", {
      ...getRpcSessionArgs(),
      p_match_id: matchId,
    });
    if (error) return { success: false, message: error.message };
    const result = data as { success?: boolean; error?: string } | null;
    if (result && result.success === false) {
      return { success: false, message: result.error || "Reset geweigerd" };
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Onbekende fout" };
  }
}

async function needsMatchCostBackfillCore(matchId: number): Promise<boolean> {
  const fieldCostId = await getActiveFieldMatchCostSettingId();
  if (!fieldCostId) return false;
  const rows = await fetchTeamCostsForMatch(matchId);
  const count = rows.filter((r) => r.cost_setting_id === fieldCostId).length;
  return count < 2;
}

async function needsAdminMatchCostBackfillCore(matchId: number): Promise<boolean> {
  const adminCostId = await getActiveAdminMatchCostSettingId();
  if (!adminCostId) return false;
  const rows = await fetchTeamCostsForMatch(matchId);
  const count = rows.filter((r) => r.cost_setting_id === adminCostId).length;
  return count < 2;
}

/**
 * Eén plek voor “mag sync-match-costs lopen na een wedstrijd-update?”.
 * Bij forfait: enkel admin-kosten syncen (veld/scheids vervallen).
 */
export async function shouldSyncMatchCostsAfterMatchUpdate(
  matchId: number,
  submissionTransition: boolean
): Promise<boolean> {
  if (!matchId) return false;
  if (await matchSkipAutoMatchCosts(matchId)) return false;
  if (await matchHasForfaitPenalty(matchId)) {
    return submissionTransition || (await needsAdminMatchCostBackfillCore(matchId));
  }
  return submissionTransition || (await needsMatchCostBackfillCore(matchId));
}

async function getActiveAdminMatchCostSettingId(): Promise<number | null> {
  const costRows = await fetchCostsForSession("match_cost");
  if (!costRows.length) return null;
  const adminRow = costRows.find((cs) => isAdminMatchCostName(cs.name));
  return adminRow?.id ?? null;
}

async function getActiveFieldMatchCostSettingId(): Promise<number | null> {
  const costRows = await fetchCostsForSession("match_cost");
  if (!costRows.length) return null;
  const fieldRow = costRows.find((cs) => {
    const n = (cs.name || "").toLowerCase();
    return n.includes("veld") || n.includes("field");
  });
  return fieldRow?.id ?? null;
}

/**
 * True wanneer er minder dan 2 veldkostenregels zijn voor deze wedstrijd (thuis + uit verwacht).
 * Gebruikt om ontbrekende sync na te laten lopen zonder bij elke wijziging kosten opnieuw op te bouwen
 * zolang beide veldlijnen aanwezig zijn.
 */
export async function needsMatchCostBackfill(matchId: number): Promise<boolean> {
  if (!matchId) return false;
  if (await matchSkipAutoMatchCosts(matchId)) return false;
  if (await matchHasForfaitPenalty(matchId)) {
    return needsAdminMatchCostBackfillCore(matchId);
  }
  return needsMatchCostBackfillCore(matchId);
}

export async function invokeSyncMatchCostsForMatch(params: {
  matchId: number;
  matchDateISO: string | null;
  homeTeamId: number;
  awayTeamId: number;
  isSubmitted: boolean;
  referee?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  try {
    if (await matchSkipAutoMatchCosts(params.matchId)) {
      return { success: true };
    }
    const { data, error } = await supabase.functions.invoke("sync-match-costs", {
      body: {
        matchId: params.matchId,
        matchDateISO: params.matchDateISO,
        homeTeamId: params.homeTeamId,
        awayTeamId: params.awayTeamId,
        isSubmitted: params.isSubmitted,
        referee: params.referee ?? null,
      },
      headers: getEdgeFunctionHeaders(),
    });
    if (error) return { success: false, message: error.message };
    if (data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success === false) {
      return { success: false, message: (data as { message?: string }).message };
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Unknown error" };
  }
}

interface ServiceResponse {
  success: boolean;
  message: string;
}

function mapPlayersForCardSync(players: unknown): { playerId: number | null; cardType?: string | null }[] {
  if (!Array.isArray(players)) return [];
  return players.map((p) => {
    const row = p as { playerId?: number | null; cardType?: string | null };
    return { playerId: row?.playerId ?? null, cardType: row?.cardType ?? null };
  });
}

export const matchCostService = {
  /** Sync kaartboetes (geel/rood) voor alle ingediende wedstrijden met kaarten in het formulier. */
  async syncAllCardPenalties(): Promise<ServiceResponse & { syncedMatches?: number }> {
    try {
      const allMatches = await fetchAllMatchesForSession();
      const matchesWithCards = allMatches.filter((m) => {
        if (!m.is_submitted || m.home_team_id == null || m.away_team_id == null) return false;
        const homePlayers = mapPlayersForCardSync(m.home_players);
        const awayPlayers = mapPlayersForCardSync(m.away_players);
        return [...homePlayers, ...awayPlayers].some(
          (p) => p.cardType && p.cardType !== "none",
        );
      });

      const CARD_SYNC_CONCURRENCY = 2;
      let syncedMatches = 0;

      for (let i = 0; i < matchesWithCards.length; i += CARD_SYNC_CONCURRENCY) {
        const batch = matchesWithCards.slice(i, i + CARD_SYNC_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (m) => {
            const homePlayers = mapPlayersForCardSync(m.home_players);
            const awayPlayers = mapPlayersForCardSync(m.away_players);
            const { data, error: fnError } = await supabase.functions.invoke("sync-card-penalties", {
              body: {
                matchId: m.match_id,
                matchDateISO: m.match_date,
                homeTeamId: m.home_team_id,
                awayTeamId: m.away_team_id,
                homePlayers,
                awayPlayers,
              },
              headers: getEdgeFunctionHeaders(),
            });
            return !fnError && data?.success;
          }),
        );
        syncedMatches += results.filter(Boolean).length;
      }

      return {
        success: true,
        message: `Kaartboetes gesynchroniseerd voor ${syncedMatches} wedstrijd(en)`,
        syncedMatches,
      };
    } catch (error) {
      return {
        success: false,
        message: `Fout bij synchroniseren kaartboetes: ${error instanceof Error ? error.message : "Onbekende fout"}`,
      };
    }
  },

  // Sync all submitted matches to ensure they have costs (including cup and playoff)
  async syncAllMatchCosts(): Promise<ServiceResponse & { syncedCount?: number; updatedCount?: number; skippedCount?: number }> {
    console.log('🔵 [matchCostService] ========== START syncAllMatchCosts ==========');
    
    try {
      // Use Edge Function with service role to bypass RLS
      const { data, error } = await supabase.functions.invoke('sync-all-match-costs', {
        body: {},
        headers: getEdgeFunctionHeaders(),
      });

      if (error) {
        console.error('❌ [matchCostService] Edge function error:', error);
        throw error;
      }

      if (data && data.success) {
        console.log('✅ [matchCostService] Sync completed via Edge Function');
        console.log('🔵 [matchCostService] ========== END syncAllMatchCosts ==========');
        return {
          success: true,
          message: data.message || 'Synchronisatie voltooid',
          syncedCount: data.syncedCount || 0,
          updatedCount: data.updatedCount || 0,
          skippedCount: data.skippedCount || 0
        };
      } else {
        throw new Error(data?.message || 'Unknown error from Edge Function');
      }
    } catch (error) {
      console.error('❌ [matchCostService] FATAL ERROR:', error);
      console.log('🔵 [matchCostService] ========== END syncAllMatchCosts (ERROR) ==========');
      return { 
        success: false, 
        message: `Onverwachte fout bij synchroniseren: ${error instanceof Error ? error.message : 'Onbekende fout'}` 
      };
    }
  },


  // Apply per-match costs (e.g., field/referee) to both teams if not already applied
  async applyCostsForMatch(matchId: number): Promise<ServiceResponse> {
    console.log('🔵 [matchCostService] ========== START applyCostsForMatch ==========');
    console.log('🔵 [matchCostService] Match ID:', matchId);
    
    try {
      if (!matchId || isNaN(matchId)) {
        console.error('❌ [matchCostService] Invalid match ID:', matchId);
        return { success: false, message: "Ongeldige wedstrijd ID" };
      }
      console.log('✅ [matchCostService] Match ID validated');

      // Fetch match info
      console.log('🔵 [matchCostService] Fetching match info from database...');
      const match = await fetchMatchForSession(matchId);
      if (!match) {
        console.error('❌ [matchCostService] Failed to fetch match');
        return { success: false, message: 'Kon wedstrijd niet ophalen' };
      }
      console.log('✅ [matchCostService] Match fetched:', {
        match_id: match.match_id,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        is_submitted: match.is_submitted,
        home_score: match.home_score,
        away_score: match.away_score
      });

      // Only apply costs if match has scores and is submitted
      if (!match.is_submitted || match.home_score === null || match.away_score === null) {
        console.log('🔵 [matchCostService] Skipping costs - match not completed or no scores');
        return { success: true, message: 'Kosten niet toegepast - wedstrijd heeft nog geen scores' };
      }
      console.log('✅ [matchCostService] Match is completed with scores, proceeding...');

      const teamIds: number[] = [match.home_team_id, match.away_team_id].filter((id: any) => typeof id === 'number');
      if (teamIds.length === 0) {
        console.error('❌ [matchCostService] No valid team IDs found');
        return { success: false, message: 'Geen teams gevonden voor deze wedstrijd' };
      }
      console.log('✅ [matchCostService] Team IDs:', teamIds);

      // If any team_costs already exist for this match, skip to keep idempotent
      console.log('🔵 [matchCostService] Checking for existing costs...');
      const existingCosts = await fetchTeamCostsForMatch(matchId);
      if (existingCosts.length > 0) {
        console.log('🔵 [matchCostService] Costs already exist for this match, skipping');
        return { success: true, message: 'Kosten reeds toegepast voor deze wedstrijd' };
      }
      console.log('✅ [matchCostService] No existing costs found, proceeding to add costs');

      // Fetch active match_cost settings (e.g., field cost, referee cost)
      console.log('🔵 [matchCostService] Fetching active cost settings...');
      const costSettings = await fetchCostsForSession('match_cost');
      if (costSettings.length === 0) {
        console.log('🔵 [matchCostService] No active match costs found');
        return { success: true, message: 'Geen actieve wedstrijdkosten gevonden' };
      }
      console.log('✅ [matchCostService] Cost settings fetched:', costSettings.map(cs => ({ id: cs.id, name: cs.name, amount: cs.amount })));

      const transactionDate = match.match_date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      console.log('🔵 [matchCostService] Transaction date:', transactionDate);

      // Build rows to insert for each team and each cost setting
      console.log('🔵 [matchCostService] Building cost rows to insert...');
      const rows: any[] = [];
      for (const teamId of teamIds) {
        for (const cs of costSettings) {
          rows.push({
            team_id: teamId,
            cost_setting_id: cs.id,
            amount: cs.amount ?? 0,
            transaction_date: transactionDate,
            match_id: matchId,
          });
        }
      }
      console.log('✅ [matchCostService] Built', rows.length, 'cost rows:', rows);

      if (rows.length === 0) {
        console.log('🔵 [matchCostService] No rows to insert');
        return { success: true, message: 'Geen kosten om toe te passen' };
      }

      console.log('🔵 [matchCostService] INSERTING COSTS via add_team_cost_for_session...');
      for (const row of rows) {
        const { data: insertResult, error: insertErr } = await supabase.rpc('add_team_cost_for_session', {
          ...getRpcSessionArgs(),
          p_team_id: row.team_id,
          p_cost_setting_id: row.cost_setting_id,
          p_amount: row.amount,
          p_transaction_date: row.transaction_date,
          p_match_id: row.match_id,
        });
        if (insertErr) {
          console.error('❌ [matchCostService] INSERT FAILED:', insertErr);
          return { success: false, message: `Fout bij toepassen kosten: ${insertErr.message}` };
        }
        if ((insertResult as { success?: boolean })?.success === false) {
          return {
            success: false,
            message: (insertResult as { error?: string })?.error || 'Fout bij toepassen kosten',
          };
        }
      }

      console.log('✅ [matchCostService] Costs inserted successfully');
      console.log('🔵 [matchCostService] ========== END applyCostsForMatch ==========');
      return { success: true, message: 'Kosten automatisch toegepast' };
    } catch (error) {
      console.error('❌ [matchCostService] FATAL ERROR:', error);
      console.error('❌ [matchCostService] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Onbekende fout',
        stack: error instanceof Error ? error.stack : undefined
      });
      console.log('🔵 [matchCostService] ========== END applyCostsForMatch (ERROR) ==========');
      return { success: false, message: `Onverwachte fout bij toepassen kosten: ${error instanceof Error ? error.message : 'Onbekende fout'}` };
    }
  },

  // Diagnostic function to check missing costs for a specific team
  async diagnoseTeamMissingCosts(teamName: string, targetDates?: string[]): Promise<{
    success: boolean;
    message: string;
    teamId?: number;
    matchesWithScores?: any[];
    matchesWithCosts?: any[];
    missingMatches?: any[];
  }> {
    console.log('🔍 [matchCostService] ========== START diagnoseTeamMissingCosts ==========');
    console.log('🔍 [matchCostService] Team name:', teamName);
    console.log('🔍 [matchCostService] Target dates:', targetDates);
    
    try {
      // Find team by name
      const teams = await fetchTeamsForSession();
      const team = teams.find((t) =>
        t.team_name.toLowerCase().includes(teamName.toLowerCase()),
      );
      if (!team) {
        console.error('❌ [matchCostService] Team not found');
        return { success: false, message: `Team "${teamName}" niet gevonden` };
      }

      console.log('✅ [matchCostService] Team found:', team);

      // Find all matches for this team with scores
      let matchesWithScores = (await fetchAllMatchesForSession()).filter(
        (m) =>
          (m.home_team_id === team.team_id || m.away_team_id === team.team_id) &&
          m.home_score != null &&
          m.away_score != null,
      );

      if (targetDates && targetDates.length > 0) {
        const parsedDates = targetDates.map((dateStr) => {
          const parts = dateStr.split('-');
          if (parts.length === 3 && parts[0].length === 2) {
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
          return new Date(dateStr);
        });

        matchesWithScores = matchesWithScores.filter((match) => {
          const matchDate = new Date(match.match_date);
          return parsedDates.some((date) => {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            return matchDate >= startOfDay && matchDate <= endOfDay;
          });
        });
      }

      matchesWithScores.sort((a, b) => a.match_date.localeCompare(b.match_date));

      console.log(`✅ [matchCostService] Found ${matchesWithScores?.length || 0} matches with scores for ${team.team_name}`);

      // Find all costs for this team
      const teamCosts = await fetchTeamTransactionsByTeamId(team.team_id);
      const matchIdsWithCosts = new Set(
        teamCosts
          .filter((tc) => tc.match_id && tc.cost_settings?.category === 'match_cost')
          .map((tc) => tc.match_id as number),
      );

      console.log(`✅ [matchCostService] Found ${matchIdsWithCosts.size} unique matches with costs`);

      // Find matches that have scores but no costs
      const missingMatches = (matchesWithScores || []).filter(match => !matchIdsWithCosts.has(match.match_id));

      console.log(`⚠️ [matchCostService] Found ${missingMatches.length} matches with scores but no costs`);

      if (missingMatches.length > 0) {
        console.log('📋 [matchCostService] Missing matches:');
        missingMatches.forEach(match => {
          const matchDate = match.match_date ? new Date(match.match_date).toLocaleDateString('nl-NL') : 'Unknown';
          const matchType = match.is_cup_match ? 'beker' : match.is_playoff_match ? 'play-off' : 'competitie';
          console.log(`  - Match ${match.match_id} (${matchType}): ${matchDate}, unique: ${match.unique_number}, submitted: ${match.is_submitted}`);
        });
      }

      return {
        success: true,
        message: `Diagnose voltooid: ${missingMatches.length} wedstrijden zonder kosten gevonden`,
        teamId: team.team_id,
        matchesWithScores: matchesWithScores || [],
        matchesWithCosts: Array.from(matchIdsWithCosts),
        missingMatches: missingMatches
      };
    } catch (error) {
      console.error('❌ [matchCostService] FATAL ERROR in diagnose:', error);
      return {
        success: false,
        message: `Onverwachte fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`
      };
    }
  }
};


