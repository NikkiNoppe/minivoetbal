import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, AlertCircle, Users} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PUBLIC_CARD_CLASS } from "@/components/layout";
import PlayersList from "./components/PlayersList";
import { PlayerModal } from "@/components/modals";
import PlayerRegulations from "./components/PlayerRegulations";
import { usePlayersUpdatedWithQuery } from "./hooks/usePlayersUpdatedWithQuery";
import { usePlayerListLock } from "./hooks/usePlayerListLock";
import { useAuth } from "@/hooks/useAuth";
import { formatDateShort } from "@/lib/dateUtils";
import { PageHeader } from "@/components/layout";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InlineRetry } from "@/components/modals/matches/inline-player-retry";
import { isTeamRosterFull } from "./utils/playerUtils";

const PlayerPage: React.FC = () => {
  const { user: authUser } = useAuth();
  const {
    players,
    teams,
    loading,
    selectedTeam,
    dialogOpen,
    editDialogOpen,
    newPlayer,
    editingPlayer,
    handleTeamChange,
    setDialogOpen,
    setEditDialogOpen,
    setNewPlayer,
    setEditingPlayer,
    handleAddPlayer,
    handleEditPlayer,
    handleSaveEditedPlayer,
    handleRemovePlayer,
    formatDate,
    getFullName,
    userTeamName,
    error,
    refetch,
    refreshPlayers
  } = usePlayersUpdatedWithQuery();
  const { isLocked, lockMessage, canEdit } = usePlayerListLock();
  
  // Memoized values to prevent unnecessary re-renders
  const isAdmin = useMemo(() => authUser?.role === "admin", [authUser?.role]);
  const currentTeamName = useMemo(() => 
    isAdmin 
      ? teams.find(team => team.team_id === selectedTeam)?.team_name || ""
      : userTeamName
  , [isAdmin, teams, selectedTeam, userTeamName]);

  const hasTeams = useMemo(() => teams.length > 0, [teams.length]);
  const showLockMessage = useMemo(() => isLocked && !isAdmin, [isLocked, isAdmin]);
  const showAddButton = useMemo(
    () => canEdit && (isAdmin || !isTeamRosterFull(players.length)),
    [canEdit, isAdmin, players.length],
  );
  const modalOpen = useMemo(() => dialogOpen || editDialogOpen, [dialogOpen, editDialogOpen]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleOpenAddDialog = useCallback(() => {
    setEditingPlayer(null);
    setEditDialogOpen(false);
    setNewPlayer({ firstName: "", lastName: "", birthDate: "" });
    setDialogOpen(true);
  }, [setEditingPlayer, setEditDialogOpen, setNewPlayer, setDialogOpen]);

  const handleModalClose = useCallback((open: boolean) => {
    if (!open) {
      setDialogOpen(false);
      setEditDialogOpen(false);
      setEditingPlayer(null);
      setNewPlayer({ firstName: "", lastName: "", birthDate: "" });
    }
  }, [setDialogOpen, setEditDialogOpen, setEditingPlayer, setNewPlayer]);

  const handleTeamSelectChange = useCallback((value: string) => {
    if (value === "all" || value === "") {
      handleTeamChange(null);
    } else {
      handleTeamChange(parseInt(value));
    }
    // React Query handles loading state automatically with debouncing
  }, [handleTeamChange]);

  // Memoized team options to prevent unnecessary re-renders
  const teamOptions = useMemo(() => [
    <SelectItem 
      key="all" 
      value="all"
    >
      Alle teams
    </SelectItem>,
    ...teams.map(team => (
      <SelectItem 
        key={team.team_id} 
        value={team.team_id.toString()}
      >
        {team.team_name}
      </SelectItem>
    ))
  ], [teams]);

  const addPlayerButton = showAddButton ? (
    <Button
      onClick={handleOpenAddDialog}
      className="min-h-[44px] w-full sm:w-auto"
    >
      <Plus size={16} />
      Speler toevoegen
    </Button>
  ) : null;

  const subtitle = showLockMessage
    ? lockMessage ?? undefined
    : `${players.length} speler${players.length === 1 ? "" : "s"}${currentTeamName ? ` · ${currentTeamName}` : ""}`;

  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-up">
      <PageHeader
        title="Spelerslijst"
        icon={Users}
        subtitle={subtitle}
      />

      {isAdmin ? (
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="block md:hidden space-y-3">
              <div className="relative min-w-0">
                <Select
                  value={selectedTeam?.toString() || "all"}
                  onValueChange={handleTeamSelectChange}
                  disabled={loading}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full min-h-[44px]",
                      loading && "opacity-70 cursor-not-allowed",
                    )}
                  >
                    <SelectValue placeholder="Alle teams" />
                  </SelectTrigger>
                  <SelectContent>{teamOptions}</SelectContent>
                </Select>
                {loading && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                )}
              </div>
              {addPlayerButton && <div className="pt-2">{addPlayerButton}</div>}
            </div>

            <div className="hidden md:flex md:items-end md:gap-4">
              <div className="flex-1 max-w-sm">
                <div className="relative min-w-0">
                  <Select
                    value={selectedTeam?.toString() || "all"}
                    onValueChange={handleTeamSelectChange}
                    disabled={loading}
                  >
                    <SelectTrigger
                      className={cn(
                        "w-full min-h-[44px]",
                        loading && "opacity-70 cursor-not-allowed",
                      )}
                    >
                      <SelectValue placeholder="Alle teams" />
                    </SelectTrigger>
                    <SelectContent>{teamOptions}</SelectContent>
                  </Select>
                  {loading && (
                    <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </div>
              {addPlayerButton && <div className="flex-shrink-0">{addPlayerButton}</div>}
            </div>
          </CardContent>
        </Card>
      ) : (
        addPlayerButton && (
          <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                {addPlayerButton}
              </div>
            </CardContent>
          </Card>
        )
      )}

      {isAdmin && !hasTeams && !loading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Geen teams in deze organisatie</AlertTitle>
          <AlertDescription>
            Spelers horen bij teams van de actieve competitie. Maak eerst teams aan
            voordat je spelers kunt inschrijven. Dezelfde persoon kan in een andere
            organisatie opnieuw als speler worden toegevoegd.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fout bij laden spelerslijst</AlertTitle>
          <AlertDescription>
            <p className="mb-2">{error.message}</p>
            {error.timeout && (
              <Button
                onClick={() => {
                  // Invalidate queries and retry
                  window.location.reload();
                }}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Pagina vernieuwen
              </Button>
            )}
            {!error.timeout && error.originalError && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Technische details</summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                  {JSON.stringify(error.originalError, null, 2)}
                </pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Inline retry for empty player list (not when truly empty team or still loading) */}
      {!loading && !error && players.length === 0 && selectedTeam && (
        <InlineRetry
          onRetry={async () => { 
            if (refetch) await refetch();
            else await refreshPlayers();
          }}
          isLoading={loading}
          itemCount={players.length}
          emptyMessage="Geen spelers gevonden voor dit team"
          className="mt-4"
        />
      )}

      {/* Players List */}
      {(hasTeams || !isAdmin) && (
      <PlayersList 
        players={players}
        loading={loading}
        editMode={canEdit}
        onRemovePlayer={handleRemovePlayer}
        onEditPlayer={handleEditPlayer}
        formatDate={formatDate}
        getFullName={getFullName}
      />
      )}

      {/* Player Regulations */}
      <div className="mt-6">
        <PlayerRegulations />
      </div>

      <PlayerModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        newPlayer={newPlayer}
        onPlayerChange={setNewPlayer}
        onSave={handleAddPlayer}
        editingPlayer={editingPlayer}
        onEditPlayerChange={setEditingPlayer}
        onEditSave={handleSaveEditedPlayer}
      />
    </div>
  );
};

export default PlayerPage; 