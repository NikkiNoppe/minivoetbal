import React, { memo, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Euro,
  TrendingDown,
  TrendingUp,
  List,
  Calendar,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout";
import { FinancialTeamDetailModal, FinancialSettingsModal } from "@/components/modals";
import { FinancialMonthlyReportsModal } from "@/components/modals";
import { monthlyReportsService } from "@/services/financial";
import { useFinancialData } from "@/hooks/useFinancialData";
import { prefetchTeamFinancialDetail } from "@/components/modals/financial/useTeamFinancialDetailModal";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import type { TeamFinancesSummary } from "@/services/financial/teamCostCategories";
import { amountToTopUp } from "@/services/financial/teamCostCategories";

interface Team {
  team_id: number;
  team_name: string;
}

const FinancialListSkeleton = memo(() => (
  <div className="space-y-4 max-w-full w-full">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="p-4 border border-border rounded-md bg-card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...Array(4)].map((_, j) => (
            <Skeleton key={j} className="h-8 w-full" />
          ))}
        </div>
      </div>
    ))}
  </div>
));

FinancialListSkeleton.displayName = "FinancialListSkeleton";

const AmountSkeleton = memo(() => <Skeleton className="h-4 w-12 mx-auto" />);
AmountSkeleton.displayName = "AmountSkeleton";

const TeamFinancialAmounts = memo(
  ({
    finances,
    isAmountsLoading,
    formatCurrency,
  }: {
    finances: TeamFinancesSummary | null;
    isAmountsLoading: boolean;
    formatCurrency: (amount: number) => string;
  }) => {
    if (isAmountsLoading || !finances) {
      return (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:grid-cols-4 sm:text-xs w-full">
          {["Veld", "Scheids", "Admin", "Boetes"].map((label) => (
            <div key={label} className="flex flex-col items-center">
              <span className="text-muted-foreground">{label}</span>
              <AmountSkeleton />
            </div>
          ))}
        </div>
      );
    }

    const amountColor = "var(--color-500)";
    return (
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:grid-cols-4 w-full">
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground">Veld</span>
          <span className="font-semibold" style={{ color: amountColor }}>
            {formatCurrency(finances.fieldCosts)}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground">Scheids</span>
          <span className="font-semibold" style={{ color: amountColor }}>
            {formatCurrency(finances.refereeCosts)}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground">Admin</span>
          <span className="font-semibold" style={{ color: amountColor }}>
            {formatCurrency(finances.adminCosts)}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground">Boetes</span>
          <span className="font-semibold" style={{ color: amountColor }}>
            {formatCurrency(finances.fines)}
          </span>
        </div>
      </div>
    );
  },
);

TeamFinancialAmounts.displayName = "TeamFinancialAmounts";

const AdminFinancialPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { organizationId } = useOrgQueryScope();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [costListModalOpen, setCostListModalOpen] = useState(false);
  const [monthlyReportsModalOpen, setMonthlyReportsModalOpen] = useState(false);

  const {
    teams,
    calculateTeamFinances,
    formatCurrency,
    syncStatus,
    forceResync,
    isListLoading,
    isAmountsLoading,
    isRefreshing,
    showTeamsEmpty,
    showTransactionsError,
    hasBlockingError,
    teamsError,
    transactionsError,
    refreshInstantly,
    refetchAll,
  } = useFinancialData();

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["available-seasons"],
      queryFn: monthlyReportsService.getAvailableSeasons,
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  const prefetchTeam = useCallback(
    (teamId: number) => {
      void prefetchTeamFinancialDetail(queryClient, teamId, organizationId);
    },
    [queryClient, organizationId],
  );

  const handleTeamClick = (team: Team) => {
    prefetchTeam(team.team_id);
    setSelectedTeam(team);
    setTeamModalOpen(true);
  };

  const handleTeamModalChange = (open: boolean) => {
    setTeamModalOpen(open);
    if (!open) {
      setSelectedTeam(null);
      void refreshInstantly();
    }
  };

  const handleCostListModalChange = (open: boolean) => {
    setCostListModalOpen(open);
    if (!open) void refreshInstantly();
  };

  const handleMonthlyReportsOpen = () => {
    void queryClient.prefetchQuery({
      queryKey: ["available-seasons"],
      queryFn: monthlyReportsService.getAvailableSeasons,
      staleTime: 0,
    });
    setMonthlyReportsModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <PageHeader title="Financieel" icon={Euro} />

      <section>
        <Card className="!bg-transparent !shadow-none" style={{ backgroundColor: "transparent", boxShadow: "none" }}>
          <CardHeader
            className="max-w-full"
            style={{ marginTop: 0, marginBottom: 0, backgroundColor: "unset", background: "unset" }}
          >
            <div className="flex flex-col justify-between gap-4 max-w-full w-full">
              <div className="flex-1 min-w-0 max-w-full w-full">
                <CardTitle className="text-lg">Teams Financieel Overzicht</CardTitle>
              </div>
              <div className="flex gap-2 flex-shrink-0 w-full flex-wrap max-w-full">
                <button
                  onClick={() => setCostListModalOpen(true)}
                  className="btn btn--outline flex items-center gap-2 flex-1 justify-center min-w-[120px] max-w-full w-full min-h-[44px]"
                  style={{ maxWidth: "100%", width: "100%" }}
                >
                  <List className="h-4 w-4" />
                  Kostenlijst
                </button>
                <button
                  onClick={handleMonthlyReportsOpen}
                  className="btn btn--outline flex items-center gap-2 flex-1 justify-center min-w-[120px] max-w-full w-full min-h-[44px]"
                  style={{ maxWidth: "100%", width: "100%" }}
                >
                  <Calendar className="h-4 w-4" />
                  Maandrapport
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent
            className="!bg-transparent max-w-full w-full"
            style={{
              backgroundColor: "unset",
              background: "unset",
              paddingTop: "12px",
              paddingBottom: "12px",
              paddingLeft: "0px",
              paddingRight: "0px",
            }}
          >
            {hasBlockingError && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {(teamsError as Error | undefined)?.message ||
                      "Er is een fout opgetreden bij het laden van de teams."}
                  </span>
                  <Button type="button" variant="unstyled" className="btn btn--secondary" onClick={() => void refetchAll()}>
                    <RefreshCw className="h-3 w-3 mr-1" aria-hidden />
                    Opnieuw
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {showTransactionsError && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {(transactionsError as Error | undefined)?.message ||
                      "Kon financiële transacties niet laden. Teamnamen zijn wel zichtbaar."}
                  </span>
                  <Button type="button" variant="unstyled" className="btn btn--secondary" onClick={() => void refetchAll()}>
                    <RefreshCw className="h-3 w-3 mr-1" aria-hidden />
                    Opnieuw
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {(syncStatus === "syncing" || syncStatus === "synced" || syncStatus === "error") && (
              <div
                role="status"
                className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="flex items-center gap-2">
                  {syncStatus === "syncing" && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      <span>Wedstrijdkosten synchroniseren op de achtergrond…</span>
                    </>
                  )}
                  {syncStatus === "synced" && (
                    <span>Wedstrijdkosten gesynchroniseerd — saldi ververst.</span>
                  )}
                  {syncStatus === "error" && (
                    <span className="text-destructive">
                      Achtergrondsync mislukt. Probeer opnieuw.
                    </span>
                  )}
                </div>
                {syncStatus === "error" && (
                  <Button
                    type="button"
                    variant="unstyled"
                    className="btn btn--secondary min-h-[44px] sm:min-h-7 h-7 gap-1 px-2"
                    onClick={() => void forceResync().then(() => refreshInstantly())}
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Opnieuw
                  </Button>
                )}
              </div>
            )}

            {isRefreshing && !isListLoading && (
              <div className="mb-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Vernieuwen…
              </div>
            )}

            {isListLoading ? (
              <FinancialListSkeleton />
            ) : showTeamsEmpty ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Geen teams gevonden</p>
              </div>
            ) : (
              <div className={`space-y-4 max-w-full w-full transition-opacity ${isRefreshing ? "opacity-80" : ""}`}>
                {(teams ?? []).map((team) => {
                  const finances = calculateTeamFinances(team.team_id);
                  const isNegative = finances ? finances.currentBalance < 0 : false;
                  return (
                    <div
                      key={team.team_id}
                      className="p-4 cursor-pointer active:bg-muted transition-all bg-card border border-border shadow-md hover:shadow-lg max-w-full w-full"
                      style={{
                        paddingLeft: "16px",
                        paddingRight: "16px",
                        paddingTop: "16px",
                        paddingBottom: "16px",
                        marginTop: "12px",
                        marginBottom: "12px",
                        "--hover-border-color": "var(--primary)",
                      } as React.CSSProperties & { "--hover-border-color": string }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--primary)";
                        prefetchTeam(team.team_id);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "";
                      }}
                      onClick={() => handleTeamClick(team)}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-semibold text-sm text-foreground truncate flex-1 min-w-0">
                            {team.team_name}
                          </h3>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isAmountsLoading || !finances ? (
                              <Skeleton className="h-5 w-20" />
                            ) : (
                              <div className={`text-right ${isNegative ? "text-destructive" : "text-green-600"}`}>
                                <div className="flex items-center gap-1 justify-end">
                                  {isNegative ? (
                                    <TrendingDown className="h-4 w-4" />
                                  ) : (
                                    <TrendingUp className="h-4 w-4" />
                                  )}
                                  <span className="font-bold text-sm">
                                    {formatCurrency(finances.currentBalance)}
                                  </span>
                                </div>
                                {amountToTopUp(finances.currentBalance) > 0 ? (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Nog te storten: {formatCurrency(amountToTopUp(finances.currentBalance))}
                                  </p>
                                ) : null}
                              </div>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                        <TeamFinancialAmounts
                          finances={finances}
                          isAmountsLoading={isAmountsLoading}
                          formatCurrency={formatCurrency}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <FinancialTeamDetailModal open={teamModalOpen} onOpenChange={handleTeamModalChange} team={selectedTeam} />

      <FinancialSettingsModal open={costListModalOpen} onOpenChange={handleCostListModalChange} />

      <FinancialMonthlyReportsModal
        open={monthlyReportsModalOpen}
        onOpenChange={setMonthlyReportsModalOpen}
      />
    </div>
  );
};

export default AdminFinancialPage;
