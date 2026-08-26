// Cards & Suspensions Domain - Suspension Service
// Moved from src/services/suspensionService.ts

import { supabase } from "@/integrations/supabase/client";
import { suspensionRulesService } from "./suspensionRulesService";
import { getRpcSessionArgs } from "@/lib/authSession";
import {
  deleteApplicationSettingForSession,
  insertApplicationSettingForSession,
  listApplicationSettingsForSession,
  updateApplicationSettingForSession,
} from "@/services/core/applicationSettingsSessionFetch";
import {
  fetchAllMatchesForSession,
  fetchMatchesWithPlayersForCardHistory,
  fetchTeamScheduleForSuspensions,
} from "@/services/core/matchesSessionFetch";
import { fetchPlayersForSession } from "@/services/core/playersSessionFetch";
import { fetchTeamsForSession } from "@/services/core/teamsSessionFetch";
import { derivePlayerSuspensionEpisodes } from "../utils/playerSuspensionHistory";
import {
  resolveSuspensionMatchesAfterCard,
  type CardSuspensionTrigger,
} from "../utils/suspensionMatchSchedule";

const AUTOMATIC_SUSPENSION_OVERRIDE_CATEGORY = 'automatic_suspension_overrides' as const;

export interface PlayerCard {
  playerId: number;
  playerName: string;
  teamName: string;
  teamId?: number;
  yellowCards: number;
  redCards: number;
  suspendedMatches?: number;
  cardEvents?: PlayerCardEvent[];
  /** Afgeleide schorsingshistoriek uit kaarten + wedstrijdkalender (ook afgelopen). */
  suspensionEpisodes?: Suspension[];
}

export interface PlayerCardEvent {
  id: string;
  matchId: number;
  matchDate: string;
  opponent: string;
  teamName: string;
  cardType: 'yellow' | 'red';
  competitionType: 'competitie' | 'beker' | 'playoff';
  uniqueNumber?: string;
}

export type AutomaticSuspensionKind = 'yellow' | 'red';

export interface AutomaticSuspensionOverrideRow {
  id: number;
  notes: string;
  matches_override: number | null;
  reason_override: string | null;
}

export interface Suspension {
  id: string;
  playerId: number;
  playerName: string;
  teamName: string;
  teamId?: number;
  source: 'automatic' | 'manual';
  manualSuspensionId?: number;
  /** Automatische schorsing: subtype + rij-id in application_settings (optioneel) */
  automaticKind?: AutomaticSuspensionKind;
  automaticOverrideId?: number;
  /** Waarden volgens kaartregels vóór admin-aanpassing */
  baselineReason?: string;
  baselineMatches?: number;
  reason: string;
  matches: number;
  status: 'active' | 'pending' | 'completed';
  cardDate?: string; // Datum waarop de kaart is gegeven
  startDate?: string;
  endDate?: string;
  notes?: string;
  suspendedForMatch?: {
    date: string;
    opponent: string;
  };
  suspendedForMatches?: Array<{
    date: string;
    opponent: string;
  }>;
}

export interface ManualSuspension {
  id: number;
  playerId: number;
  reason: string;
  matches: number;
  startDate: string;
  endDate: string;
  notes?: string;
  type: string;
  isActive: boolean;
  createdAt: string;
}

