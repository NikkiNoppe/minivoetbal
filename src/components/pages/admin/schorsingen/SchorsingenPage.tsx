import React, { memo, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Shield, Trophy, Users, Plus } from "lucide-react";
import { useSuspensionsData } from "@/domains/cards-suspensions";
import { useAuth } from "@/hooks/useAuth";
import { ADMIN_ROUTES } from "@/config/routes";
import { PageHeader, PUBLIC_CARD_CLASS, SectionIcon } from "@/components/layout";
import { SuspensionRulesSettings } from "@/components/pages/admin/settings/components/SuspensionRulesSettings";
import type { Suspension } from "@/domains/cards-suspensions";
import { SectionCollapsibleCard } from "@/components/layout";
import { cn } from "@/lib/utils";
import { 
  PlayerCardsTable, 
  SuspensionsTable, 
  AddSuspensionModal, 
  EditSuspensionModal,
  SuspensionFilters 
} from "./components";

// Admin View Component
const AdminView: React.FC = memo(() => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editSuspension, setEditSuspension] = useState<Suspension | null>(null);
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCardsOverview, setShowCardsOverview] = useState(false);
  
  const { 
    suspensions, 
    playerCards, 
    isLoading, 
    playerCardsError,
    suspensionsError,
    refetchPlayerCards,
    refetchSuspensions
  } = useSuspensionsData();

  const filteredSuspensions = useMemo(() => {
    if (!suspensions) return [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return suspensions.filter(s => {
      const matchesTeam = teamFilter === 'all' || String(s.teamId) === teamFilter;
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchesSource = sourceFilter === 'all' || s.source === sourceFilter;
      const matchesSearch = !normalizedSearch ||
        s.playerName.toLowerCase().includes(normalizedSearch) ||
        s.teamName.toLowerCase().includes(normalizedSearch) ||
        s.reason.toLowerCase().includes(normalizedSearch);

      return matchesTeam && matchesStatus && matchesSource && matchesSearch;
    });
  }, [suspensions, teamFilter, statusFilter, sourceFilter, searchTerm]);

  const filteredPlayerCards = useMemo(() => {
    if (!playerCards) return [];
    let filtered = playerCards.filter(c => c.yellowCards > 0 || c.redCards > 0);
    if (teamFilter !== 'all') {
      filtered = filtered.filter(c => String(c.teamId) === teamFilter);
    }
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (normalizedSearch) {
      filtered = filtered.filter(c =>
        c.playerName.toLowerCase().includes(normalizedSearch) ||
        c.teamName.toLowerCase().includes(normalizedSearch)
      );
    }
    return filtered;
  }, [playerCards, teamFilter, searchTerm]);

  const handleRefresh = () => {
    refetchPlayerCards();
    refetchSuspensions();
  };

  const activeCount = filteredSuspensions.filter((s) => s.status === "active").length;
  const manualCount = filteredSuspensions.filter((s) => s.source === "manual").length;
  const automaticCount = filteredSuspensions.filter((s) => s.source === "automatic").length;

  const addSuspensionButton = (
    <Button
      type="button"
      onClick={() => setShowAddModal(true)}
      aria-label="Handmatige schorsing toevoegen"
      className="min-h-[44px] w-full sm:w-auto"
    >
      <Plus className="h-4 w-4" />
      Schorsing toevoegen
    </Button>
  );

  if (playerCardsError || suspensionsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Er is een fout opgetreden bij het laden van de schorsingen.
          <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-4">
            Opnieuw proberen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Schorsingen Beheer"
        icon={Shield}
        subtitle={`Beheer actieve schorsingen en gebruik kaarten als context (${filteredSuspensions.length} resultaat${filteredSuspensions.length === 1 ? "" : "en"})`}
      />

      <SuspensionRulesSettings />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actief
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Handmatig
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">{manualCount}</p>
          </CardContent>
        </Card>
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Automatisch
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">{automaticCount}</p>
          </CardContent>
        </Card>
      </div>

      <SuspensionFilters
        selectedTeam={teamFilter}
        onTeamChange={setTeamFilter}
        selectedStatus={statusFilter}
        onStatusChange={setStatusFilter}
        selectedSource={sourceFilter}
        onSourceChange={setSourceFilter}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        addButton={addSuspensionButton}
      />

      <section role="region" aria-labelledby="suspensions-heading">
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardHeader className="space-y-0 p-4 sm:p-5 pb-4">
            <div className="min-w-0 space-y-1.5">
              <CardTitle id="suspensions-heading" className="flex items-center gap-2">
                <SectionIcon icon={AlertCircle} className="text-destructive" />
                Actieve schorsingen
              </CardTitle>
              <CardDescription>
                Eén overzicht van handmatige schorsingen en automatische kaartschorsingen
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5 bg-transparent">
            {filteredSuspensions.length === 0 && !isLoading ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Geen schorsingen gevonden</h3>
                <p className="text-sm text-muted-foreground">
                  Er zijn geen schorsingen die passen bij de huidige filters.
                </p>
              </div>
            ) : (
              <SuspensionsTable 
                suspensions={filteredSuspensions}
                showTeam={true}
                showActions={true}
                isLoading={isLoading}
                onEdit={setEditSuspension}
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Kaarten context */}
      <section role="region" aria-labelledby="cards-heading">
        <SectionCollapsibleCard
          title="Kaarten context"
          icon={Trophy}
          open={showCardsOverview}
          onOpenChange={setShowCardsOverview}
          badge={
            <span className="text-xs font-normal text-muted-foreground">
              ({filteredPlayerCards.length})
            </span>
          }
        >
          <p className="text-sm text-muted-foreground mb-4" id="cards-heading">
            Compact overzicht van kaarten uit alle ingediende competitie-, beker- en playoffwedstrijden
          </p>
          {filteredPlayerCards.length === 0 && !isLoading ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">Geen kaarten geregistreerd</h3>
              <p className="text-sm text-muted-foreground">
                Er zijn geen kaarten die passen bij de huidige filters.
              </p>
            </div>
          ) : (
            <PlayerCardsTable
              playerCards={filteredPlayerCards}
              suspensions={suspensions || []}
              showTeam={true}
              isLoading={isLoading}
              compact
            />
          )}
        </SectionCollapsibleCard>
      </section>

      <AddSuspensionModal open={showAddModal} onOpenChange={setShowAddModal} />
      <EditSuspensionModal
        open={!!editSuspension}
        onOpenChange={(open) => !open && setEditSuspension(null)}
        suspension={editSuspension}
      />
    </div>
  );
});

AdminView.displayName = 'AdminView';

const SchorsingenPage: React.FC = memo(() => {
  const { user } = useAuth();
  
  const isAdmin = user?.role === 'admin';
  const isTeamManager = user?.role === 'player_manager' && user?.teamId;

  if (isTeamManager) {
    return <Navigate to={`${ADMIN_ROUTES.profile}#schorsingen`} replace />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-up">
      {isAdmin ? (
        <AdminView />
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Je hebt geen toegang tot deze pagina. Neem contact op met een beheerder.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
});

SchorsingenPage.displayName = 'SchorsingenPage';

export default SchorsingenPage;
