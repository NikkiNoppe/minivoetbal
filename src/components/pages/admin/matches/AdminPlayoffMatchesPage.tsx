import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getSessionToken } from "@/lib/authSession";
import { useMatchFormsData, MatchFormsFilters } from "@/hooks/useMatchFormsData";
import { MatchFormData } from "./types";
import { Target, AlertCircle, Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import MatchesFormFilter from "./MatchesFormFilter";
import MatchesFormList from "./MatchesFormList";
import { WedstrijdformulierModal } from "@/components/modals";

// Simple components for loading, error, and empty states
const TabContentSkeleton = React.memo(() => (
  <div className="space-y-4 animate-pulse">
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-8 w-full" />
  </div>
));

const ErrorState = React.memo(({ error, onRetry }: { error: any; onRetry: () => void }) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription className="flex items-center justify-between">
      <span>Er is een fout opgetreden: {error?.message || 'Onbekende fout'}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>Probeer opnieuw</Button>
    </AlertDescription>
  </Alert>
));

const EmptyState = React.memo(({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
    <Inbox className="h-12 w-12 mb-4" />
    <p>{message}</p>
  </div>
));

const AdminPlayoffMatchesPage: React.FC = () => {
  // Ensure page starts at top when playoff match forms view loads
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (_) {}
  }, []);
  const { user, authContextReady } = useAuth();
  const isAdmin =
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.isSuperAdmin === true;
  const isReferee = user?.role === "referee";
  const teamId = user?.teamId || 0;

  // Filters state
  const [filters, setFilters] = useState<MatchFormsFilters>({
    searchTerm: "",
    dateFilter: "",
    matchdayFilter: "",
    teamFilter: "",
    sortBy: "date",
    sortOrder: "asc",
    hideCompletedMatches: false
  });

  // Selected match for modal
  const [selectedMatch, setSelectedMatch] = useState<MatchFormData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Admin wedstrijdformulieren: alle wedstrijden (profiel filtert op eigen scheids).
  const hasElevatedPermissions =
    isAdmin || isReferee || user?.role === "superadmin" || user?.isSuperAdmin === true;
  const queriesEnabled =
    authContextReady &&
    !!getSessionToken() &&
    !!user &&
    (hasElevatedPermissions || teamId > 0);

  const matchFormsData = useMatchFormsData(
    teamId, 
    hasElevatedPermissions,
    undefined,
    {
      enabled: queriesEnabled,
      loadTabs: ['playoff'],
    }
  );

  // Get filtered playoff matches
  const playoffData = useMemo(() => 
    matchFormsData.getTabData('playoff', filters), 
    [matchFormsData, filters]
  );

  // Handlers
  const handleFilterChange = useCallback((newFilters: Partial<MatchFormsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const handleMatchSelect = useCallback((match: MatchFormData) => {
    setSelectedMatch(match);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedMatch(null);
  }, []);

  const handleMatchComplete = useCallback(() => {
    matchFormsData.refreshInstantly();
    handleModalClose();
  }, [matchFormsData, handleModalClose]);

  // Team options for filter - MUST be before early returns to satisfy hooks rules
  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    ((playoffData.allMatches as MatchFormData[]) || []).forEach((m: MatchFormData) => {
      if (m.homeTeamName) set.add(m.homeTeamName);
      if (m.awayTeamName) set.add(m.awayTeamName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [playoffData.allMatches]);

  // Loading state
  if (!queriesEnabled || playoffData.isLoading) {
    return <TabContentSkeleton />;
  }

  // Error state
  if (playoffData.isError) {
    return <ErrorState error={playoffData.error} onRetry={() => matchFormsData.refetchPlayoff()} />;
  }

  // No team selected for team managers only (admins and referees don't need teamId)
  if (!isAdmin && !isReferee && !teamId) {
    return <EmptyState message="Geen team toegewezen" />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader title="Play-off formulieren" icon={Target} className="mb-0" />

      <section>
        {playoffData.isLoading ? (
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-3 p-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {(!teamId && !hasElevatedPermissions) ? (
                <div className="p-12 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    <Inbox className="h-12 w-12 text-muted-foreground" />
                    <div className="space-y-2">
                      <h3 className="font-semibold">Geen playoffwedstrijden</h3>
                      <p className="text-muted-foreground">Er zijn momenteel geen playoffwedstrijden beschikbaar.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="px-0 py-4 border-b">
                    <MatchesFormFilter
                      dateFilter={filters.dateFilter}
                      onDateChange={(value) => handleFilterChange({ dateFilter: value })}
                      teamFilter={filters.teamFilter}
                      onTeamChange={(value) => handleFilterChange({ teamFilter: value })}
                      teamOptions={teamOptions}
                      sortBy={filters.sortBy}
                      onSortChange={(value) => handleFilterChange({ sortBy: value })}
                      sortOrder={filters.sortOrder}
                      onSortOrderChange={(value) => handleFilterChange({ sortOrder: value })}
                      hideCompletedMatches={filters.hideCompletedMatches}
                      onHideCompletedChange={(value) => handleFilterChange({ hideCompletedMatches: value })}
                      isTeamManager={false}
                      onClearFilters={() => handleFilterChange({
                        searchTerm: "",
                        dateFilter: "",
                        matchdayFilter: "",
                        teamFilter: "",
                        sortBy: "date",
                        sortOrder: "asc",
                        hideCompletedMatches: false
                      } as MatchFormsFilters)}
                    />
                  </div>
                  {playoffData.matches.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="flex flex-col items-center space-y-4">
                        <Inbox className="h-12 w-12 text-muted-foreground" />
                        <div className="space-y-2">
                          <h3 className="font-semibold">Geen playoffwedstrijden</h3>
                          <p className="text-muted-foreground">Er zijn momenteel geen playoffwedstrijden beschikbaar.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <MatchesFormList
                      matches={playoffData.matches}
                      isLoading={playoffData.isLoading}
                      onSelectMatch={handleMatchSelect}
                      searchTerm={filters.searchTerm}
                      dateFilter={filters.dateFilter}
                      matchdayFilter={filters.matchdayFilter}
                      sortBy={filters.sortBy}
                      hasElevatedPermissions={hasElevatedPermissions}
                      userRole={user?.role}
                      teamId={teamId}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {selectedMatch && (
        <WedstrijdformulierModal
          open={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open);
            if (!open) {
              handleModalClose();
            }
          }}
          match={selectedMatch}
          isAdmin={isAdmin}
          isReferee={isReferee}
          teamId={teamId}
          onComplete={handleMatchComplete}
        />
      )}
    </div>
  );
};

export default React.memo(AdminPlayoffMatchesPage);