
import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { useTeamsQuery } from "@/hooks/usePlayersQuery";
import { DbUser, Team } from "../userTypes";
import { useUserOperations } from "./useUserOperations";
import { adminUserQueryKeys, useAdminUsersQuery } from "./useUsersQuery";

export const useUserManagement = () => {
  const queryClient = useQueryClient();
  const usersQuery = useAdminUsersQuery();
  const teamsQuery = useTeamsQuery();

  const allUsers = usersQuery.data ?? [];
  const teams: Team[] = teamsQuery.data ?? [];

  const hasUsers = usersQuery.data !== undefined;
  const hasTeams = teamsQuery.data !== undefined;
  const waitingForUsers = !hasUsers && usersQuery.isFetching;
  const waitingForTeams = !hasTeams && teamsQuery.isFetching;

  const usersGate = useMinLoadingGate(waitingForUsers);
  const teamsGate = useMinLoadingGate(waitingForTeams);

  const loading =
    (!usersGate.timedOut &&
      !hasUsers &&
      (waitingForUsers || !usersGate.minReady)) ||
    (!teamsGate.timedOut &&
      !hasTeams &&
      (waitingForTeams || !teamsGate.minReady));

  const error = usersGate.timedOut
    ? "Het laden van gebruikers duurt te lang (>5 seconden)."
    : teamsGate.timedOut
      ? "Het laden van teams duurt te lang (>5 seconden)."
      : usersQuery.error instanceof Error
        ? usersQuery.error.message
        : teamsQuery.error instanceof Error
          ? teamsQuery.error.message
          : usersQuery.error
            ? String(usersQuery.error)
            : teamsQuery.error
              ? String(teamsQuery.error)
              : null;

  const showError = !!error && !hasUsers && !hasTeams && !loading;

  const [addingUser, setAddingUser] = useState(false);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DbUser | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<DbUser | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  const refreshData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminUserQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
    ]);
  }, [queryClient]);

  const filteredUsers = useMemo(() => {
    if (!allUsers.length) {
      return [];
    }

    return allUsers.filter((user) => {
      const matchesSearch =
        searchTerm === "" ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      const matchesTeam =
        teamFilter === "all" ||
        (teamFilter === "none"
          ? !user.teams || user.teams.length === 0
          : user.teams?.some((team) => team.team_id === parseInt(teamFilter, 10)));

      return matchesSearch && matchesRole && matchesTeam;
    });
  }, [allUsers, searchTerm, roleFilter, teamFilter]);

  const { addUser, updateUser, deleteUser } = useUserOperations(teams, refreshData);

  const handleOpenEditDialog = (user: DbUser) => {
    setEditingUser(user);
    setEditDialogOpen(true);
  };

  const handleAddUser = async (formData: {
    username: string;
    email?: string;
    password: string;
    role: "admin" | "referee" | "player_manager";
    teamId: number | null;
    teamIds?: number[];
  }) => {
    setAddingUser(true);
    const success = await addUser(formData);
    setAddingUser(false);
    return success;
  };

  const handleUpdateUser = async (
    userId: number,
    formData: {
      username: string;
      email?: string;
      password?: string;
      role: "admin" | "referee" | "player_manager";
      teamId?: number;
      teamIds?: number[];
      sendPasswordSetupEmail?: boolean;
    },
  ) => {
    setUpdatingUser(true);
    const success = await updateUser(userId, formData);
    setUpdatingUser(false);
    if (success) {
      setEditDialogOpen(false);
      setEditingUser(null);
    }
    return success;
  };

  const handleOpenDeleteConfirmation = (userId: number) => {
    const user = allUsers.find((u) => u.user_id === userId);
    setUserToDelete(user || null);
    setConfirmDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    const success = await deleteUser(userToDelete.user_id);
    setDeletingUser(false);
    if (success) {
      setConfirmDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleDeleteUserById = async (userId: number) => {
    setDeletingUser(true);
    const success = await deleteUser(userId);
    setDeletingUser(false);
    return success;
  };

  return {
    users: filteredUsers,
    teams,
    loading,
    error: showError ? error : null,
    refreshData,
    addingUser,
    updatingUser,
    deletingUser,
    editDialogOpen,
    setEditDialogOpen,
    editingUser,
    confirmDialogOpen,
    setConfirmDialogOpen,
    userToDelete,
    searchTerm,
    roleFilter,
    teamFilter,
    handleSearchChange: setSearchTerm,
    handleRoleFilterChange: setRoleFilter,
    handleTeamFilterChange: setTeamFilter,
    handleAddUser,
    handleOpenEditDialog,
    handleUpdateUser,
    handleOpenDeleteConfirmation,
    handleDeleteUser,
    handleDeleteUserById,
  };
};
