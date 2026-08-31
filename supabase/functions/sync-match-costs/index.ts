// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { requireMatchMutationAccess } from '../_shared/auth.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const supabaseServiceRole = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface SyncMatchCostsRequest {
  matchId: number;
  matchDateISO?: string | null;
  homeTeamId: number;
  awayTeamId: number;
  isSubmitted: boolean;
  referee?: string | null;
}

function costNameImpliesMatchCostSuppression(name: string | null | undefined): boolean {
  const n = (name || '').toLowerCase().trim();
  if (!n) return false;
  return (
    n.includes('forfait') ||
    (n.includes('walk') && n.includes('over')) ||
    n.includes('vrijstelling') ||
    n.includes('niet gespeeld') ||
    n.includes('niet afgewerkt')
  );
}

async function matchHasForfaitPenalty(matchId: number): Promise<boolean> {
  const { data: rpcData, error: rpcError } = await supabaseServiceRole.rpc('match_has_forfait_penalty', {
    p_match_id: matchId,
  });
  if (!rpcError && typeof rpcData === 'boolean') return rpcData;

  const { data, error } = await supabaseServiceRole
    .from('team_costs')
    .select('costs!inner(name, category)')
    .eq('match_id', matchId)
    .eq('costs.category', 'penalty');

  if (error || !data?.length) return false;
  return data.some((r: { costs?: { name?: string | null } }) => {
    const c = r.costs;
    if (!c) return false;
    return costNameImpliesMatchCostSuppression(c.name);
  });
}

function costNameIsAdminMatchCost(name: string | null | undefined): boolean {
  const n = (name || '').toLowerCase().trim();
  return n.includes('administratie') || n.includes('admin');
}

