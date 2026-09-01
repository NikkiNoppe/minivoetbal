import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { useTeamOperations } from "./useTeamOperations";
import { adminTeamQueryKeys, useAdminTeamsQuery, type AdminTeam } from "./useTeamsQuery";

interface TeamFormData {
  name: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  club_colors: string;
  preferred_play_moments: {
    days: string[];
    timeslots: string[];
    venues: string[];
    notes: string;
  };
  balance: string;
}

export function useTeamsEnhanced() {
  const queryClient = useQueryClient();
  const teamsQuery = useAdminTeamsQuery();

  const teams = teamsQuery.data ?? [];
  const hasTeams = teamsQuery.data !== undefined;
  const waitingForTeams = !hasTeams && teamsQuery.isFetching;
  const teamsGate = useMinLoadingGate(waitingForTeams);

  const loading =
    !teamsGate.timedOut &&
    !hasTeams &&
    (waitingForTeams || !teamsGate.minReady);

  const error = teamsGate.timedOut
    ? "Het laden van teams duurt te lang (>5 seconden)."
    : teamsQuery.error instanceof Error
      ? teamsQuery.error.message
      : teamsQuery.error
        ? String(teamsQuery.error)
        : null;

  const showError = !!error && !hasTeams && !loading;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<AdminTeam | null>(null);
  const [editingTeam, setEditingTeam] = useState<AdminTeam | null>(null);
  const [formData, setFormData] = useState<TeamFormData>({
    name: "",
    contact_person: "",
    contact_phone: "",
    contact_email: "",
    club_colors: "",
    preferred_play_moments: {
      days: [],
      timeslots: [],
      venues: [],
      notes: "",
    },
    balance: "0",
  });

  const formDataRef = useRef(formData);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const refreshData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminTeamQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
    ]);
  }, [queryClient]);

  const { loading: operationsLoading, createTeam, updateTeam, deleteTeam } =
    useTeamOperations(refreshData);

  const handleEditTeam = (team: AdminTeam) => {
    setEditingTeam(team);
    setFormData({
      name: team.team_name,
      contact_person: team.contact_person || "",
      contact_phone: team.contact_phone || "",
      contact_email: team.contact_email || "",
      club_colors: team.club_colors || "",
      preferred_play_moments: {
        days: team.preferred_play_moments?.days || [],
        timeslots: team.preferred_play_moments?.timeslots || [],
        venues: team.preferred_play_moments?.venues || [],
        notes: team.preferred_play_moments?.notes || "",
      },
      balance: "0",
    });
    setDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingTeam(null);
    setFormData({
      name: "",
      contact_person: "",
      contact_phone: "",
      contact_email: "",
      club_colors: "",
      preferred_play_moments: {
        days: [],
        timeslots: [],
        venues: [],
        notes: "",
      },
      balance: "0",
    });
    setDialogOpen(true);
  };

  const handleFormChange = (field: keyof TeamFormData, value: unknown) => {
    if (field === "preferred_play_moments") {
      setFormData((prevData) => {
        const updated = {
          ...prevData,
          preferred_play_moments: {
            days: prevData.preferred_play_moments?.days || [],
            timeslots: prevData.preferred_play_moments?.timeslots || [],
            venues: prevData.preferred_play_moments?.venues || [],
            notes: prevData.preferred_play_moments?.notes || "",
            ...(value as TeamFormData["preferred_play_moments"]),
          },
        };
        formDataRef.current = updated;
        return updated;
      });
    } else {
      setFormData((prevData) => {
        const updated = { ...prevData, [field]: value };
        formDataRef.current = updated;
        return updated;
      });
    }
  };

  const handleSaveTeam = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const currentFormData = formDataRef.current;

    if (editingTeam) {
      const updatedTeam = await updateTeam(editingTeam.team_id, currentFormData);
      if (updatedTeam) {
        setDialogOpen(false);
        await refreshData();
      }
    } else {
      const newTeam = await createTeam(currentFormData);
      if (newTeam) {
        setDialogOpen(false);
        await refreshData();
      }
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    const success = await deleteTeam(teamId);
    if (success) {
      setConfirmDeleteOpen(false);
      setTeamToDelete(null);
    }
  };

  const confirmDelete = (team: AdminTeam) => {
    setTeamToDelete(team);
    setConfirmDeleteOpen(true);
  };

  return {
    teams,
    loading,
    error: showError ? error : null,
    saving: operationsLoading,
    deleting: operationsLoading,
    dialogOpen,
    setDialogOpen,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    teamToDelete,
    editingTeam,
    formData,
    handleAddNew,
    handleEditTeam,
    handleFormChange,
    handleSaveTeam,
    handleDeleteTeam,
    confirmDelete,
    refreshData,
  };
}
