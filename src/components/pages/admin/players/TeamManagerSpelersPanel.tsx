import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertCircle,
  ChevronRight,
  Lock,
  Plus,
  Shield,
} from "lucide-react";
import { PlayerModal } from "@/components/modals";
import {
  PROFILE_INSET_PANEL,
  PROFILE_INSET_SECTION,
  PROFILE_SECTION_LABEL,
  SECTION_COLLAPSIBLE_NESTED_TRIGGER,
} from "@/components/layout";
import PlayersList from "./components/PlayersList";
import { usePlayerDialogs } from "./hooks/usePlayerDialogs";
import { usePlayerListLock } from "./hooks/usePlayerListLock";
import { usePlayerOperations } from "./hooks/usePlayerOperations";
import { formatDate, getFullName, isTeamRosterFull } from "./utils/playerUtils";
import { usePlayersQuery, useInvalidatePlayers } from "@/hooks/usePlayersQuery";
import { useTeamPlayerStats } from "@/hooks/useTeamPlayerStats";
import { useQueryClient } from "@tanstack/react-query";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { useOrganizationContent } from "@/hooks/useOrganizationContent";
import { cn } from "@/lib/utils";

export interface TeamManagerSpelersPanelProps {
  teamId: number;
  teamName?: string;
  /** Platte profiel-layout — geen admin PageHeader */
  embedded?: boolean;
}

function ProfileSectionHeader({
  id,
  label,
  suffix,
  trailing,
}: {
  id?: string;
  label: string;
  suffix?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h3 id={id} className={PROFILE_SECTION_LABEL}>
          {label}
        </h3>
        {suffix}
      </div>
      {trailing}
    </div>
  );
}

function PlayerRegulationsCollapsible() {
  const [open, setOpen] = useState(false);
  const { playerHighlights } = useOrganizationContent().reglement;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="px-4 py-3 sm:px-5">
      <CollapsibleTrigger
        className={cn(SECTION_COLLAPSIBLE_NESTED_TRIGGER, "group w-full rounded-md")}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <Shield className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>Spelersreglement</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 text-xs text-muted-foreground space-y-2 leading-relaxed">
        <p>
          <strong className="text-foreground">Maximum spelers:</strong>{" "}
          {playerHighlights.maxPlayers}
        </p>
        <p>
          <strong className="text-foreground">Teamwijzigingen:</strong>{" "}
          {playerHighlights.transfers}
        </p>
        <p>
          <strong className="text-foreground">Inschrijving:</strong>{" "}
          {playerHighlights.inscription}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const TeamManagerSpelersPanel = memo(function TeamManagerSpelersPanel({
  teamId,
  embedded = false,
}: TeamManagerSpelersPanelProps) {
  const queryClient = useQueryClient();
  const { invalidateTeam } = useInvalidatePlayers();
  const playersQuery = usePlayersQuery(teamId);
  const { data: playerStats } = useTeamPlayerStats(teamId);
  const { isLocked, lockMessage, canEdit } = usePlayerListLock();

  const matchCountByPlayerId = useMemo(() => {
    const map = new Map<number, number>();
    playerStats?.forEach((p) => map.set(p.player_id, p.matchCount));
    return map;
  }, [playerStats]);

  const refreshPlayers = useCallback(async () => {
    invalidateTeam(teamId);
    await queryClient.invalidateQueries({ queryKey: ["teamPlayerStats", teamId] });
    await playersQuery.refetch();
  }, [invalidateTeam, teamId, queryClient, playersQuery]);

  const {
    dialogOpen,
    setDialogOpen,
    editDialogOpen,
    setEditDialogOpen,
    handleEditPlayer: openEditDialog,
  } = usePlayerDialogs();

  const players = playersQuery.data ?? [];

  const {
    newPlayer,
    setNewPlayer,
    editingPlayer,
    setEditingPlayer,
    handleAddPlayer,
    handleSaveEditedPlayer,
    handleRemovePlayer,
  } = usePlayerOperations(teamId, refreshPlayers, setEditDialogOpen, players.length);

  const waitingForRoster = players.length === 0 && playersQuery.isLoading;
  const rosterGate = useMinLoadingGate(waitingForRoster);
  const showRosterSkeleton =
    !rosterGate.timedOut &&
    !playersQuery.error &&
    (waitingForRoster || !rosterGate.minReady);

  const handleOpenAddDialog = useCallback(() => {
    setEditingPlayer(null);
    setEditDialogOpen(false);
    setNewPlayer({ firstName: "", lastName: "", birthDate: "" });
    setDialogOpen(true);
  }, [setEditingPlayer, setEditDialogOpen, setNewPlayer, setDialogOpen]);

  const handleModalClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setDialogOpen(false);
        setEditDialogOpen(false);
        setEditingPlayer(null);
        setNewPlayer({ firstName: "", lastName: "", birthDate: "" });
      }
    },
    [setDialogOpen, setEditDialogOpen, setEditingPlayer, setNewPlayer],
  );

  const onEditPlayer = useCallback(
    (playerId: number) => {
      openEditDialog(playerId, players, setEditingPlayer);
    },
    [openEditDialog, players, setEditingPlayer],
  );

  const modalOpen = dialogOpen || editDialogOpen;

  const rosterHeaderAction = useMemo(() => {
    if (!canEdit || isTeamRosterFull(players.length)) return null;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpenAddDialog}
        className="min-h-[44px] shrink-0 gap-1.5 border-primary/30 text-xs sm:text-sm"
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Speler toevoegen</span>
        <span className="sm:hidden">Toevoegen</span>
      </Button>
    );
  }, [canEdit, players.length, handleOpenAddDialog]);

  if (!embedded) {
    return null;
  }

  return (
    <>
      <div className={PROFILE_INSET_PANEL}>
        <section
          aria-labelledby="profile-players-roster-heading"
          className={PROFILE_INSET_SECTION}
        >
          <ProfileSectionHeader
            id="profile-players-roster-heading"
            label="Spelerslijst"
            suffix={
              !showRosterSkeleton ? (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {players.length} ingeschreven
                </span>
              ) : null
            }
            trailing={rosterHeaderAction}
          />

          {isLocked && lockMessage && (
            <Alert
              className="mb-3 border-amber-200/70 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/25"
              role="status"
            >
              <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-sm text-foreground">
                {lockMessage}
              </AlertDescription>
            </Alert>
          )}

          {playersQuery.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>Spelers laden mislukt.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => playersQuery.refetch()}
                >
                  Opnieuw
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <PlayersList
            players={players}
            loading={showRosterSkeleton}
            editMode={canEdit}
            onRemovePlayer={handleRemovePlayer}
            onEditPlayer={onEditPlayer}
            formatDate={formatDate}
            getFullName={getFullName}
            variant="profile"
            matchCountByPlayerId={matchCountByPlayerId}
          />
        </section>

        <PlayerRegulationsCollapsible />
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
    </>
  );
});
