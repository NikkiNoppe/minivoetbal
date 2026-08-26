
import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import { fetchCostsForSession } from "@/services/financial/costsSessionFetch";
import { fetchTeamTransactionsByTeamId } from "@/services/financial/financialTransactionsFetch";

export interface CostSetting {
  id: number;
  name: string;
  amount: number;
  category: 'match_cost' | 'penalty' | 'other' | 'deposit';
  created_at?: string;
  updated_at?: string;
}

export interface TeamTransaction {
  id: number;
  team_id: number;
  transaction_type: 'deposit' | 'penalty' | 'match_cost' | 'adjustment';
  amount: number;
  description: string | null;
  cost_setting_id: number | null;
  penalty_type_id: number | null;
  match_id: number | null;
  transaction_date: string;
  created_at?: string;
  cost_settings?: {
    name: string;
    category: string;
  };
  matches?: {
    unique_number: string;
    match_date: string;
  };
}

export const costSettingsService = {
  async getCostSettings(): Promise<CostSetting[]> {
    try {
      return await fetchCostsForSession();
    } catch (error) {
      console.error("Error fetching cost settings:", error);
      return [];
    }
  },

  async getMatchCosts(): Promise<CostSetting[]> {
    try {
      return await fetchCostsForSession("match_cost");
    } catch (error) {
      console.error("Error fetching match costs:", error);
      return [];
    }
  },

  async getPenalties(): Promise<CostSetting[]> {
    try {
      return await fetchCostsForSession("penalty");
    } catch (error) {
      console.error("Error fetching penalties:", error);
      return [];
    }
  },

  async addCostSetting(setting: Omit<CostSetting, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; message: string }> {
    try {
      const { data, error } = await supabase.rpc('manage_cost_settings_for_session', {
        ...getRpcSessionArgs(),
        p_operation: 'insert',
        p_id: null,
        p_name: setting.name,
        p_amount: setting.amount,
        p_category: setting.category,
        p_cascade_amount: false,
      });

      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        return { success: false, message: (data as { error?: string })?.error || 'Fout bij toevoegen' };
      }
      return { success: true, message: 'Kostentarief succesvol toegevoegd' };
    } catch (error) {
      console.error('Error adding cost setting:', error);
      return { success: false, message: 'Fout bij toevoegen kostentarief' };
    }
  },

  async updateCostSetting(id: number, setting: Partial<CostSetting>): Promise<{ success: boolean; message: string; updatedTransactions?: number }> {
    try {
      const { data, error } = await supabase.rpc('manage_cost_settings_for_session', {
        ...getRpcSessionArgs(),
        p_operation: 'update',
        p_id: id,
        p_name: setting.name ?? null,
        p_amount: setting.amount ?? null,
        p_category: setting.category ?? null,
        p_cascade_amount: setting.amount !== undefined,
      });

      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        return { success: false, message: (data as { error?: string })?.error || 'Fout bij bijwerken' };
      }

      const updatedTransactions = (data as { updated_transactions?: number })?.updated_transactions ?? 0;
      const msg = updatedTransactions > 0
        ? `Kostentarief bijgewerkt en ${updatedTransactions} bestaande transacties aangepast`
        : 'Kostentarief succesvol bijgewerkt';

      return { success: true, message: msg, updatedTransactions };
    } catch (error) {
      console.error('Error updating cost setting:', error);
      return { success: false, message: 'Fout bij bijwerken kostentarief' };
    }
  },

  async deleteCostSetting(id: number): Promise<{ success: boolean; message: string }> {
    try {
      const { data, error } = await supabase.rpc('manage_cost_settings_for_session', {
        ...getRpcSessionArgs(),
        p_operation: 'delete',
        p_id: id,
        p_name: null,
        p_amount: null,
        p_category: null,
        p_cascade_amount: false,
      });

      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        return { success: false, message: (data as { error?: string })?.error || 'Fout bij verwijderen' };
      }
      return { success: true, message: 'Kostentarief succesvol verwijderd' };
    } catch (error) {
      console.error('Error deleting cost setting:', error);
      return { success: false, message: 'Fout bij verwijderen kostentarief' };
    }
  },

  async getTeamTransactions(teamId: number): Promise<TeamTransaction[]> {
    try {
      const rows = await fetchTeamTransactionsByTeamId(teamId);
      return rows.map((transaction) => ({
        id: transaction.id,
        team_id: transaction.team_id,
        transaction_type: (transaction.transaction_type || 'adjustment') as TeamTransaction['transaction_type'],
        amount: transaction.amount,
        description: transaction.description ?? null,
        cost_setting_id: transaction.cost_setting_id ?? null,
        penalty_type_id: null,
        match_id: transaction.match_id ?? null,
        transaction_date: transaction.transaction_date,
        created_at: new Date().toISOString(),
        cost_settings: transaction.cost_settings
          ? {
              name: transaction.cost_settings.name ?? '',
              category: transaction.cost_settings.category ?? '',
            }
          : undefined,
        matches: transaction.matches
          ? {
              unique_number: transaction.matches.unique_number ?? '',
              match_date: transaction.matches.match_date ?? '',
              home_team_id: transaction.matches.home_team_id,
              away_team_id: transaction.matches.away_team_id,
              teams_home: transaction.matches.teams_home,
              teams_away: transaction.matches.teams_away,
            }
          : undefined,
      }));
    } catch (error) {
      console.error('Error fetching team transactions:', error);
      return [];
    }
  },

  async addTransaction(transaction: Omit<TeamTransaction, 'id' | 'created_at'>): Promise<{ success: boolean; message: string }> {
    try {
      const { userId, role } = this._getUserContext();
      console.log('🔵 [FINANCIAL-CRUD] ADD request:', { 
        ...transaction, 
        userId, 
        role 
      });
      
      // For deposits, use the fixed "Storting" cost entry
      if (transaction.transaction_type === 'deposit') {
        // Get or create the fixed "Storting" cost entry
        let depositCostId: number;
        
        const depositCosts = await fetchCostsForSession('deposit');
        const existingDeposit = depositCosts.find((c) => c.name === 'Storting');

        if (existingDeposit) {
          depositCostId = existingDeposit.id;
        } else {
          console.log('🔵 [FINANCIAL-CRUD] Creating Storting cost entry via RPC');
          const { data: createResult, error: costError } = await supabase.rpc(
            'manage_cost_settings_for_session',
            {
              ...getRpcSessionArgs(),
              p_operation: 'insert',
              p_id: null,
              p_name: 'Storting',
              p_amount: 0,
              p_category: 'deposit',
              p_cascade_amount: false,
            },
          );

          if (costError) {
            console.error('❌ [FINANCIAL-CRUD] Failed to create Storting cost:', costError);
            throw costError;
          }
          const refreshed = await fetchCostsForSession('deposit');
          const created = refreshed.find((c) => c.name === 'Storting');
          if (!created) {
            throw new Error('Storting cost niet aangemaakt');
          }
          depositCostId = created.id;
          void createResult;
        }

        // Use add_team_cost_as_admin RPC
        const { data, error } = await supabase.rpc('add_team_cost_for_session', {
          ...getRpcSessionArgs(),
          p_team_id: transaction.team_id,
          p_cost_setting_id: depositCostId,
          p_amount: transaction.amount,
          p_transaction_date: transaction.transaction_date,
          p_match_id: transaction.match_id || null
        });

        console.log('🔵 [FINANCIAL-CRUD] ADD deposit response:', { data, error });

        if (error) {
          console.error('❌ [FINANCIAL-CRUD] ADD deposit RPC error:', error);
          throw error;
        }

        const result = data as any;
        if (result && result.success === false) {
          return { success: false, message: result.error || 'Fout bij toevoegen storting' };
        }

        return { success: true, message: 'Storting succesvol toegevoegd' };
      }

      // For other transaction types with cost_setting_id - use RPC
      if (transaction.cost_setting_id) {
        const { data, error } = await supabase.rpc('add_team_cost_for_session', {
          ...getRpcSessionArgs(),
          p_team_id: transaction.team_id,
          p_cost_setting_id: transaction.cost_setting_id,
          p_amount: transaction.amount,
          p_transaction_date: transaction.transaction_date,
          p_match_id: transaction.match_id || null
        });

        console.log('🔵 [FINANCIAL-CRUD] ADD transaction response:', { data, error });

        if (error) {
          console.error('❌ [FINANCIAL-CRUD] ADD transaction RPC error:', error);
          throw error;
        }

        const result = data as any;
        if (result && result.success === false) {
          return { success: false, message: result.error || 'Fout bij toevoegen transactie' };
        }

        return { success: true, message: 'Transactie succesvol toegevoegd' };
      }

      // For transaction types without cost_setting_id, create new cost entry first
      console.log('🔵 [FINANCIAL-CRUD] Creating new cost entry for:', transaction.description);
      const category =
        transaction.transaction_type === 'penalty'
          ? 'penalty'
          : transaction.transaction_type === 'match_cost'
            ? 'match_cost'
            : 'other';
      const { data: createCostResult, error: costError } = await supabase.rpc(
        'manage_cost_settings_for_session',
        {
          ...getRpcSessionArgs(),
          p_operation: 'insert',
          p_id: null,
          p_name:
            transaction.description ||
            `Transactie ${new Date(transaction.transaction_date).toLocaleDateString('nl-NL')}`,
          p_amount: transaction.amount,
          p_category: category,
          p_cascade_amount: false,
        },
      );

      if (costError) {
        console.error('❌ [FINANCIAL-CRUD] Failed to create cost entry:', costError);
        throw costError;
      }
      if (!(createCostResult as { success?: boolean })?.success) {
        throw new Error('Kostentarief niet aangemaakt');
      }

      const allCosts = await fetchCostsForSession(category);
      const costData = allCosts.find(
        (c) =>
          c.name ===
          (transaction.description ||
            `Transactie ${new Date(transaction.transaction_date).toLocaleDateString('nl-NL')}`),
      );
      if (!costData) {
        throw new Error('Nieuw kostentarief niet gevonden');
      }

      const { data, error } = await supabase.rpc('add_team_cost_for_session', {
        ...getRpcSessionArgs(),
        p_team_id: transaction.team_id,
        p_cost_setting_id: costData.id,
        p_amount: transaction.amount,
        p_transaction_date: transaction.transaction_date,
        p_match_id: transaction.match_id || null
      });

      console.log('🔵 [FINANCIAL-CRUD] ADD custom transaction response:', { data, error });

      if (error) {
        console.error('❌ [FINANCIAL-CRUD] ADD custom transaction RPC error:', error);
        throw error;
      }

      const result = data as any;
      if (result && result.success === false) {
        return { success: false, message: result.error || 'Fout bij toevoegen transactie' };
      }

      return { success: true, message: 'Transactie succesvol toegevoegd' };
    } catch (error) {
      console.error('❌ [FINANCIAL-CRUD] ADD failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      return { success: false, message: `Fout bij toevoegen transactie: ${errorMessage}` };
    }
  },

  async deleteTransaction(transactionId: number): Promise<{ success: boolean; message: string }> {
    const { userId, role } = this._getUserContext();
    console.log('🔵 [PENALTY-CRUD] DELETE request:', { costId: transactionId, userId, role });
    
    try {
      const { data, error } = await supabase.rpc('manage_team_cost_for_session', {
        ...getRpcSessionArgs(),
        p_cost_id: transactionId,
        p_operation: 'delete'
      } as any);

      if (error) {
        console.error('❌ [PENALTY-CRUD] DELETE RPC error:', { costId: transactionId, error });
        throw error;
      }
      
      const result = data as unknown as { success: boolean; message?: string; error?: string; deleted_id?: number };
      console.log('🔵 [PENALTY-CRUD] DELETE response:', { costId: transactionId, result });
      
      if (!result.success) {
        console.warn('⚠️ [PENALTY-CRUD] DELETE rejected by RPC:', { costId: transactionId, error: result.error });
        return { success: false, message: result.error || 'Fout bij verwijderen transactie' };
      }
      return { success: true, message: result.message || 'Transactie succesvol verwijderd' };
    } catch (error) {
      console.error('❌ [PENALTY-CRUD] DELETE failed:', { costId: transactionId, error });
      return { success: false, message: 'Fout bij verwijderen transactie' };
    }
  },

  async updateTransaction(
    transactionId: number, 
    updates: {
      amount?: number;
      transaction_date?: string;
      cost_setting_id?: number;
      team_id?: number;
    }
  ): Promise<{ success: boolean; message: string }> {
    const { userId, role } = this._getUserContext();
    console.log('🔵 [PENALTY-CRUD] UPDATE request:', { costId: transactionId, userId, role, updates });
    
    try {
      const { data, error } = await supabase.rpc('manage_team_cost_for_session', {
        ...getRpcSessionArgs(),
        p_cost_id: transactionId,
        p_operation: 'update',
        p_amount: updates.amount ?? null,
        p_transaction_date: updates.transaction_date ?? null,
        p_cost_setting_id: updates.cost_setting_id ?? null,
        p_team_id: updates.team_id ?? null
      });

      if (error) {
        console.error('❌ [PENALTY-CRUD] UPDATE RPC error:', { costId: transactionId, error });
        throw error;
      }
      
      const result = data as unknown as { success: boolean; message?: string; error?: string };
      console.log('🔵 [PENALTY-CRUD] UPDATE response:', { costId: transactionId, result });
      
      if (!result.success) {
        console.warn('⚠️ [PENALTY-CRUD] UPDATE rejected by RPC:', { costId: transactionId, error: result.error });
        return { success: false, message: result.error || 'Fout bij bijwerken transactie' };
      }
      return { success: true, message: result.message || 'Transactie succesvol bijgewerkt' };
    } catch (error) {
      console.error('❌ [PENALTY-CRUD] UPDATE failed:', { costId: transactionId, error });
      return { success: false, message: 'Fout bij bijwerken transactie' };
    }
  },

  async addTransactionAsAdmin(
    teamId: number,
    costSettingId: number,
    amount: number,
    transactionDate: string,
    matchId?: number | null
  ): Promise<{ success: boolean; message: string }> {
    const { userId, role } = this._getUserContext();
    console.log('🔵 [PENALTY-CRUD] ADD request:', { teamId, costSettingId, amount, transactionDate, matchId, userId, role });
    
    try {
      const { data, error } = await supabase.rpc('add_team_cost_for_session', {
        ...getRpcSessionArgs(),
        p_team_id: teamId,
        p_cost_setting_id: costSettingId,
        p_amount: amount,
        p_transaction_date: transactionDate,
        p_match_id: matchId ?? null
      });

      if (error) {
        console.error('❌ [PENALTY-CRUD] ADD RPC error:', { teamId, error });
        throw error;
      }
      
      const result = data as unknown as { success: boolean; message?: string; error?: string };
      console.log('🔵 [PENALTY-CRUD] ADD response:', { teamId, result });
      
      if (!result.success) {
        return { success: false, message: result.error || 'Fout bij toevoegen transactie' };
      }
      return { success: true, message: result.message || 'Transactie succesvol toegevoegd' };
    } catch (error) {
      console.error('❌ [PENALTY-CRUD] ADD failed:', { teamId, error });
      return { success: false, message: 'Fout bij toevoegen transactie' };
    }
  },

  _getUserContext(): { userId: number; role: string } {
    const authDataString = localStorage.getItem('auth_data');
    if (authDataString) {
      try {
        const authData = JSON.parse(authDataString);
        return { 
          userId: authData?.user?.id, 
          role: authData?.user?.role || 'unknown' 
        };
      } catch (e) { /* ignore */ }
    }
    const legacyUserString = localStorage.getItem('user');
    if (legacyUserString) {
      try {
        const user = JSON.parse(legacyUserString);
        return { userId: user?.id, role: user?.role || 'unknown' };
      } catch (e) { /* ignore */ }
    }
    throw new Error('Gebruiker niet gevonden');
  },

  /** @deprecated Use _getUserContext instead */
  _getAdminUserId(): number {
    return this._getUserContext().userId;
  }
};
