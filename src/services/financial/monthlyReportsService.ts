import { fetchAllMatchesForSession } from "@/services/core/matchesSessionFetch";
import { fetchTeamsForSession } from "@/services/core/teamsSessionFetch";
import { costSettingsService } from "./costSettingsService";
import {
  fetchAllTeamTransactionsOverview,
  type FinancialTeamTransaction,
} from "./financialTransactionsFetch";
import {
  computeCurrentBalance,
  computePeriodCostTotals,
  costCategory,
  isAdminCostTransaction,
  isFieldCostTransaction,
  isSeasonTopUpDeposit,
  resolveTeamCostAmount,
  type TeamCostTransaction,
} from "./teamCostCategories";

/** Eén geboekte veldlijn (per ploeg); wedstrijdinfo uit join. */
export interface FieldCostLineDetail {
  matchId: number;
  uniqueNumber: string;
  matchDate: string | null;
  homeTeam: string;
  awayTeam: string;
  billedTeam: string;
  amount: number;
}

export interface MonthlyFieldCosts {
  month: string;
  season: string;
  totalCost: number;
  /** Aantal wedstrijden met minstens één geboekte veldtransactie (distinct match_id) */
  matchCount: number;
  /** Totaal aantal veld-boekingen (meestal 2× matchCount) */
  bookingLines?: number;
  /** Gedetailleerde boekingsregels (compact voor modal) */
  lines?: FieldCostLineDetail[];
}

/** Eén boete-regel in team_costs */
export interface FineLineDetail {
  amount: number;
  teamId: number | null;
  teamName: string;
  matchId: number | null;
  uniqueNumber: string;
  matchDate: string | null;
  homeTeam: string;
  awayTeam: string;
  costLabel: string;
}

export interface MonthlyRefereeCosts {
  month: string;
  season: string;
  referee: string;
  totalCost: number;
  matchCount: number;
  matches?: RefereeMatchInfo[];
}