async function deleteNonAdminMatchCostsForMatch(matchId: number, organizationId: number): Promise<void> {
  const { data: mcRows, error: mcErr } = await supabaseServiceRole
    .from('costs')
    .select('id, name')
    .eq('category', 'match_cost')
    .eq('organization_id', organizationId);
  if (mcErr) throw new Error(mcErr.message);
  const ids = (mcRows || [])
    .filter((c: { name?: string | null }) => !costNameIsAdminMatchCost(c.name))
    .map((c: { id: number }) => c.id);
  if (ids.length === 0) return;
  await supabaseServiceRole.from('team_costs').delete().eq('match_id', matchId).in('cost_setting_id', ids);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, matchDateISO, homeTeamId, awayTeamId, isSubmitted, referee }: SyncMatchCostsRequest = await req.json();

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

    console.log('Syncing match costs for match:', { matchId, homeTeamId, awayTeamId, isSubmitted, referee });

    const { data: matchRow, error: matchRowErr } = await supabaseServiceRole
      .from('matches')
      .select('organization_id, skip_auto_match_costs, assigned_referee_id, referee')
      .eq('match_id', matchId)
      .maybeSingle();
    if (matchRowErr) throw new Error(`Failed to load match: ${matchRowErr.message}`);
    const organizationId = matchRow?.organization_id;
    if (organizationId == null) {
      throw new Error(`Match ${matchId} heeft geen organization_id`);
    }

    if (!isSubmitted) {
      console.log('Match not submitted, skipping cost sync');
      return new Response(
        JSON.stringify({ success: true, message: 'Wedstrijd niet ingediend, kosten niet gesynchroniseerd', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (await matchHasForfaitPenalty(matchId)) {
      await deleteNonAdminMatchCostsForMatch(matchId, organizationId);

      const { data: matchCosts, error: costErr } = await supabaseServiceRole
        .from('costs')
        .select('id, name, amount')
        .eq('category', 'match_cost')
        .eq('organization_id', organizationId);
      if (costErr) throw new Error(`Failed to load cost settings: ${costErr.message}`);

      const costSettings = matchCosts || [];
      const findCostByType = (type: 'veld' | 'scheids' | 'administratie') => {
        const searchTerms = type === 'administratie'
          ? ['administratie', 'admin']
          : [];
        return costSettings.find((cs: { name?: string | null }) => {
          const name = (cs.name || '').toLowerCase();
          return searchTerms.some((term) => name.includes(term));
        });
      };

      const adminCostSetting = findCostByType('administratie');
      const transactionDate = matchDateISO ? matchDateISO.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const processedCosts: Record<string, unknown> = {};

      const ensureCostExists = async (teamId: number, costSetting: { id: number; amount?: number | null } | undefined, costType: string) => {
        if (!costSetting) return;
        const desired = Number(costSetting.amount ?? 0);
        const { data: existingRows, error: existErr } = await supabaseServiceRole
          .from('team_costs')
          .select('id, amount')
          .eq('team_id', teamId)
          .eq('match_id', matchId)
          .eq('cost_setting_id', costSetting.id)
          .eq('is_auto_card_penalty', false);
        if (existErr) throw new Error(`Failed to check existing ${costType} costs: ${existErr.message}`);
        if ((existingRows || []).length === 0) {
          const { error: insertErr } = await supabaseServiceRole.from('team_costs').insert({
            organization_id: organizationId,
            team_id: teamId,
            cost_setting_id: costSetting.id,
            amount: desired,
            transaction_date: transactionDate,
            match_id: matchId,
            is_auto_card_penalty: false,
          });
          if (insertErr) throw new Error(`Failed to insert ${costType} cost: ${insertErr.message}`);
          processedCosts[`${costType}_team_${teamId}`] = { inserted: true, amount: desired };
        }
      };

      await ensureCostExists(homeTeamId, adminCostSetting, 'admin');
      await ensureCostExists(awayTeamId, adminCostSetting, 'admin');

      console.log('Forfait penalty on match; kept admin costs only');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Forfait: veld/scheids vervallen; administratiekosten behouden',
          forfait: true,
          processedCosts,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (matchRow?.skip_auto_match_costs === true) {
      console.log('skip_auto_match_costs: skipping automatic match cost sync');
      return new Response(
        JSON.stringify({
          success: true,
          message:
            'Automatische wedstrijdkosten uitgeschakeld na handmatig verwijderen. Gebruik reset in wedstrijdformulier.',
          skipped: true,
          skipAutoMatchCosts: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load match_cost settings
    const { data: matchCosts, error: costErr } = await supabaseServiceRole
      .from('costs')
      .select('id, name, amount')
      .eq('category', 'match_cost')
      .eq('organization_id', organizationId);

    if (costErr) throw new Error(`Failed to load cost settings: ${costErr.message}`);

    const costSettings = matchCosts || [];
    console.log('Loaded match cost settings:', costSettings);

    const findCostByType = (type: 'veld' | 'scheids' | 'administratie') => {
      const searchTerms = type === 'veld'
        ? ['veld', 'field']
        : type === 'scheids'
        ? ['scheidsrechter', 'scheids', 'referee']
        : ['administratie', 'admin'];

      return costSettings.find(cs => {
        const name = (cs.name || '').toLowerCase();
        return searchTerms.some(term => name.includes(term));
      });
    };

    const fieldCostSetting = findCostByType('veld');
    const refereeCostSetting = findCostByType('scheids');
    const adminCostSetting = findCostByType('administratie');

    const transactionDate = matchDateISO ? matchDateISO.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const processedCosts: Record<string, any> = {};

    const ensureCostExists = async (teamId: number, costSetting: any, costType: string) => {
      if (!costSetting) {
        console.log(`No ${costType} cost setting found, skipping`);
        return;
      }

      const desired = Number(costSetting.amount ?? 0);

      const { data: existingRows, error: existErr } = await supabaseServiceRole
        .from('team_costs')
        .select('id, amount')
        .eq('team_id', teamId)
        .eq('match_id', matchId)
        .eq('cost_setting_id', costSetting.id)
        .eq('is_auto_card_penalty', false);

      if (existErr) throw new Error(`Failed to check existing ${costType} costs: ${existErr.message}`);

      const existingCount = (existingRows || []).length;

      if (existingCount === 0) {
        const { error: insertErr } = await supabaseServiceRole
          .from('team_costs')
          .insert({
            organization_id: organizationId,
            team_id: teamId,
            cost_setting_id: costSetting.id,
            amount: desired,
            transaction_date: transactionDate,
            match_id: matchId,
            is_auto_card_penalty: false
          });

        if (insertErr) throw new Error(`Failed to insert ${costType} cost: ${insertErr.message}`);
        processedCosts[`${costType}_team_${teamId}`] = { inserted: true, amount: desired };
      } else if (existingCount > 1) {
        const idsToDelete = (existingRows || []).slice(1).map(r => r.id);
        if (idsToDelete.length > 0) {
          const { error: delErr } = await supabaseServiceRole
            .from('team_costs')
            .delete()
            .in('id', idsToDelete);
          if (delErr) console.error(`Failed to clean up duplicate ${costType} costs:`, delErr);
        }
        const keepId = (existingRows || [])[0].id;
        const cur = (existingRows || [])[0].amount;
        const curNum = cur == null ? null : Number(cur);
        if (curNum !== desired) {
          const { error: upErr } = await supabaseServiceRole
            .from('team_costs')
            .update({ amount: desired, transaction_date: transactionDate })
            .eq('id', keepId);
          if (upErr) throw new Error(`Failed to update ${costType} amount: ${upErr.message}`);
          processedCosts[`${costType}_team_${teamId}`] = { exists: true, cleaned: idsToDelete.length, updatedAmount: true };
        } else {
          processedCosts[`${costType}_team_${teamId}`] = { exists: true, cleaned: idsToDelete.length };
        }
      } else {
        const row = (existingRows || [])[0];
        const curNum = row.amount == null ? null : Number(row.amount);
        if (curNum !== desired) {
          const { error: upErr } = await supabaseServiceRole
            .from('team_costs')
            .update({ amount: desired, transaction_date: transactionDate })
            .eq('id', row.id);
          if (upErr) throw new Error(`Failed to update ${costType} amount: ${upErr.message}`);
          processedCosts[`${costType}_team_${teamId}`] = { exists: true, updatedAmount: true };
        } else {
          processedCosts[`${costType}_team_${teamId}`] = { exists: true };
        }
      }
    };

    // Process field costs for both teams
    await ensureCostExists(homeTeamId, fieldCostSetting, 'field');
    await ensureCostExists(awayTeamId, fieldCostSetting, 'field');

    // Scheidskosten alleen bij toegewezen scheids; anders opruimen
    const dbRefereeText = typeof matchRow?.referee === 'string' ? matchRow.referee : null;
    const requestRefereeText = typeof referee === 'string' ? referee : null;
    const hasReferee =
      matchRow?.assigned_referee_id != null ||
      (requestRefereeText != null && requestRefereeText.trim() !== '') ||
      (dbRefereeText != null && dbRefereeText.trim() !== '');

    if (hasReferee) {
      await ensureCostExists(homeTeamId, refereeCostSetting, 'referee');
      await ensureCostExists(awayTeamId, refereeCostSetting, 'referee');
    } else if (refereeCostSetting) {
      const { error: delRefErr } = await supabaseServiceRole
        .from('team_costs')
        .delete()
        .eq('match_id', matchId)
        .eq('cost_setting_id', refereeCostSetting.id);
      if (delRefErr) {
        console.error('Failed to remove orphan referee costs:', delRefErr);
      } else {
        processedCosts.referee_cleared = true;
      }
    }

    // Process admin costs for both teams
    await ensureCostExists(homeTeamId, adminCostSetting, 'admin');
    await ensureCostExists(awayTeamId, adminCostSetting, 'admin');

    console.log('Match cost sync completed successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Wedstrijdkosten gesynchroniseerd', processedCosts, referee, hasReferee }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error syncing match costs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, message: `Fout bij synchroniseren wedstrijdkosten: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
