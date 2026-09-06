import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Plus, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useProfilePolls } from "@/hooks/useProfilePolls";
import { useOrganization } from "@/hooks/useOrganization";
import { profilePollService } from "@/services/profilePoll/profilePollService";
import { CreateProfilePollModal } from "./CreateProfilePollModal";
import { ProfilePollResultsCard } from "./ProfilePollResultsCard";
import { AppAlertModal, DestructiveConfirmDescription } from "@/components/modals";

export function ProfilePollAdminSection() {
    const { toast } = useToast();
    const { organizationId } = useOrganization();
    const {
      adminPolls,
      isLoading,
      isFetching,
      showEmpty,
      showError,
      error,
      refresh,
    } = useProfilePolls({ isAdmin: true, enableRealtime: true });

    const [modalOpen, setModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [closingId, setClosingId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    const handleCreate = useCallback(
      async (payload: Parameters<typeof profilePollService.createPoll>[1]) => {
        if (organizationId == null) return;
        await profilePollService.createPoll(organizationId, payload);
        toast({
          title: "Poll gelanceerd",
          description: "De poll is zichtbaar voor de doelgroep.",
        });
        await refresh();
      },
      [toast, refresh, organizationId],
    );

    const handleClose = useCallback(
      async (pollId: number) => {
        if (organizationId == null) return;
        setClosingId(pollId);
        try {
          await profilePollService.closePoll(organizationId, pollId);
          toast({ title: "Poll gesloten" });
          await refresh();
        } catch (err) {
          toast({
            title: "Fout",
            description: err instanceof Error ? err.message : "Kon poll niet sluiten",
            variant: "destructive",
          });
        } finally {
          setClosingId(null);
        }
      },
      [toast, refresh, organizationId],
    );

    const handleDeleteConfirm = useCallback(async () => {
      if (deleteId == null || organizationId == null) return;
      setDeleting(true);
      try {
        await profilePollService.deletePoll(organizationId, deleteId);
        toast({ title: "Poll verwijderd" });
        setDeleteId(null);
        await refresh();
      } catch (err) {
        toast({
          title: "Fout",
          description: err instanceof Error ? err.message : "Kon poll niet verwijderen",
          variant: "destructive",
        });
      } finally {
        setDeleting(false);
      }
    }, [deleteId, toast, refresh, organizationId]);

    const activePolls = adminPolls.filter((p) => p.is_active);
    const inactivePolls = adminPolls.filter((p) => !p.is_active);
    const errorMessage =
      error instanceof Error ? error.message : showError ? "Onbekende fout" : null;

    return (
      <>
        <div className="space-y-4 min-w-0 overflow-hidden">
          {isFetching && adminPolls.length > 0 && (
            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Vernieuwen…
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : showError ? (
            <div className="text-center py-6 space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm font-medium">Kon polls niet laden</p>
              {errorMessage && (
                <p className="text-xs text-muted-foreground">{errorMessage}</p>
              )}
              {errorMessage === "Ongeldige sessie" && (
                <p className="text-xs text-muted-foreground">
                  Log opnieuw in en probeer het daarna opnieuw.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => void refresh()}
              >
                Opnieuw proberen
              </Button>
            </div>
          ) : showEmpty ? (
            <div className="text-center py-8 space-y-2">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nog geen profielpolls. Maak een poll aan voor teamverantwoordelijken of
                scheidsrechters.
              </p>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-11 min-h-[44px] w-full shrink-0 rounded-lg sm:w-auto",
                  "border-primary/30 bg-card text-[var(--color-600)] font-medium shadow-sm",
                  "hover:border-primary/50 hover:bg-muted hover:text-primary",
                  "active:bg-primary/10",
                )}
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2 shrink-0" />
                Nieuwe poll
              </Button>
            </div>
          ) : (
            <div className="space-y-5 min-w-0">
              {activePolls.length > 0 && (
                <section className="space-y-3 min-w-0" aria-label="Actieve profielpolls">
                  <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actief
                    </p>
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full",
                        "border border-border/60 bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground",
                      )}
                    >
                      {activePolls.length}
                    </span>
                  </div>
                  <div className="space-y-3 min-w-0">
                    {activePolls.map((poll) => (
                      <ProfilePollResultsCard
                        key={poll.id}
                        poll={poll}
                        onClose={handleClose}
                        onDelete={async (id) => setDeleteId(id)}
                        isClosing={closingId === poll.id}
                      />
                    ))}
                  </div>
                </section>
              )}
              {inactivePolls.length > 0 && (
                <section className="space-y-3 min-w-0" aria-label="Afgelopen profielpolls">
                  <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Afgelopen / gesloten
                    </p>
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full",
                        "border border-border/60 bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground",
                      )}
                    >
                      {inactivePolls.length}
                    </span>
                  </div>
                  <div className="space-y-3 min-w-0">
                    {inactivePolls.map((poll) => (
                      <ProfilePollResultsCard
                        key={poll.id}
                        poll={poll}
                        onClose={handleClose}
                        onDelete={async (id) => setDeleteId(id)}
                        isDeleting={deleting && deleteId === poll.id}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <CreateProfilePollModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleCreate}
        />

        <AppAlertModal
          open={deleteId != null}
          onOpenChange={(open) => !open && setDeleteId(null)}
          title="Poll verwijderen?"
          description={
            <DestructiveConfirmDescription message="De poll en alle antwoorden worden permanent verwijderd." />
          }
          confirmAction={{
          label: deleting ? "Verwijderen…" : "Verwijderen",
          onClick: () => void handleDeleteConfirm(),
          variant: "destructive",
          loading: deleting,
          }}
          cancelAction={{
            label: "Annuleren",
            onClick: () => setDeleteId(null),
          }}
        />
      </>
    );
}
