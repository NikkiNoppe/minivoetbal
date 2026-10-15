// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { requireMatchMutationAccess, requireSession } from '../_shared/auth.ts';

// Declare Deno namespace for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

// Create Supabase client with service role key to bypass RLS
const supabaseServiceRole = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

type CardType = "yellow" | "double_yellow" | "red" | "none";

interface PlayerLike {
  playerId: number | null;
  cardType?: string | null;
}

interface SyncCardPenaltiesRequest {
  matchId: number;
  matchDateISO?: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homePlayers?: PlayerLike[];
  awayPlayers?: PlayerLike[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, matchDateISO, homeTeamId, awayTeamId, homePlayers = [], awayPlayers = [] }: SyncCardPenaltiesRequest = await req.json();

    const sessionAuth = await requireSession(req, supabaseServiceRole);
    if (!sessionAuth.ok) {
      return new Response(JSON.stringify({ error: sessionAuth.message }), {
        status: sessionAuth.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (sessionAuth.role !== 'admin') {
      const auth = await requireMatchMutationAccess(
        req,
        supabaseServiceRole,
        homeTeamId,
        awayTeamId,
        matchId,
      );
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.message }), {
          status: auth.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Syncing card penalties for match:', { matchId, homeTeamId, awayTeamId });

    // Load organization + season of this match (team_costs.organization_id is required)
    const { data: matchRow, error: matchErr } = await supabaseServiceRole
      .from('matches')
      .select('organization_id, season_label')
      .eq('match_id', matchId)
      .single();
    if (matchErr || !matchRow) {
      throw new Error(`Failed to load match: ${matchErr?.message ?? 'not found'}`);
    }
    const orgId: number = matchRow.organization_id;
    const seasonLabel: string | null = matchRow.season_label ?? null;

    // Load penalty cost settings (active) for inserts — only this organization
    const { data: penalties, error: penErr } = await supabaseServiceRole
      .from('costs')
      .select('id, name, amount')
      .eq('organization_id', orgId)
      .eq('category', 'penalty');

    if (penErr) {
      throw new Error(`Failed to load penalty settings: ${penErr.message}`);
    }

    const penaltySettings = penalties || [];

    // Load ALL penalty cost ids (active or inactive) for cleanup
    const { data: allPenaltyCosts, error: allPenErr } = await supabaseServiceRole
      .from('costs')
      .select('id')
      .eq('organization_id', orgId)
      .eq('category', 'penalty');
    if (allPenErr) {
      throw new Error(`Failed to load all penalty cost ids: ${allPenErr.message}`);
    }
    let allPenaltyIds: number[] = (allPenaltyCosts || []).map((c: any) => c.id);

    // Fallback: include cost IDs by name pattern when category is not set correctly
    if (allPenaltyIds.length === 0) {
      const { data: nameMatchedCosts, error: nameMatchErr } = await supabaseServiceRole
        .from('costs')
        .select('id, name')
        .or(
          [
            'name.ilike.%geel%',
            'name.ilike.%gele%',
            'name.ilike.%yellow%',
            'name.ilike.%rood%',
            'name.ilike.%rode%',
            'name.ilike.%red%'
          ].join(',')
        );
      if (nameMatchErr) {
        throw new Error(`Failed to load penalty-like costs by name: ${nameMatchErr.message}`);
      }
      allPenaltyIds = (nameMatchedCosts || []).map((c: any) => c.id);
    }
    console.log('Loaded penalty settings:', penaltySettings);

    // Helper: map card type -> cost setting with improved matching
    const findCostForType = (type: CardType) => {
      const nameIncludes = (s: string, q: string) => s.toLowerCase().includes(q);
      for (const cs of penaltySettings) {
        const n = (cs.name || '').toLowerCase();
        if (type === 'yellow' && (nameIncludes(n, 'geel') || nameIncludes(n, 'gele') || nameIncludes(n, 'yellow'))) return cs;
        if (type === 'double_yellow' && ((nameIncludes(n, '2x') && nameIncludes(n, 'geel')) || nameIncludes(n, 'dubbel') || nameIncludes(n, 'double'))) return cs;
        if (type === 'red' && (nameIncludes(n, 'rood') || nameIncludes(n, 'rode') || nameIncludes(n, 'red'))) return cs;
      }
      return null;
    };

    // Fallback for double yellow: if no specific setting, treat as two yellows
    const getCardCostData = (type: CardType) => {
      const direct = findCostForType(type);
      if (direct) return { setting: direct, count: 1 };
      
      if (type === 'double_yellow') {
        const yellowSetting = findCostForType('yellow');
        if (yellowSetting) return { setting: yellowSetting, count: 2 };
      }
      
      return null;
    };

    // Count desired penalties per team and cost setting
    const countByTeamAndCostId: Record<string, number> = {};
    const addCostCount = (teamId: number, costSettingId: number, count: number = 1) => {
      const key = `${teamId}:${costSettingId}`;
      countByTeamAndCostId[key] = (countByTeamAndCostId[key] || 0) + count;
    };

    const processPlayers = (teamId: number, players: PlayerLike[]) => {
      for (const p of players) {
        if (!p?.playerId) continue;
        const type = (p.cardType as CardType | undefined) || undefined;
        if (!type || type === 'none') continue;
        
        const cardCostData = getCardCostData(type);
        if (cardCostData) {
          addCostCount(teamId, cardCostData.setting.id, cardCostData.count);
          console.log(`Adding ${cardCostData.count}x ${type} for team ${teamId} (cost_id: ${cardCostData.setting.id}, amount: ${cardCostData.setting.amount})`);
        } else {
          console.log(`No cost setting found for card type: ${type}`);
        }
      }
    };

    processPlayers(homeTeamId, homePlayers);
    processPlayers(awayTeamId, awayPlayers);

    console.log('Card penalty counts by cost setting:', countByTeamAndCostId);

    // Sync for each (team, cost_setting_id)
    for (const key of Object.keys(countByTeamAndCostId)) {
      const [teamIdStr, costIdStr] = key.split(':');
      const teamId = parseInt(teamIdStr, 10);
      const costSettingId = parseInt(costIdStr, 10);
      const desiredCount = countByTeamAndCostId[key];
      
      const costSetting = penaltySettings.find(cs => cs.id === costSettingId);
      if (!costSetting) {
        console.log(`Cost setting not found for ID: ${costSettingId}`);
        continue;
      }

      console.log(`Processing cost setting "${costSetting.name}" (ID: ${costSettingId}) for team ${teamId}: desired=${desiredCount}`);

      // DB allows only ONE row per (match, team, cost) → store count × price in one row
      const desiredAmount = Number(costSetting.amount ?? 0) * desiredCount;
      const { data: existingRows, error: existErr } = await supabaseServiceRole
        .from('team_costs')
        .select('id, amount, is_auto_card_penalty')
        .eq('team_id', teamId)
        .eq('match_id', matchId)
        .eq('cost_setting_id', costSettingId);

      if (existErr) {
        throw new Error(`Failed to fetch existing penalty records: ${existErr.message}`);
      }

      const existing = (existingRows || [])[0];
      if (!existing) {
        const transactionDate = matchDateISO ? (matchDateISO.slice(0, 10)) : new Date().toISOString().slice(0, 10);
        const { error: insertErr } = await supabaseServiceRole.from('team_costs').insert({
          team_id: teamId,
          cost_setting_id: costSettingId,
          amount: desiredAmount,
          transaction_date: transactionDate,
          match_id: matchId,
          organization_id: orgId,
          season_label: seasonLabel,
          // mark as auto-generated so manual items are never affected by cleanup
          is_auto_card_penalty: true
        });
        if (insertErr) {
          throw new Error(`Failed to insert penalty records: ${insertErr.message}`);
        }
      } else if (existing.is_auto_card_penalty && Number(existing.amount) !== desiredAmount) {
        const { error: updErr } = await supabaseServiceRole
          .from('team_costs')
          .update({ amount: desiredAmount })
          .eq('id', existing.id);
        if (updErr) {
          throw new Error(`Failed to update penalty record: ${updErr.message}`);
        }
      }
    }

    // Cleanup pass: remove any penalty rows for this match that are no longer desired
    // Use penaltySettings IDs explicitly to avoid FK join issues
    const penaltyIds = penaltySettings.map((cs: any) => cs.id);
    // Use ALL penalty IDs for cleanup so obsolete/inactive ones are also removed
    if (allPenaltyIds.length > 0) {
      // If nothing is desired anymore, remove all penalty rows for this match
      const desiredKeys = new Set(Object.keys(countByTeamAndCostId));
      if (desiredKeys.size === 0) {
        const { error: delAllErr } = await supabaseServiceRole
          .from('team_costs')
          .delete()
          .eq('match_id', matchId)
          .eq('is_auto_card_penalty', true)
          .in('cost_setting_id', allPenaltyIds);
        if (delAllErr) {
          throw new Error(`Failed to delete all obsolete penalty rows: ${delAllErr.message}`);
        }
      } else {
        // Select all existing penalty rows for this match
        const { data: existingAllPenaltyRows, error: existingAllErr } = await supabaseServiceRole
          .from('team_costs')
          .select('id, team_id, cost_setting_id, is_auto_card_penalty')
          .eq('match_id', matchId)
          .in('cost_setting_id', allPenaltyIds);
        if (existingAllErr) {
          throw new Error(`Failed to fetch existing penalty rows for cleanup: ${existingAllErr.message}`);
        }
        const idsToDeleteCleanup: number[] = [];
        for (const row of existingAllPenaltyRows || []) {
          const key = `${row.team_id}:${row.cost_setting_id}`;
          const desired = desiredKeys.has(key) ? (countByTeamAndCostId[key] || 0) : 0;
          if (desired === 0 && row.is_auto_card_penalty === true) idsToDeleteCleanup.push(row.id);
        }
        if (idsToDeleteCleanup.length > 0) {
          const { error: cleanupDelErr } = await supabaseServiceRole
            .from('team_costs')
            .delete()
            .in('id', idsToDeleteCleanup);
          if (cleanupDelErr) {
            throw new Error(`Failed to cleanup obsolete penalty rows: ${cleanupDelErr.message}`);
          }
        }
      }
    }

    console.log('Card penalty sync completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Kaartboetes gesynchroniseerd',
        processedCounts: countByTeamAndCostId
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error syncing card penalties:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: `Fout bij synchroniseren kaartboetes: ${errorMessage}` 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