export const suspensionService = {
  async getPlayerCards(): Promise<PlayerCard[]> {
    try {
      // Get user ID from localStorage for RPC call
      const authDataString = localStorage.getItem('auth_data');
      const userId = authDataString ? JSON.parse(authDataString)?.user?.id : null;
      
      if (!userId) {
        console.error('No user ID found for player cards fetch');
        return [];
      }
      
      // Use SECURITY DEFINER RPC for reliable admin/manager access
      const { data, error } = await supabase.rpc('get_player_cards_for_admin', getRpcSessionArgs());

      if (error) {
        console.error('Error fetching player cards via RPC:', error);
        throw error;
      }

      const playerCards = (data || []).map((player: any) => ({
        playerId: player.player_id,
        playerName: `${player.first_name} ${player.last_name}`,
        teamName: player.team_name || 'Onbekend Team',
        teamId: player.team_id,
        yellowCards: player.yellow_cards || 0,
        redCards: player.red_cards || 0,
        suspendedMatches: player.suspended_matches_remaining || 0
      }));

      const teamIds = [
        ...new Set(
          playerCards
            .map((player) => player.teamId)
            .filter((id): id is number => typeof id === "number" && id > 0),
        ),
      ];

      const [scheduleMatches, cardHistoryMatches] = await Promise.all([
        fetchTeamScheduleForSuspensions(teamIds),
        fetchMatchesWithPlayersForCardHistory(teamIds),
      ]);
      const events = await suspensionService.getPlayerCardEvents(
        playerCards.map((player) => player.playerId),
        teamIds,
        cardHistoryMatches,
      );
      const rules = await suspensionRulesService.getSuspensionRules();
      const eventsByPlayerId = new Map<number, PlayerCardEvent[]>();
      events.forEach((event) => {
        const currentEvents = eventsByPlayerId.get(event.playerId) || [];
        currentEvents.push(event);
        eventsByPlayerId.set(event.playerId, currentEvents);
      });

      return playerCards.map((player) => {
        const cardEvents = eventsByPlayerId.get(player.playerId) || [];
        const card: PlayerCard = {
          ...player,
          // RPC-totalen blijven bron voor drempels/schorsingen; events alleen voor wedstrijdhistoriek
          cardEvents,
        };

        return {
          ...card,
          suspensionEpisodes: derivePlayerSuspensionEpisodes(card, rules, scheduleMatches),
        };
      });
    } catch (error) {
      console.error('Error in getPlayerCards:', error);
      return [];
    }
  },

  async getPlayerCardEvents(
    playerIds: number[] = [],
    teamIds: number[] = [],
    prefetchedMatches?: Awaited<ReturnType<typeof fetchMatchesWithPlayersForCardHistory>>,
  ): Promise<Array<PlayerCardEvent & { playerId: number }>> {
    if (playerIds.length === 0) return [];

    try {
      const playerIdSet = new Set(playerIds);
      const allMatches =
        prefetchedMatches ?? (await fetchMatchesWithPlayersForCardHistory(teamIds));
      const data = allMatches;

      const normalizeCardType = (raw: unknown): 'yellow' | 'red' | 'double_yellow' | 'none' => {
        const value = (typeof raw === 'string' ? raw : '').toLowerCase();
        if (value === 'yellow' || value === 'geel') return 'yellow';
        if (value === 'red' || value === 'rood') return 'red';
        if (value === 'double_yellow' || value === '2x geel' || value === 'double-yellow') return 'double_yellow';
        return 'none';
      };

      const normalizePlayers = (rawPlayers: unknown): any[] => {
        if (Array.isArray(rawPlayers)) return rawPlayers;

        if (typeof rawPlayers === 'string') {
          try {
            const parsed = JSON.parse(rawPlayers);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }

        if (rawPlayers && typeof rawPlayers === 'object') {
          const maybePlayers = rawPlayers as { players?: unknown; data?: unknown; items?: unknown };
          if (Array.isArray(maybePlayers.players)) return maybePlayers.players;
          if (Array.isArray(maybePlayers.data)) return maybePlayers.data;
          if (Array.isArray(maybePlayers.items)) return maybePlayers.items;
        }

        return [];
      };

      const getPlayerId = (player: any): number | undefined => {
        const id = player?.playerId ?? player?.player_id ?? player?.id;
        return typeof id === 'number' ? id : Number(id) || undefined;
      };

      const getCompetitionType = (match: typeof allMatches[number]): PlayerCardEvent['competitionType'] => {
        if (match.is_playoff_match) return 'playoff';
        if (match.is_cup_match) return 'beker';
        return 'competitie';
      };

      const events: Array<PlayerCardEvent & { playerId: number }> = [];

      const pushEvent = (
        match: typeof allMatches[number],
        playerId: number,
        teamName: string,
        opponent: string,
        cardType: 'yellow' | 'red',
        cardIndex: number,
      ) => {
        const matchDate = match.match_date ?? "";
        events.push({
          id: `${match.match_id}-${playerId}-${cardType}-${cardIndex}`,
          playerId,
          matchId: match.match_id,
          matchDate,
          opponent,
          teamName,
          cardType,
          competitionType: getCompetitionType(match),
          uniqueNumber: match.unique_number || undefined,
        });
      };

      for (const match of data) {
        const homeTeamName = match.home_team_name || 'Onbekend';
        const awayTeamName = match.away_team_name || 'Onbekend';

        const handlePlayers = (players: any[], teamName: string, opponent: string) => {
          players.forEach((player, index) => {
            const playerId = getPlayerId(player);
            if (!playerId || !playerIdSet.has(playerId)) return;

            const normalized = normalizeCardType(player?.cardType ?? player?.card ?? player?.card_type ?? player?.kaart);
            if (normalized === 'yellow') {
              pushEvent(match, playerId, teamName, opponent, 'yellow', index);
            } else if (normalized === 'red') {
              pushEvent(match, playerId, teamName, opponent, 'red', index);
            } else if (normalized === 'double_yellow') {
              pushEvent(match, playerId, teamName, opponent, 'yellow', index);
              pushEvent(match, playerId, teamName, opponent, 'yellow', index + 1000);
            }
          });
        };

        handlePlayers(normalizePlayers(match.home_players), homeTeamName, awayTeamName);
        handlePlayers(normalizePlayers(match.away_players), awayTeamName, homeTeamName);
      }

      return events.sort((a, b) => b.matchDate.localeCompare(a.matchDate));
    } catch (error) {
      console.error('Error in getPlayerCardEvents:', error);
      return [];
    }
  },

  async checkPlayerEligibility(playerId: number, matchDate: Date): Promise<boolean> {
    // Minimal-change caching & inflight dedupe to avoid RPC flood
    // Cache key: playerId + exact ISO timestamp
    const cacheKey = `${playerId}|${matchDate.toISOString()}`;
    const now = Date.now();
    const TTL_MS = 5 * 60 * 1000; // Extended to 5 minutes for better performance

    // Lazy init singletons on the service object to avoid global state
    // @ts-ignore - attach non-enumerable fields for cache
    if (!suspensionService.__eligibilityCache) {
      // @ts-ignore
      suspensionService.__eligibilityCache = new Map<string, { value: boolean; ts: number }>();
    }
    // @ts-ignore
    const cache: Map<string, { value: boolean; ts: number }> = suspensionService.__eligibilityCache;

    // @ts-ignore
    if (!suspensionService.__eligibilityInflight) {
      // @ts-ignore
      suspensionService.__eligibilityInflight = new Map<string, Promise<boolean>>();
    }
    // @ts-ignore
    const inflight: Map<string, Promise<boolean>> = suspensionService.__eligibilityInflight;

    // Serve from cache if fresh
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return cached.value;
    }

    // Deduplicate concurrent calls
    const existing = inflight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const { data, error } = await supabase.rpc('is_player_suspended', {
          ...getRpcSessionArgs(),
          player_id_param: playerId,
          match_date_param: matchDate.toISOString()
        });

        if (error) {
          console.error('Error checking player eligibility:', error);
          return false;
        }

        let value = !data; // true if NOT suspended

        // Date-refine automatic suspensions (same as batch)
        try {
          const matchDateKey = (() => {
            const y = matchDate.getUTCFullYear();
            const m = String(matchDate.getUTCMonth() + 1).padStart(2, "0");
            const d = String(matchDate.getUTCDate()).padStart(2, "0");
            return `${y}-${m}-${d}`;
          })();
          const active = await suspensionService.getActiveSuspensions();
          const mine = active.filter((s) => s.playerId === playerId);
          for (const s of mine) {
            const dates = s.suspendedForMatches?.map((m) => m.date) || [];
            if (dates.length > 0) {
              value = !dates.includes(matchDateKey);
            } else if ((s.matches ?? 0) > 0) {
              value = false;
            }
          }
        } catch {
          /* keep RPC value */
        }

        cache.set(cacheKey, { value, ts: Date.now() });
        return value;
      } catch (error) {
        console.error('Error in checkPlayerEligibility:', error);
        return false;
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, promise);
    return promise;
  },

  // New batch function to check multiple players at once - significantly reduces DB calls
  async checkBatchPlayerEligibility(playerIds: number[], matchDate: Date): Promise<Record<number, boolean>> {
    if (!playerIds.length) return {};

    const batchCacheKey = `batch_${playerIds.sort().join(',')}_${matchDate.toISOString()}`;
    const now = Date.now();
    const TTL_MS = 5 * 60 * 1000; // 5 minutes cache

    // Initialize batch cache if needed
    // @ts-ignore
    if (!suspensionService.__batchEligibilityCache) {
      // @ts-ignore
      suspensionService.__batchEligibilityCache = new Map<string, { value: Record<number, boolean>; ts: number }>();
    }
    // @ts-ignore
    const batchCache: Map<string, { value: Record<number, boolean>; ts: number }> = suspensionService.__batchEligibilityCache;

    // Check cache first
    const cached = batchCache.get(batchCacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return cached.value;
    }

    try {
      const { data, error } = await supabase.rpc('check_batch_players_suspended', {
        ...getRpcSessionArgs(),
        player_ids: playerIds,
        match_date_param: matchDate.toISOString()
      });

      if (error) {
        console.error('Error checking batch player eligibility:', error);
        // Fallback to individual calls on error
        const result: Record<number, boolean> = {};
        for (const playerId of playerIds) {
          result[playerId] = await this.checkPlayerEligibility(playerId, matchDate);
        }
        return result;
      }

      // Convert array result to object: playerId -> isEligible (NOT suspended)
      const result: Record<number, boolean> = {};
      if (data && Array.isArray(data)) {
        data.forEach((row: any) => {
          result[row.player_id] = !row.is_suspended; // true if NOT suspended
        });
      }

      // Fill in any missing players as eligible (fallback)
      playerIds.forEach(id => {
        if (!(id in result)) {
          result[id] = true;
        }
      });

      // Enrich with calendar dates of automatic suspensions.
      // DB RPC blocks ANY date when remaining > 0; refine to next N team matches only
      // when suspendedForMatches is known (so match N+2 stays selectable while serving N+1).
      try {
        const matchDateKey = (() => {
          const y = matchDate.getUTCFullYear();
          const m = String(matchDate.getUTCMonth() + 1).padStart(2, '0');
          const d = String(matchDate.getUTCDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        })();

        const activeSuspensions = await suspensionService.getActiveSuspensions();
        for (const s of activeSuspensions) {
          if (!playerIds.includes(s.playerId)) continue;
          const dates = s.suspendedForMatches?.map((m) => m.date) || [];
          if (dates.length > 0) {
            result[s.playerId] = !dates.includes(matchDateKey);
          } else if ((s.matches ?? 0) > 0 || !result[s.playerId]) {
            result[s.playerId] = false;
          }
        }
      } catch (e) {
        console.warn('Could not enrich eligibility with automatic suspensions:', e);
      }

      // Cache the result
      batchCache.set(batchCacheKey, { value: result, ts: now });
      return result;
      
    } catch (error) {
      console.error('Error in checkBatchPlayerEligibility:', error);
      // Fallback: return all as eligible to avoid blocking UI
      const fallbackResult: Record<number, boolean> = {};
      playerIds.forEach(id => fallbackResult[id] = true);
      return fallbackResult;
    }
  },

  async applySuspension(playerId: number, reason: string, matches: number, notes?: string): Promise<void> {
    try {
      await insertApplicationSettingForSession({
        setting_category: 'manual_suspensions',
        setting_name: playerId.toString(),
        setting_value: {
          reason,
          matches,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + (matches * 7 * 24 * 60 * 60 * 1000)).toISOString(),
          notes,
          type: 'manual',
        },
      });
    } catch (error) {
      console.error('Error in applySuspension:', error);
      throw error;
    }
  },

  async getManualSuspensions(): Promise<ManualSuspension[]> {
    try {
      const data = await listApplicationSettingsForSession('manual_suspensions');

      return [...data]
        .sort((a, b) => b.id - a.id)
        .map((suspension) => {
          const settingValue = suspension.setting_value as any;
          return {
            id: suspension.id,
            playerId: parseInt(suspension.setting_name),
            reason: settingValue?.reason || '',
            matches: settingValue?.matches || 0,
            startDate: settingValue?.start_date || '',
            endDate: settingValue?.end_date || '',
            notes: settingValue?.notes || '',
            type: settingValue?.type || 'manual',
            isActive: true,
            createdAt: settingValue?.start_date || '',
          };
        });
    } catch (error) {
      console.error('Error in getManualSuspensions:', error);
      return [];
    }
  },

  async updateSuspension(suspensionId: number, updates: any): Promise<void> {
    try {
      const rows = await listApplicationSettingsForSession('manual_suspensions');
      const current = rows.find((row) => row.id === suspensionId);

      if (!current) {
        throw new Error('Suspension not found');
      }

      if (updates.isActive === false) {
        await this.deleteSuspension(suspensionId);
        return;
      }

      const { isActive, ...settingValueUpdates } = updates;
      void isActive;
      const nextSettingValue = {
        ...((current.setting_value as Record<string, unknown>) || {}),
        ...settingValueUpdates,
      };

      await updateApplicationSettingForSession(suspensionId, {
        setting_value: nextSettingValue,
        setting_category: 'manual_suspensions',
      });
    } catch (error) {
      console.error('Error in updateSuspension:', error);
      throw error;
    }
  },

  async deleteSuspension(suspensionId: number): Promise<void> {
    try {
      await deleteApplicationSettingForSession(suspensionId, 'manual_suspensions');
    } catch (error) {
      console.error('Error in deleteSuspension:', error);
      throw error;
    }
  },

  async getAutomaticSuspensionOverridesMap(): Promise<Map<string, AutomaticSuspensionOverrideRow>> {
    try {
      const data = await listApplicationSettingsForSession(AUTOMATIC_SUSPENSION_OVERRIDE_CATEGORY);

      const map = new Map<string, AutomaticSuspensionOverrideRow>();
      for (const row of data) {
        const key = String(row.setting_name);
        const v = row.setting_value as {
          notes?: string;
          matches_override?: number | null;
          reason_override?: string | null;
        } | null;
        map.set(key, {
          id: row.id,
          notes: (v?.notes ?? '').trim(),
          matches_override:
            typeof v?.matches_override === 'number' && v.matches_override >= 1
              ? Math.floor(v.matches_override)
              : null,
          reason_override:
            typeof v?.reason_override === 'string' && v.reason_override.trim()
              ? v.reason_override.trim()
              : null,
        });
      }
      return map;
    } catch (error) {
      console.error('Error in getAutomaticSuspensionOverridesMap:', error);
      return new Map();
    }
  },

  async upsertAutomaticSuspensionOverride(
    playerId: number,
    kind: AutomaticSuspensionKind,
    payload: {
      notes: string;
      matches_override: number | null;
      reason_override: string | null;
    }
  ): Promise<void> {
    const setting_name = `${playerId}:${kind}`;
    const rows = await listApplicationSettingsForSession(AUTOMATIC_SUSPENSION_OVERRIDE_CATEGORY);
    const existing = rows.find((row) => row.setting_name === setting_name);

    const setting_value = {
      notes: payload.notes.trim(),
      matches_override: payload.matches_override,
      reason_override: payload.reason_override,
    };

    if (existing?.id) {
      await updateApplicationSettingForSession(existing.id, { setting_value });
    } else {
      await insertApplicationSettingForSession({
        setting_category: AUTOMATIC_SUSPENSION_OVERRIDE_CATEGORY,
        setting_name,
        setting_value,
      });
    }
  },

  async deleteAutomaticSuspensionOverride(
    playerId: number,
    kind: AutomaticSuspensionKind
  ): Promise<void> {
    const setting_name = `${playerId}:${kind}`;
    const rows = await listApplicationSettingsForSession(AUTOMATIC_SUSPENSION_OVERRIDE_CATEGORY);
    const existing = rows.find((row) => row.setting_name === setting_name);
    if (existing?.id) {
      await deleteApplicationSettingForSession(existing.id, AUTOMATIC_SUSPENSION_OVERRIDE_CATEGORY);
    }
  },

  async getUpcomingMatches(playerId: number): Promise<any[]> {
    try {
      const now = new Date().toISOString();
      const allMatches = await fetchAllMatchesForSession();
      const data = allMatches
        .filter(
          (match) =>
            (match.home_team_id === playerId || match.away_team_id === playerId) &&
            match.match_date >= now &&
            !match.is_submitted,
        )
        .sort((a, b) => a.match_date.localeCompare(b.match_date))
        .slice(0, 10);

      return data.map((match) => ({
        match_id: match.match_id,
        match_date: match.match_date,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        location: match.location,
        is_cup_match: match.is_cup_match,
        teams: { team_name: match.home_team_name },
        teams_away: { team_name: match.away_team_name },
      }));
    } catch (error) {
      console.error('Error in getUpcomingMatches:', error);
      return [];
    }
  },

  async getActiveSuspensions(playerCardsInput?: PlayerCard[]): Promise<Suspension[]> {
    try {
      const playerCards = playerCardsInput ?? await suspensionService.getPlayerCards();
      const suspensions: Suspension[] = [];

      // Get dynamic suspension rules
      const rules = await suspensionRulesService.getSuspensionRules();

      const teamIds = [
        ...new Set(
          playerCards
            .map((player) => player.teamId)
            .filter((id): id is number => typeof id === "number" && id > 0),
        ),
      ];

      const [scheduleMatches, cardHistoryMatches] = await Promise.all([
        fetchTeamScheduleForSuspensions(teamIds),
        fetchMatchesWithPlayersForCardHistory(teamIds),
      ]);
      const allMatchesFetched = scheduleMatches;
      const matchesData = cardHistoryMatches.filter((m) => m.is_submitted);
      const allMatchesData = [...scheduleMatches].sort((a, b) =>
        a.match_date.localeCompare(b.match_date),
      );

      const normalizeCardType = (raw: unknown): 'yellow' | 'red' | 'double_yellow' | 'none' => {
        const value = (typeof raw === 'string' ? raw : '').toLowerCase();
        if (value === 'yellow' || value === 'geel') return 'yellow';
        if (value === 'red' || value === 'rood') return 'red';
        if (value === 'double_yellow' || value === '2x geel' || value === 'double-yellow') return 'double_yellow';
        return 'none';
      };

      const normalizePlayers = (rawPlayers: unknown): any[] => {
        if (Array.isArray(rawPlayers)) return rawPlayers;
        if (typeof rawPlayers === 'string') {
          try {
            const parsed = JSON.parse(rawPlayers);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        if (rawPlayers && typeof rawPlayers === 'object') {
          const maybePlayers = rawPlayers as { players?: unknown; data?: unknown; items?: unknown };
          if (Array.isArray(maybePlayers.players)) return maybePlayers.players;
          if (Array.isArray(maybePlayers.data)) return maybePlayers.data;
          if (Array.isArray(maybePlayers.items)) return maybePlayers.items;
        }
        return [];
      };

      const getPlayerIdFromMatchPlayer = (player: any): number | undefined => {
        const id = player?.playerId ?? player?.player_id ?? player?.id;
        return typeof id === 'number' ? id : Number(id) || undefined;
      };

      const matchToDateKey = (matchDate: string): string => {
        const date = new Date(matchDate);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const lastCardDateByPlayer = new Map<string, string>();
      const setLastCardDate = (playerId: number, cardType: 'yellow' | 'red', matchDate: string) => {
        const key = `${playerId}:${cardType}`;
        const existing = lastCardDateByPlayer.get(key);
        if (!existing || matchDate > existing) {
          lastCardDateByPlayer.set(key, matchDate);
        }
      };

      for (const match of matchesData || []) {
        const matchDate = match.match_date ? new Date(match.match_date).toISOString() : undefined;
        if (!matchDate) continue;

        const handlePlayers = (players: any[]) => {
          players.forEach((p) => {
            const playerId = getPlayerIdFromMatchPlayer(p);
            if (!playerId) return;
            const normalized = normalizeCardType(p?.cardType ?? p?.card ?? p?.card_type ?? p?.kaart);
            if (normalized === 'yellow' || normalized === 'double_yellow') {
              setLastCardDate(playerId, 'yellow', matchDate);
            }
            if (normalized === 'red') {
              setLastCardDate(playerId, 'red', matchDate);
            }
          });
        };

        handlePlayers(normalizePlayers(match.home_players));
        handlePlayers(normalizePlayers(match.away_players));
      }

      const matchesByTeamId = new Map<number, any[]>();
      for (const match of allMatchesData || []) {
        const homeMatches = matchesByTeamId.get(match.home_team_id) || [];
        homeMatches.push(match);
        matchesByTeamId.set(match.home_team_id, homeMatches);

        const awayMatches = matchesByTeamId.get(match.away_team_id) || [];
        awayMatches.push(match);
        matchesByTeamId.set(match.away_team_id, awayMatches);
      }

      const today = new Date();
      const todayDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
      ].join('-');

      // Helper: laatste kaart-event (met match_id voor correcte schorsingsplanning)
      const getLastCardTrigger = (
        player: PlayerCard,
        cardType: 'yellow' | 'red',
      ): CardSuspensionTrigger | undefined => {
        const fromEvent = player.cardEvents
          ?.filter((event) => event.cardType === cardType)
          .sort((a, b) => b.matchDate.localeCompare(a.matchDate))[0];
        if (fromEvent) {
          return { matchId: fromEvent.matchId, matchDate: fromEvent.matchDate };
        }
        const fallbackDate = lastCardDateByPlayer.get(`${player.playerId}:${cardType}`);
        return fallbackDate ? { matchDate: fallbackDate } : undefined;
      };

      const getLastCardDate = (
        player: PlayerCard,
        cardType: 'yellow' | 'red',
      ): string | undefined => getLastCardTrigger(player, cardType)?.matchDate;

      const mapTeamMatch = (
        match: (typeof allMatchesData)[number],
        teamId: number,
      ): { date: string; opponent: string } => {
        const isHome = match.home_team_id === teamId;
        const opponent = isHome
          ? match.away_team_name || 'Onbekend'
          : match.home_team_name || 'Onbekend';
        return {
          date: matchToDateKey(match.match_date),
          opponent,
        };
      };

      const getUpcomingTeamMatches = (
        teamId: number,
        count: number,
      ): Array<{ date: string; opponent: string }> => {
        if (count <= 0) return [];
        return (matchesByTeamId.get(teamId) || [])
          .filter((match) => matchToDateKey(match.match_date) >= todayDate)
          .slice(0, count)
          .map((match) => mapTeamMatch(match, teamId));
      };

      const resolveSuspendedForMatches = (
        teamId: number | undefined,
        trigger: CardSuspensionTrigger | undefined,
        count: number,
      ): Array<{ date: string; opponent: string }> => {
        if (!teamId || count <= 0) return [];
        if (trigger) {
          const fromTrigger = resolveSuspensionMatchesAfterCard(
            teamId,
            trigger,
            count,
            allMatchesData,
          );
          if (fromTrigger.length > 0) return fromTrigger;
        }
        return getUpcomingTeamMatches(teamId, count);
      };

      const getAutomaticStatus = (
        remaining: number,
        suspendedForMatches?: Array<{ date: string; opponent: string }>,
      ): Suspension['status'] => {
        if (remaining <= 0) return 'completed';
        // DB `suspended_matches_remaining` is leidend — niet als afgelopen markeren op kalender-gok
        if (remaining > 0) return 'active';
        if (!suspendedForMatches?.length) return 'active';
        const lastSuspendedMatch = suspendedForMatches[suspendedForMatches.length - 1];
        return lastSuspendedMatch.date < todayDate ? 'completed' : 'active';
      };

      const autoOverrides = await suspensionService.getAutomaticSuspensionOverridesMap();

      // Process each player — DB `suspended_matches_remaining` is bron van waarheid voor actieve schorsing
      for (const player of playerCards) {
        const remaining = player.suspendedMatches ?? 0;
        if (remaining <= 0) continue;

        const cardTrigger = getLastCardTrigger(
          player,
          player.redCards > 0 ? "red" : "yellow",
        );
        const suspendedForMatches = player.teamId
          ? resolveSuspendedForMatches(player.teamId, cardTrigger, remaining)
          : [];
        const suspendedForMatch = suspendedForMatches[0];
        const status = getAutomaticStatus(remaining, suspendedForMatches);

        // Rode kaart heeft voorrang (zelfde remaining-teller in DB)
        if (player.redCards > 0) {
          const cardDate = getLastCardDate(player, 'red');
          const baselineMatches = player.redCards * rules.red_card_rules.default_suspension_matches;
          const baselineReason = `${player.redCards} rode kaart${player.redCards > 1 ? 'en' : ''}`;
          const overrideKey = `${player.playerId}:red`;
          const ov = autoOverrides.get(overrideKey);
          const effectiveReason = ov?.reason_override || baselineReason;

          suspensions.push({
            id: `automatic-red-${player.playerId}-${player.redCards}`,
            playerId: player.playerId,
            playerName: player.playerName,
            teamName: player.teamName,
            teamId: player.teamId,
            source: 'automatic',
            automaticKind: 'red',
            automaticOverrideId: ov?.id,
            baselineReason,
            baselineMatches,
            reason: effectiveReason,
            matches: remaining,
            notes: ov?.notes || undefined,
            status,
            cardDate,
            suspendedForMatch,
            suspendedForMatches,
          });
          continue;
        }

        // Gele kaarten-drempel
        if (player.yellowCards >= 2) {
          const applicableRule = suspensionRulesService.findApplicableYellowCardRule(
            player.yellowCards,
            rules.yellow_card_rules,
          );
          const baselineMatches = applicableRule?.suspension_matches || 0;
          const baselineReason = `${player.yellowCards} gele kaarten`;

          if (baselineMatches > 0) {
            const cardDate = getLastCardDate(player, 'yellow');
            const overrideKey = `${player.playerId}:yellow`;
            const ov = autoOverrides.get(overrideKey);
            const effectiveReason = ov?.reason_override || baselineReason;

            suspensions.push({
              id: `automatic-yellow-${player.playerId}-${player.yellowCards}`,
              playerId: player.playerId,
              playerName: player.playerName,
              teamName: player.teamName,
              teamId: player.teamId,
              source: 'automatic',
              automaticKind: 'yellow',
              automaticOverrideId: ov?.id,
              baselineReason,
              baselineMatches,
              reason: effectiveReason,
              matches: remaining,
              notes: ov?.notes || undefined,
              status,
              cardDate,
              suspendedForMatch,
              suspendedForMatches,
            });
            continue;
          }
        }

        // Fallback: DB meldt resterende schorsing zonder kaartdrempel in totalen
        suspensions.push({
          id: `automatic-remaining-${player.playerId}`,
          playerId: player.playerId,
          playerName: player.playerName,
          teamName: player.teamName,
          teamId: player.teamId,
          source: 'automatic',
          reason: `Schorsing (${remaining} wedstrijd${remaining !== 1 ? 'en' : ''} resterend)`,
          matches: remaining,
          status,
          suspendedForMatch,
          suspendedForMatches,
        });
      }

      const manualSuspensions = await suspensionService.getManualSuspensions();
      const manualPlayerIds = [...new Set(manualSuspensions.map(suspension => suspension.playerId))];

      if (manualPlayerIds.length > 0) {
        let playersById = new Map<number, { playerName: string; teamName: string; teamId?: number }>();
        try {
          const [allPlayers, allTeams] = await Promise.all([
            fetchPlayersForSession(null),
            fetchTeamsForSession(),
          ]);
          const teamNameById = new Map(allTeams.map((t) => [t.team_id, t.team_name]));
          const manualIdSet = new Set(manualPlayerIds);
          playersById = new Map(
            allPlayers
              .filter((player) => manualIdSet.has(player.player_id))
              .map((player) => [
                player.player_id,
                {
                  playerName: `${player.first_name} ${player.last_name}`,
                  teamName: teamNameById.get(player.team_id) || 'Onbekend Team',
                  teamId: player.team_id as number | undefined,
                },
              ]),
          );
        } catch (playersError) {
          console.error('Error fetching manual suspension players:', playersError);
        }

        manualSuspensions.forEach((manualSuspension) => {
          const player = playersById.get(manualSuspension.playerId);
          const endDateTime = manualSuspension.endDate ? new Date(manualSuspension.endDate).getTime() : undefined;
          const isExpired = typeof endDateTime === 'number' && endDateTime < Date.now();
          const status: Suspension['status'] = manualSuspension.isActive && !isExpired ? 'active' : 'completed';
          const suspendedForMatches = resolveSuspendedForMatches(
            player?.teamId,
            manualSuspension.startDate
              ? { matchDate: manualSuspension.startDate }
              : undefined,
            manualSuspension.matches,
          );
          const suspendedForMatch = suspendedForMatches[0];

          suspensions.push({
            id: `manual-${manualSuspension.id}`,
            playerId: manualSuspension.playerId,
            playerName: player?.playerName || `Speler ${manualSuspension.playerId}`,
            teamName: player?.teamName || 'Onbekend Team',
            teamId: player?.teamId,
            source: 'manual',
            manualSuspensionId: manualSuspension.id,
            reason: manualSuspension.reason,
            matches: manualSuspension.matches,
            status,
            cardDate: manualSuspension.startDate,
            startDate: manualSuspension.startDate,
            endDate: manualSuspension.endDate,
            notes: manualSuspension.notes,
            suspendedForMatch,
            suspendedForMatches,
          });
        });
      }

      return suspensions;
    } catch (error) {
      console.error('Error in getActiveSuspensions:', error);
      return [];
    }
  },

  // Trigger manual update of player cards
  async refreshPlayerCards(): Promise<void> {
    try {
      const { error } = await supabase.rpc('update_player_cards');
      if (error) {
        console.error('Error refreshing player cards:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in refreshPlayerCards:', error);
      throw error;
    }
  }
};