export interface RefereeMatchInfo {
  match_id: number;
  unique_number: string;
  match_date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

export interface MonthlyFines {
  month: string;
  season: string;
  totalFines: number;
  fineCount: number;
  lines?: FineLineDetail[];
}

export interface MonthlyMatchStats {
  month: string;
  season: string;
  totalMatches: number;
}

export interface SeasonData {
  season: string;
  startYear: number;
  endYear: number;
}

export interface MonthlyReport {
  fieldCosts: MonthlyFieldCosts[];
  refereeCosts: MonthlyRefereeCosts[];
  adminCosts: MonthlyFieldCosts[];
  fines: MonthlyFines[];
  matchStats: MonthlyMatchStats[];
  totalFieldCosts: number;
  totalRefereeCosts: number;
  totalAdminCosts: number;
  totalFines: number;
  totalMatches: number;
  totalForfaits: number;
  /**
   * Som van team-saldi t.e.m. rapport-einddatum.
   * Bij seizoen mét wedstrijden: excl. bijstortingen vanaf 1 juni seizoenseinde.
   * Bij nieuw seizoen (nog geen wedstrijden): incl. bijstortingen.
   */
  totalRemainingBalance: number;
  /** Geen ingediende wedstrijden in deze periode — UI toont alleen saldi. */
  isBalanceOnly: boolean;
  /** Of totalRemainingBalance de bijstortingen naar doelkapitaal meeneemt. */
  balanceIncludesTopUps: boolean;
}

// Helper functions for season handling
const getSeasonFromYear = (year: number): SeasonData => {
  return {
    season: `${year}/${year + 1}`,
    startYear: year,
    endYear: year + 1
  };
};

const getSeasonDates = (seasonData: SeasonData) => {
  // Season runs from July to June - use UTC to avoid timezone issues
  const startDate = new Date(Date.UTC(seasonData.startYear, 6, 1)); // July 1st (month is 0-indexed)
  const endDate = new Date(Date.UTC(seasonData.endYear, 5, 30, 23, 59, 59)); // June 30th
  return { startDate, endDate };
};

/** YYYY-MM uit DB-datum (YYYY-MM-DD of ISO) — voorkomt dat locale timezone de maand verschuift. */
function calendarMonthKeyFromDbDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function seasonFromCalendarMonthKey(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return '';
  if (m >= 7) return `${y}/${y + 1}`;
  return `${y - 1}/${y}`;
}

function nlMonthYearFromKey(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return monthKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
}

function expenseAmount(transaction: {
  amount?: number | string | null;
  team_id: number;
  costs?: { name?: string | null; category?: string | null; amount?: number | string | null } | null;
}): number {
  return Math.abs(
    resolveTeamCostAmount({
      amount: transaction.amount,
      team_id: transaction.team_id,
      cost_settings: transaction.costs
        ? {
            name: transaction.costs.name,
            category: transaction.costs.category,
            amount: transaction.costs.amount,
          }
        : undefined,
    }),
  );
}

function toTeamCostTransaction(transaction: FinancialTeamTransaction): TeamCostTransaction {
  return {
    team_id: transaction.team_id,
    amount: transaction.amount,
    transaction_type: transaction.transaction_type,
    season_label: transaction.season_label,
    cost_settings: transaction.cost_settings,
    description: transaction.description,
  };
}

/** Modal maandfilter (7–12, 13–18) voor computePeriodCostTotals — zelfde als financieel overzicht. */
function reportMonthFilterKey(
  seasonYear: number,
  actualMonth?: number,
  actualYear?: number,
): number | null {
  if (!actualMonth || !actualYear) return null;
  return actualYear === seasonYear ? actualMonth : actualMonth + 12;
}

function isForfaitPenaltyName(name: string | null | undefined): boolean {
  return (name || "").toLowerCase().includes("forfait");
}

type FieldAdminBucket = {
  month: string;
  season: string;
  totalCost: number;
  matchIds: Set<number>;
  lineCount: number;
  lines?: FieldCostLineDetail[];
};

function finalizeFieldAdminBucket(b: FieldAdminBucket): MonthlyFieldCosts {
  const matchCount =
    b.matchIds.size > 0
      ? b.matchIds.size
      : b.lineCount > 0
        ? Math.max(1, Math.ceil(b.lineCount / 2))
        : 0;
  const lines = [...(b.lines || [])].sort((a, b) => {
    const da = a.matchDate || "";
    const db = b.matchDate || "";
    if (da !== db) return da.localeCompare(db);
    return a.uniqueNumber.localeCompare(b.uniqueNumber, "nl");
  });
  return {
    month: b.month,
    season: b.season,
    totalCost: b.totalCost,
    matchCount,
    bookingLines: b.lineCount,
    lines
  };
}

function seasonStartYearFromDate(value: string | null | undefined): number | null {
  const monthKey = calendarMonthKeyFromDbDate(value);
  if (!monthKey) return null;
  const [yStr, mStr] = monthKey.split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return month >= 7 ? year : year - 1;
}

function isDateInRange(value: string | null | undefined, startDateStr: string, endDateStr: string): boolean {
  if (!value) return false;
  const d = value.slice(0, 10);
  return d >= startDateStr && d <= endDateStr;
}

type ReportTransactionRow = {
  transaction_date: string;
  team_id: number;
  match_id: number | null;
  amount: number;
  costs: { name?: string | null; category?: string | null; amount?: number | string | null };
  teams: { team_name: string };
  matches: {
    unique_number?: string;
    match_date?: string;
    teams_home?: { team_name?: string };
    teams_away?: { team_name?: string };
  } | null;
};

function mapTransactionForReport(
  transaction: FinancialTeamTransaction,
  teamNameById: Map<number, string>,
  matchMetaById: Map<
    number,
    {
      unique_number: string | null;
      match_date: string;
      home_team_name: string | null;
      away_team_name: string | null;
    }
  >,
): ReportTransactionRow {
  const matchMeta = transaction.match_id ? matchMetaById.get(transaction.match_id) : undefined;
  return {
    transaction_date: transaction.transaction_date,
    team_id: transaction.team_id,
    match_id: transaction.match_id ?? null,
    amount: transaction.amount,
    costs: {
      name: transaction.cost_settings?.name ?? transaction.description,
      category: transaction.cost_settings?.category ?? transaction.transaction_type,
      amount: transaction.cost_settings?.amount,
    },
    teams: {
      team_name: teamNameById.get(transaction.team_id) || `Team ${transaction.team_id}`,
    },
    matches: matchMeta
      ? {
          unique_number: matchMeta.unique_number ?? undefined,
          match_date: matchMeta.match_date,
          teams_home: matchMeta.home_team_name ? { team_name: matchMeta.home_team_name } : undefined,
          teams_away: matchMeta.away_team_name ? { team_name: matchMeta.away_team_name } : undefined,
        }
      : null,
  };
}

function rowLabelFromMatchJoin(m: any): {
  uniqueNumber: string;
  matchDate: string | null;
  homeTeam: string;
  awayTeam: string;
} {
  if (!m) {
    return { uniqueNumber: "—", matchDate: null, homeTeam: "—", awayTeam: "—" };
  }
  const th = m.teams_home as { team_name?: string } | undefined;
  const ta = m.teams_away as { team_name?: string } | undefined;
  return {
    uniqueNumber: m.unique_number || "—",
    matchDate: m.match_date ?? null,
    homeTeam: th?.team_name || "—",
    awayTeam: ta?.team_name || "—"
  };
}

function getCurrentSeasonStartYear(): number {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? year : year - 1;
}

function isAssignedReferee(referee: string | null | undefined): boolean {
  const name = referee?.trim() ?? "";
  return name.length > 0 && name.toLowerCase() !== "niet toegewezen";
}

export const monthlyReportsService = {
  // Get available seasons based on match/transaction data + altijd het lopende seizoen
  async getAvailableSeasons(): Promise<SeasonData[]> {
    try {
      const transactions = await fetchAllTeamTransactionsOverview();
      let matches: Awaited<ReturnType<typeof fetchAllMatchesForSession>> = [];
      try {
        matches = await fetchAllMatchesForSession();
      } catch (matchError) {
        console.warn("Matches voor seizoenlijst niet beschikbaar, gebruik transacties:", matchError);
      }

      const seasonYears = new Set<number>();
      seasonYears.add(getCurrentSeasonStartYear());

      for (const transaction of transactions) {
        const seasonStartYear = seasonStartYearFromDate(transaction.transaction_date);
        if (seasonStartYear !== null) seasonYears.add(seasonStartYear);
      }

      for (const match of matches) {
        if (!match.is_submitted) continue;
        const seasonStartYear = seasonStartYearFromDate(match.match_date);
        if (seasonStartYear !== null) seasonYears.add(seasonStartYear);
      }

      return Array.from(seasonYears)
        .sort((a, b) => b - a)
        .map((year) => getSeasonFromYear(year));
    } catch (error) {
      console.error("Error fetching available seasons:", error);
      return [getSeasonFromYear(getCurrentSeasonStartYear())];
    }
  },

  async getSeasonReport(seasonYear: number, month?: number, year?: number): Promise<MonthlyReport> {
    return this._getSeasonReport(seasonYear, month, year);
  },

  async _getSeasonReport(seasonYear: number, month?: number, year?: number): Promise<MonthlyReport> {
    try {
      const seasonData = getSeasonFromYear(seasonYear);
      const { startDate, endDate } = getSeasonDates(seasonData);
      
      // Adjust date range if month is specified  
      let filterStartDate = startDate;
      let filterEndDate = endDate;
      
      if (month && year) {
        // Use UTC dates to avoid timezone issues
        filterStartDate = new Date(Date.UTC(year, month - 1, 1));
        filterEndDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      }

      // Fetch all team_costs transactions for the season period
      // IMPORTANT: Use a large range to avoid the default 1000-row Supabase limit
      const startDateStr = filterStartDate.toISOString().split('T')[0];
      const endDateStr = filterEndDate.toISOString().split('T')[0];

      const [allTransactionsRaw, teams, costSettings] = await Promise.all([
        fetchAllTeamTransactionsOverview(),
        fetchTeamsForSession(),
        costSettingsService.getMatchCosts(),
      ]);

      let allMatchesRaw: Awaited<ReturnType<typeof fetchAllMatchesForSession>> = [];
      try {
        allMatchesRaw = await fetchAllMatchesForSession();
      } catch (matchError) {
        console.warn("Matches voor seizoensrapport niet beschikbaar:", matchError);
      }

      const teamNameById = new Map(teams.map((t) => [t.team_id, t.team_name]));
      const matchMetaById = new Map(
        allMatchesRaw.map((m) => [
          m.match_id,
          {
            unique_number: m.unique_number,
            match_date: m.match_date,
            home_team_name: m.home_team_name,
            away_team_name: m.away_team_name,
          },
        ]),
      );

      const periodMonthKey = reportMonthFilterKey(seasonYear, month, year);

      const periodTotals = computePeriodCostTotals(
        allTransactionsRaw.map((t) => ({
          ...toTeamCostTransaction(t),
          transaction_date: t.transaction_date,
        })),
        seasonYear,
        periodMonthKey,
      );

      const transactions = allTransactionsRaw
        .filter((t) => isDateInRange(t.transaction_date, startDateStr, endDateStr))
        .map((t) => mapTransactionForReport(t, teamNameById, matchMetaById));

      const allMatches = allMatchesRaw
        .filter(
          (m) =>
            m.is_submitted &&
            isDateInRange(m.match_date, startDateStr, endDateStr),
        )
        .sort((a, b) => b.match_date.localeCompare(a.match_date));

      const refereeCostSetting = costSettings?.find(cs => 
        cs.name?.toLowerCase().includes('scheidsrechter') || 
        cs.name?.toLowerCase().includes('scheids')
      );
      const refereeCostPerMatch = refereeCostSetting?.amount || 0;

      // Group data by month
      const fieldCostsByMonth: Record<string, FieldAdminBucket> = {};
      const adminCostsByMonth: Record<string, FieldAdminBucket> = {};
      const finesByMonth: Record<string, MonthlyFines> = {};
      const matchStatsByMonth: Record<string, MonthlyMatchStats> = {};
      let totalForfaits = 0;

      // Process transactions for field costs and fines
      transactions?.forEach(transaction => {
        const txMonthKey = calendarMonthKeyFromDbDate(transaction.transaction_date);
        if (!txMonthKey) return;

        const key = month && year ? txMonthKey : 'season-total';
        const monthName =
          month && year ? nlMonthYearFromKey(txMonthKey) : `Seizoen ${seasonData.season}`;
        const seasonLabel =
          month && year ? seasonFromCalendarMonthKey(txMonthKey) : seasonData.season;

        const teamCostRow: TeamCostTransaction = {
          team_id: transaction.team_id,
          amount: transaction.amount,
          transaction_type: transaction.costs?.category ?? null,
          cost_settings: transaction.costs
            ? {
                name: transaction.costs.name,
                category: transaction.costs.category,
                amount: transaction.costs.amount,
              }
            : undefined,
        };
        const costNameRaw = transaction.costs?.name;

        // Field costs — zelfde categorie-logica als teamoverzicht
        if (isFieldCostTransaction(teamCostRow)) {
          if (!fieldCostsByMonth[key]) {
            fieldCostsByMonth[key] = {
              month: monthName,
              season: seasonLabel,
              totalCost: 0,
              matchIds: new Set(),
              lineCount: 0,
              lines: [],
            };
          }
          fieldCostsByMonth[key].totalCost += expenseAmount(transaction);
          fieldCostsByMonth[key].lineCount++;
          const mid = transaction.match_id;
          if (typeof mid === 'number' && mid > 0) {
            fieldCostsByMonth[key].matchIds.add(mid);
          }
          const m = transaction.matches as { unique_number?: string; match_date?: string; teams_home?: { team_name?: string }; teams_away?: { team_name?: string } } | null;
          const meta = rowLabelFromMatchJoin(m);
          const teamRow = transaction.teams as { team_name?: string } | null | undefined;
          const billedTeam =
            teamRow?.team_name ||
            (typeof transaction.team_id === "number" ? `Team ${transaction.team_id}` : "—");
          fieldCostsByMonth[key].lines!.push({
            matchId: typeof mid === "number" && mid > 0 ? mid : 0,
            uniqueNumber: meta.uniqueNumber,
            matchDate: meta.matchDate,
            homeTeam: meta.homeTeam,
            awayTeam: meta.awayTeam,
            billedTeam,
            amount: expenseAmount(transaction),
          });
        }

        // Admin costs
        if (isAdminCostTransaction(teamCostRow)) {
          if (!adminCostsByMonth[key]) {
            adminCostsByMonth[key] = {
              month: monthName,
              season: seasonLabel,
              totalCost: 0,
              matchIds: new Set(),
              lineCount: 0,
              lines: [],
            };
          }
          adminCostsByMonth[key].totalCost += expenseAmount(transaction);
          adminCostsByMonth[key].lineCount++;
          const mid = transaction.match_id;
          if (typeof mid === 'number' && mid > 0) {
            adminCostsByMonth[key].matchIds.add(mid);
          }
        }

        // Penalties/Fines
        if (costCategory(teamCostRow) === "penalty") {
          if (!finesByMonth[key]) {
            finesByMonth[key] = {
              month: monthName,
              season: seasonLabel,
              totalFines: 0,
              fineCount: 0,
              lines: [],
            };
          }
          finesByMonth[key].totalFines += expenseAmount(transaction);
          finesByMonth[key].fineCount++;
          if (isForfaitPenaltyName(costNameRaw)) {
            totalForfaits++;
          }
          const m = transaction.matches as { unique_number?: string; match_date?: string; teams_home?: { team_name?: string }; teams_away?: { team_name?: string } } | null;
          const meta = rowLabelFromMatchJoin(m);
          const teamRow = transaction.teams as { team_name?: string } | null | undefined;
          const billedTeam =
            teamRow?.team_name ||
            (typeof transaction.team_id === "number" ? `Team ${transaction.team_id}` : "—");
          finesByMonth[key].lines!.push({
            amount: expenseAmount(transaction),
            teamId: typeof transaction.team_id === "number" ? transaction.team_id : null,
            teamName: billedTeam,
            matchId: typeof transaction.match_id === "number" ? transaction.match_id : null,
            uniqueNumber: meta.uniqueNumber,
            matchDate: meta.matchDate,
            homeTeam: meta.homeTeam,
            awayTeam: meta.awayTeam,
            costLabel: costNameRaw || "Boete",
          });
        }
      });

      // Build referee costs DIRECTLY from matches table (competitie + beker + play-offs)
      const refereeCostsByReferee: Record<string, MonthlyRefereeCosts> = {};

      allMatches.forEach((match) => {
        const mMonthKey = calendarMonthKeyFromDbDate(match.match_date);
        if (!mMonthKey) return;

        const seasonLabel =
          month && year ? seasonFromCalendarMonthKey(mMonthKey) : seasonData.season;
        const monthName =
          month && year ? nlMonthYearFromKey(mMonthKey) : `Seizoen ${seasonData.season}`;

        const statsKey = month && year ? mMonthKey : "season-total";
        if (!matchStatsByMonth[statsKey]) {
          matchStatsByMonth[statsKey] = {
            month: monthName,
            season: seasonLabel,
            totalMatches: 0,
          };
        }
        matchStatsByMonth[statsKey].totalMatches++;

        const refereeRaw = match.referee?.trim() || "";
        const referee = isAssignedReferee(refereeRaw) ? refereeRaw : "Niet toegewezen";
        const refereeKey = month && year ? `${mMonthKey}-${referee}` : `season-${referee}`;

        if (!refereeCostsByReferee[refereeKey]) {
          refereeCostsByReferee[refereeKey] = {
            month: monthName,
            season: seasonLabel,
            referee,
            totalCost: 0,
            matchCount: 0,
            matches: [],
          };
        }

        refereeCostsByReferee[refereeKey].matchCount++;
        if (isAssignedReferee(referee)) {
          refereeCostsByReferee[refereeKey].totalCost += refereeCostPerMatch * 2;
        }
        refereeCostsByReferee[refereeKey].matches?.push({
          match_id: match.match_id,
          unique_number: match.unique_number || `#${match.match_id}`,
          match_date: match.match_date,
          home_team: match.home_team_name || "Onbekend",
          away_team: match.away_team_name || "Onbekend",
          home_score: match.home_score ?? null,
          away_score: match.away_score ?? null,
        });
      });

      const fieldCosts = Object.values(fieldCostsByMonth).map(finalizeFieldAdminBucket);
      const adminCosts = Object.values(adminCostsByMonth).map(finalizeFieldAdminBucket);
      const refereeCosts = Object.values(refereeCostsByReferee).sort((a, b) => b.matchCount - a.matchCount);
      const fines = Object.values(finesByMonth).map((f) => ({
        ...f,
        lines: f.lines
          ? [...f.lines].sort((a, b) => {
              const da = a.matchDate || "";
              const db = b.matchDate || "";
              if (da !== db) return da.localeCompare(db);
              const c = a.teamName.localeCompare(b.teamName, "nl");
              if (c !== 0) return c;
              return a.costLabel.localeCompare(b.costLabel, "nl");
            })
          : [],
      }));
      const matchStats = Object.values(matchStatsByMonth);
      const totalMatches = matchStats.reduce((sum, item) => sum + item.totalMatches, 0);

      const seasonStartStr = startDate.toISOString().split("T")[0];
      const seasonEndStr = endDate.toISOString().split("T")[0];
      const seasonHasMatches = allMatchesRaw.some(
        (m) =>
          m.is_submitted &&
          isDateInRange(m.match_date, seasonStartStr, seasonEndStr),
      );
      const isBalanceOnly = !seasonHasMatches;
      const balanceIncludesTopUps = isBalanceOnly;

      // Eindsaldo: bij seizoen mét wedstrijden excl. bijstortingen (vanaf 1 juni seizoenseinde);
      // bij nieuw seizoen (geen wedstrijden) incl. bijstortingen.
      const balanceTx = allTransactionsRaw
        .filter((t) => {
          const d = t.transaction_date?.slice(0, 10);
          if (d && d > endDateStr) return false;
          if (balanceIncludesTopUps) return true;
          const dated = {
            ...toTeamCostTransaction(t),
            transaction_date: t.transaction_date,
          };
          return !isSeasonTopUpDeposit(dated, seasonYear);
        })
        .map((t) => toTeamCostTransaction(t));
      const balanceByTeam = new Map<number, TeamCostTransaction[]>();
      for (const tx of balanceTx) {
        if (typeof tx.team_id !== "number") continue;
        const list = balanceByTeam.get(tx.team_id) ?? [];
        list.push(tx);
        balanceByTeam.set(tx.team_id, list);
      }
      let totalRemainingBalance = 0;
      for (const teamId of teams.map((t) => t.team_id)) {
        totalRemainingBalance += computeCurrentBalance(balanceByTeam.get(teamId) ?? []);
      }

      return {
        fieldCosts,
        refereeCosts,
        adminCosts,
        fines,
        matchStats,
        totalFieldCosts: periodTotals.totalFieldCosts,
        totalRefereeCosts: periodTotals.totalRefereeCosts,
        totalAdminCosts: periodTotals.totalAdminCosts,
        totalFines: periodTotals.totalFines,
        totalMatches,
        totalForfaits,
        totalRemainingBalance,
        isBalanceOnly,
        balanceIncludesTopUps,
      };
    } catch (error) {
      console.error('Error fetching season report:', error);
      throw error;
    }
  },

  async getSeasonRefereePayments(seasonYear: number): Promise<MonthlyRefereeCosts[]> {
    try {
      const seasonData = getSeasonFromYear(seasonYear);
      const { startDate, endDate } = getSeasonDates(seasonData);
      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      const [allMatchesRaw, costSettings] = await Promise.all([
        fetchAllMatchesForSession(),
        costSettingsService.getMatchCosts(),
      ]);

      const refereeCostSetting = costSettings.find(
        (cs) =>
          cs.name?.toLowerCase().includes("scheidsrechter") ||
          cs.name?.toLowerCase().includes("scheids"),
      );
      const refereeCostPerMatch = refereeCostSetting?.amount || 0;

      const allMatches = allMatchesRaw.filter(
        (m) =>
          m.is_submitted && isDateInRange(m.match_date, startDateStr, endDateStr),
      );

      const refereePayments: Record<
        string,
        {
          month: string;
          season: string;
          referee: string;
          totalCost: number;
          matchCount: number;
          matches: RefereeMatchInfo[];
        }
      > = {};

      allMatches.forEach((match) => {
        const refereeRaw = match.referee?.trim() || "";
        const referee = isAssignedReferee(refereeRaw) ? refereeRaw : "Niet toegewezen";

        if (!refereePayments[referee]) {
          refereePayments[referee] = {
            month: "Seizoen Totaal",
            season: seasonData.season,
            referee,
            totalCost: 0,
            matchCount: 0,
            matches: [],
          };
        }

        refereePayments[referee].matchCount++;
        if (isAssignedReferee(referee)) {
          refereePayments[referee].totalCost += refereeCostPerMatch * 2;
        }
        refereePayments[referee].matches.push({
          match_id: match.match_id,
          unique_number: match.unique_number || `#${match.match_id}`,
          match_date: match.match_date,
          home_team: match.home_team_name || "Onbekend",
          away_team: match.away_team_name || "Onbekend",
          home_score: match.home_score ?? null,
          away_score: match.away_score ?? null,
        });
      });

      return Object.values(refereePayments)
        .sort((a, b) => b.matchCount - a.matchCount)
        .map((ref) => ({
          month: ref.month,
          season: ref.season,
          referee: ref.referee,
          totalCost: ref.totalCost,
          matchCount: ref.matchCount,
          matches: ref.matches,
        }));
    } catch (error) {
      console.error("Error fetching season referee payments:", error);
      throw error;
    }
  },
};