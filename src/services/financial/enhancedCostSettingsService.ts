import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import { fetchCostsForSession } from "@/services/financial/costsSessionFetch";
import {
  fetchAllTeamTransactionsOverview,
  fetchTeamTransactionsByTeamId,
} from "@/services/financial/financialTransactionsFetch";

export interface CostSetting {
  id: number;
  name: string;
  amount: number;
  category: 'match_cost' | 'penalty' | 'other' | 'field_cost' | 'referee_cost';
}

export interface TeamTransaction {
  id: number;
  team_id: number;
  transaction_type: 'deposit' | 'penalty' | 'match_cost' | 'adjustment';
  amount: number;
  description: string | null;
  cost_setting_id: number | null;
  match_id: number | null;
  transaction_date: string;
  created_at: string;
  cost_settings?: {
    name: string;
    category: string;
  };
  matches?: {
    unique_number: string;
    match_date: string;
  };
}

// Enhanced logging utility
const logOperation = (operation: string, data?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] CostSettings ${operation}:`, { data, error });
};

export const enhancedCostSettingsService = {
  async getCostSettings(): Promise<CostSetting[]> {
    logOperation("getCostSettings - START");
    try {
      const mappedData = (await fetchCostsForSession()).map((item) => ({
        ...item,
        category: item.category as CostSetting["category"],
      }));
      logOperation("getCostSettings - SUCCESS", { count: mappedData.length });
      return mappedData;
    } catch (error) {
      logOperation("getCostSettings - CATCH ERROR", { error });
      throw error;
    }
  },

  async getMatchCosts(): Promise<CostSetting[]> {
    logOperation("getMatchCosts - START");
    try {
      const mappedData = (await fetchCostsForSession("match_cost")).map((item) => ({
        ...item,
        category: item.category as CostSetting["category"],
      }));
      logOperation("getMatchCosts - SUCCESS", { count: mappedData.length });
      return mappedData;
    } catch (error) {
      logOperation("getMatchCosts - CATCH ERROR", { error });
      throw error;
    }
  },

  async getPenalties(): Promise<CostSetting[]> {
    logOperation("getPenalties - START");
    try {
      const mappedData = (await fetchCostsForSession("penalty")).map((item) => ({
        ...item,
        category: item.category as CostSetting["category"],
      }));
      logOperation("getPenalties - SUCCESS", { count: mappedData.length });
      return mappedData;
    } catch (error) {
      logOperation("getPenalties - CATCH ERROR", { error });
      throw error;
    }
  },

  async addCostSetting(setting: Omit<CostSetting, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; message: string }> {
    logOperation('addCostSetting - START', { setting });
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

      logOperation('addCostSetting - QUERY RESULT', { data, error });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        return { success: false, message: (data as { error?: string })?.error || 'Fout bij toevoegen' };
      }
      return { success: true, message: 'Kostentarief succesvol toegevoegd' };
    } catch (error) {
      logOperation('addCostSetting - CATCH ERROR', { error });
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      return { success: false, message: `Fout bij toevoegen kostentarief: ${errorMessage}` };
    }
  },

  async updateCostSetting(id: number, setting: Partial<CostSetting>): Promise<{ success: boolean; message: string; affectedTransactions?: number }> {
    logOperation('updateCostSetting - START', { id, setting });
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

      const affectedTransactions = (data as { updated_transactions?: number })?.updated_transactions ?? 0;
      const message =
        affectedTransactions > 0
          ? `Kostentarief bijgewerkt. ${affectedTransactions} gerelateerde transactie(s) zijn automatisch aangepast.`
          : 'Kostentarief succesvol bijgewerkt';

      return { success: true, message, affectedTransactions };
    } catch (error) {
      logOperation('updateCostSetting - CATCH ERROR', { error });
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      return { success: false, message: `Fout bij bijwerken kostentarief: ${errorMessage}` };
    }
  },

  async deleteCostSetting(id: number): Promise<{ success: boolean; message: string }> {
    logOperation('deleteCostSetting - START', { id });
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
      logOperation('deleteCostSetting - CATCH ERROR', { error });
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      return { success: false, message: `Fout bij verwijderen kostentarief: ${errorMessage}` };
    }
  },

  async getTeamTransactions(teamId: number): Promise<TeamTransaction[]> {
    logOperation('getTeamTransactions - START', { teamId });
    try {
      const rows = await fetchTeamTransactionsByTeamId(teamId);
      const mappedData = rows.map((transaction) => ({
        id: transaction.id,
        team_id: transaction.team_id,
        transaction_type: (transaction.transaction_type || 'adjustment') as TeamTransaction['transaction_type'],
        amount: transaction.amount,
        description: transaction.description ?? null,
        cost_setting_id: transaction.cost_setting_id ?? null,
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
            }
          : undefined,
      }));

      logOperation('getTeamTransactions - SUCCESS', { count: mappedData.length, teamId });
      return mappedData;
    } catch (error) {
      logOperation('getTeamTransactions - CATCH ERROR', { error });
      return [];
    }
  },

  async addTransaction(transaction: Omit<TeamTransaction, 'id' | 'created_at'>): Promise<{ success: boolean; message: string }> {
    logOperation('addTransaction - START', { transaction });
    try {
      if (!transaction.cost_setting_id) {
        return { success: false, message: 'cost_setting_id is verplicht' };
      }

      const { data, error } = await supabase.rpc('add_team_cost_for_session', {
        ...getRpcSessionArgs(),
        p_team_id: transaction.team_id,
        p_cost_setting_id: transaction.cost_setting_id,
        p_amount: transaction.amount,
        p_transaction_date: transaction.transaction_date,
        p_match_id: transaction.match_id ?? null,
      });

      if (error) throw error;
      if ((data as { success?: boolean })?.success === false) {
        return { success: false, message: (data as { error?: string })?.error || 'Fout bij toevoegen' };
      }
      return { success: true, message: 'Transactie succesvol toegevoegd' };
    } catch (error) {
      logOperation('addTransaction - CATCH ERROR', { error });
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      return { success: false, message: `Fout bij toevoegen transactie: ${errorMessage}` };
    }
  },

  async getAffectedTransactions(costSettingId: number): Promise<TeamTransaction[]> {
    logOperation('getAffectedTransactions - START', { costSettingId });
    try {
      const rows = (await fetchAllTeamTransactionsOverview()).filter(
        (t) => t.cost_setting_id === costSettingId,
      );
      const mappedData = rows.map((transaction) => ({
        id: transaction.id,
        team_id: transaction.team_id,
        transaction_type: (transaction.transaction_type || 'adjustment') as TeamTransaction['transaction_type'],
        amount: transaction.amount,
        description: transaction.description ?? null,
        cost_setting_id: transaction.cost_setting_id ?? null,
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
            }
          : undefined,
      }));

      logOperation('getAffectedTransactions - SUCCESS', { count: mappedData.length, costSettingId });
      return mappedData;
    } catch (error) {
      logOperation('getAffectedTransactions - CATCH ERROR', { error });
      return [];
    }
  }
};
