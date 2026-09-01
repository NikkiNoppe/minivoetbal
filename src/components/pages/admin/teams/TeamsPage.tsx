import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Shield, AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTeamsEnhanced } from "./hooks/useTeamsEnhanced";
import TeamsList from "./components/TeamsList";
import { TeamModal, ConfirmDeleteModal } from "@/components/modals";
import { PageHeader } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

const AdminTeamPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const {
    teams,
    loading,
    error,
    saving,
    deleting,
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
  } = useTeamsEnhanced();

  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-up">
      <PageHeader
        title="Teams"
        icon={Shield}
        subtitle={`Beheer alle teams in de competitie (${teams.length} team${teams.length === 1 ? "" : "s"})`}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void refreshData()} className="ml-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Opnieuw proberen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <TeamsList
        teams={teams}
        onEdit={handleEditTeam}
        onDelete={confirmDelete}
        loading={loading}
        addTeamButton={
          isAdmin ? (
            <Button onClick={handleAddNew} className="min-h-[44px] w-full sm:w-auto">
              <Plus size={16} />
              Nieuw team
            </Button>
          ) : undefined
        }
      />

      <TeamModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingTeam={editingTeam}
        formData={formData}
        onFormChange={handleFormChange}
        onSave={handleSaveTeam}
        loading={saving}
      />

      <ConfirmDeleteModal
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        team={teamToDelete}
        onConfirm={() => teamToDelete && handleDeleteTeam(teamToDelete.team_id)}
        loading={deleting}
      />
    </div>
  );
};

export default AdminTeamPage;
