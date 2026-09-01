import { useCallback, useMemo, useState, useEffect } from "react";
import { usePlayersQuery, useTeamsQuery, useInvalidatePlayers } from "@/hooks/usePlayersQuery";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { usePlayerOperations } from "./usePlayerOperations";
import { usePlayerDialogs } from "./usePlayerDialogs";
import { formatDate, getFullName, handleTeamChange } from "../utils/playerUtils";
import { useAuth } from "@/hooks/useAuth";

/**
 * Spelersbeheer via React Query + useMinLoadingGate (parallel users/teams laden).
 */
export const usePlayersUpdatedWithQuery = () => {
  const { user: authUser } = useAuth();
  const isAdmin = useMemo(() => authUser?.role === "admin", [authUser?.role]);

  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const effectiveTeamId = useMemo(() => {
    if (!isAdmin && authUser?.teamId !== undefined && authUser?.teamId !== null) {
      return authUser.teamId;
    }
    return selectedTeam;
  }, [isAdmin, authUser?.teamId, selectedTeam]);

  const playersQuery = usePlayersQuery(effectiveTeamId);
  const teamsQuery = useTeamsQuery();
  const { invalidateAll, invalidateTeam } = useInvalidatePlayers();

  const hasPlayers = playersQuery.data !== undefined;
  const hasTeams = teamsQuery.data !== undefined;
  const waitingForPlayers = !hasPlayers && playersQuery.isFetching;
  const waitingForTeams = !hasTeams && teamsQuery.isFetching;

  const playersGate = useMinLoadingGate(waitingForPlayers);
  const teamsGate = useMinLoadingGate(waitingForTeams);

  const isLoading =
    (!playersGate.timedOut &&
      !hasPlayers &&
      (waitingForPlayers || !playersGate.minReady)) ||
    (!teamsGate.timedOut &&
      !hasTeams &&
      (waitingForTeams || !teamsGate.minReady));

  const error = useMemo(() => {
    if (playersGate.timedOut) {
      return {
        message:
          "Het laden van de spelerslijst duurt te lang (>5 seconden). Probeer de pagina te vernieuwen of controleer je internetverbinding.",
        timeout: true,
      };
    }
    if (teamsGate.timedOut) {
      return {
        message:
          "Het laden van de teams duurt te lang (>5 seconden). Probeer de pagina te vernieuwen of controleer je internetverbinding.",
        timeout: true,
      };
    }
    if (playersQuery.error) {
      return {
        message:
          "Er is een fout opgetreden bij het laden van de spelerslijst. Probeer het opnieuw of neem contact op met de beheerder.",
        originalError: playersQuery.error,
        timeout: false,
      };
    }
    if (teamsQuery.error) {
      return {
        message:
          "Er is een fout opgetreden bij het laden van de teams. Probeer het opnieuw of neem contact op met de beheerder.",
        originalError: teamsQuery.error,
        timeout: false,
      };
    }
    return null;
  }, [
    playersGate.timedOut,
    teamsGate.timedOut,
    playersQuery.error,
    teamsQuery.error,
  ]);

  const showError = !!error && !isLoading;

  useEffect(() => {
    if (authUser && !hasInitialized) {
      if (!isAdmin && authUser.teamId !== undefined && authUser.teamId !== null) {
        setSelectedTeam(authUser.teamId);
      } else if (isAdmin) {
        setSelectedTeam(null);
        setTimeout(() => {
          invalidateAll();
        }, 0);
      }
      setHasInitialized(true);
    }
  }, [authUser, isAdmin, hasInitialized, invalidateAll]);

  const userTeamName = useMemo(() => {
    if (!isAdmin && authUser?.teamId) {
      const userTeam = teamsQuery.data?.find((team) => team.team_id === authUser.teamId);
      return userTeam?.team_name || "";
    }
    return "";
  }, [isAdmin, authUser?.teamId, teamsQuery.data]);

  const refreshPlayers = useCallback(async () => {
    if (effectiveTeamId !== null) {
      invalidateTeam(effectiveTeamId);
    } else {
      invalidateAll();
    }
  }, [effectiveTeamId, invalidateTeam, invalidateAll]);

  const {
    dialogOpen,
    setDialogOpen,
    editDialogOpen,
    setEditDialogOpen,
    editMode,
    setEditMode,
    handleEditPlayer: handleEditPlayerDialog,
  } = usePlayerDialogs();

  const {
    newPlayer,
    setNewPlayer,
    editingPlayer,
    setEditingPlayer,
    handleAddPlayer,
    handleSaveEditedPlayer,
    handleRemovePlayer,
  } = usePlayerOperations(
    effectiveTeamId,
    refreshPlayers,
    setEditDialogOpen,
    playersQuery.data?.length ?? 0,
  );

  const handleTeamChangeWrapper = useCallback(
    (teamId: number | null) => {
      handleTeamChange(teamId, setSelectedTeam, setEditMode);

      if (teamId !== null) {
        setTimeout(() => {
          invalidateTeam(teamId);
        }, 0);
      } else {
        setTimeout(() => {
          invalidateAll();
        }, 0);
      }
    },
    [setEditMode, invalidateTeam, invalidateAll],
  );

  const handleEditPlayer = useCallback(
    (playerId: number) => {
      const players = playersQuery.data || [];
      handleEditPlayerDialog(playerId, players, setEditingPlayer);
    },
    [handleEditPlayerDialog, playersQuery.data, setEditingPlayer],
  );

  const handleAddPlayerAndMaybeCloseDialog = useCallback(async (): Promise<boolean> => {
    const success = await handleAddPlayer();
    if (success) {
      setDialogOpen(false);
      setEditDialogOpen(false);
      setNewPlayer({ firstName: "", lastName: "", birthDate: "" });
      return true;
    }
    return false;
  }, [handleAddPlayer, setDialogOpen, setEditDialogOpen, setNewPlayer]);

  const memoizedFormatDate = useCallback(formatDate, []);
  const memoizedGetFullName = useCallback(getFullName, []);

  return {
    players: playersQuery.data || [],
    teams: teamsQuery.data || [],
    loading: isLoading,
    error: showError ? error : null,
    editMode,
    selectedTeam,
    dialogOpen,
    editDialogOpen,
    newPlayer,
    editingPlayer,
    setEditMode,
    handleTeamChange: handleTeamChangeWrapper,
    setDialogOpen,
    setEditDialogOpen,
    setNewPlayer,
    setEditingPlayer,
    handleAddPlayer: handleAddPlayerAndMaybeCloseDialog,
    handleEditPlayer,
    handleSaveEditedPlayer,
    handleRemovePlayer,
    formatDate: memoizedFormatDate,
    getFullName: memoizedGetFullName,
    userTeamName,
    refreshPlayers,
    refetch: playersQuery.refetch,
    failureCount: playersQuery.failureCount,
  };
};
