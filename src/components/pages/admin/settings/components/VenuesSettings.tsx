import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AppModal, AppAlertModal, DestructiveConfirmDescription } from "@/components/modals";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Edit, Trash2, Building, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSeasonDataScope } from "@/hooks/useSeasonDataScope";
import { competitionDataService } from "@/services";
import { SectionIcon } from "@/components/layout";

function nextVenueId(venues: Array<{ venue_id?: number }>): number {
  const maxId = venues.reduce(
    (max, venue) => Math.max(max, Number(venue.venue_id) || 0),
    0,
  );
  return maxId + 1;
}

function formatSaveError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Onbekende fout";
}

const VenuesSettings: React.FC = () => {
  const { toast } = useToast();
  const { organizationId, orgQueryEnabled, getSeasonData, saveSeasonData } = useSeasonDataScope();
  const [venues, setVenues] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;
    void loadVenues();
  }, [orgQueryEnabled, organizationId]);

  const loadVenues = async () => {
    setIsLoading(true);
    try {
      const venuesData = await competitionDataService.getVenues(organizationId ?? undefined);
      setVenues(venuesData);
    } catch (error) {
      console.error('\u274c Error loading venues:', error);
      toast({
        title: "Fout",
        description: "Kon locaties niet laden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditingItem({ ...item });
    setIsEditDialogOpen(true);
  };

  const handleAdd = () => {
    const newVenue = {
      venue_id: nextVenueId(venues),
      name: '',
      address: '',
    };
    setEditingItem(newVenue);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (item: any) => {
    setDeleteItem(item);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingItem) {
      return;
    }

    if (!orgQueryEnabled || organizationId == null) {
      toast({
        title: "Fout bij opslaan",
        description: "Organisatie-context is nog niet geladen. Probeer het opnieuw.",
        variant: "destructive",
      });
      return;
    }

    const trimmedName = editingItem.name?.trim() ?? '';
    if (!trimmedName) {
      toast({
        title: "Onvolledig",
        description: "Geef de sportzaal een naam.",
        variant: "destructive",
      });
      return;
    }

    const venueToSave = {
      ...editingItem,
      name: trimmedName,
      address: editingItem.address?.trim() ?? '',
    };

    setIsLoading(true);
    try {
      const currentData = await getSeasonData();
      const updatedVenues = [...(currentData.venues || [])];
      const existingIndex = updatedVenues.findIndex(
        (venue) => venue.venue_id === venueToSave.venue_id,
      );

      if (existingIndex >= 0) {
        updatedVenues[existingIndex] = venueToSave;
      } else {
        updatedVenues.push(venueToSave);
      }

      const result = await saveSeasonData({
        ...currentData,
        venues: updatedVenues,
      });

      if (result.success) {
        toast({
          title: "Locatie opgeslagen",
          description: result.message,
        });

        setIsEditDialogOpen(false);
        setEditingItem(null);
        await loadVenues();
      } else {
        toast({
          title: "Fout bij opslaan",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving venue:", error);
      toast({
        title: "Fout bij opslaan",
        description: formatSaveError(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem || !orgQueryEnabled || organizationId == null) {
      return;
    }

    setIsLoading(true);
    try {
      const currentData = await getSeasonData();
      const updatedVenues = (currentData.venues || []).filter(
        (venue) => venue.venue_id !== deleteItem.venue_id,
      );

      const result = await saveSeasonData({
        ...currentData,
        venues: updatedVenues,
      });

      if (result.success) {
        toast({
          title: "Locatie verwijderd",
          description: result.message,
        });

        setIsDeleteDialogOpen(false);
        setDeleteItem(null);
        await loadVenues();
      } else {
        toast({
          title: "Fout bij verwijderen",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting venue:", error);
      toast({
        title: "Fout bij verwijderen",
        description: formatSaveError(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteCancel = () => {
    setIsDeleteDialogOpen(false);
    setDeleteItem(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SectionIcon icon={Settings} />
            Sportzalen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Beheer de sportzalen waar wedstrijden worden gespeeld. Sportzalen zijn{" "}
              <strong>niet seizoensgebonden</strong>: ze blijven in de database staan bij
              seizoenswissel of soft-archive.
              <br />
              <strong>Let op:</strong> Wijzigingen vereisen een herstart van de applicatie.
            </p>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold">Sportzalen</h3>
                <Button
                  type="button"
                  onClick={handleAdd}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Toevoegen
                </Button>
              </div>
              <div className="w-full min-w-0 overflow-x-auto">
                  <Table className="table w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead className="hidden sm:table-cell">Adres</TableHead>
                        <TableHead className="text-right w-[88px]">Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                <TableBody>
                  {isLoading && venues.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground" aria-busy>
                        Locaties laden…
                      </TableCell>
                    </TableRow>
                  ) : venues.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Geen sportzalen gevonden. Voeg er een toe of controleer of
                        seizoensdata voor deze organisatie venues bevat.
                      </TableCell>
                    </TableRow>
                  ) : (
                    venues.map((venue) => (
                      <TableRow key={venue.venue_id}>
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="truncate">{venue.name}</div>
                            {venue.address ? (
                              <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:hidden">
                                {venue.address}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{venue.address}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              type="button"
                              className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
                              onClick={() => handleEdit(venue)}
                              aria-label={`Bewerk ${venue.name}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
                              onClick={() => handleDelete(venue)}
                              aria-label={`Verwijder ${venue.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                  </Table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <AppModal
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title={editingItem?.venue_id ? 'Bewerk Locatie' : 'Nieuwe Locatie'}
        size="sm"
        primaryAction={{
          label: isLoading ? 'Opslaan...' : 'Opslaan',
          onClick: handleSave,
          variant: "primary",
          disabled: isLoading,
          loading: isLoading,
        }}
        secondaryAction={{
          label: "Annuleren",
          onClick: handleCancel,
          variant: "secondary",
        }}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="venueName">Naam</Label>
            <Input 
              id="venueName" 
              value={editingItem?.name || ''} 
              onChange={(e) =>
                setEditingItem((prev) =>
                  prev ? { ...prev, name: e.target.value } : prev,
                )
              }
            />
          </div>
          <div>
            <Label htmlFor="venueAddress">Adres</Label>
            <Input 
              id="venueAddress" 
              value={editingItem?.address || ''} 
              onChange={(e) =>
                setEditingItem((prev) =>
                  prev ? { ...prev, address: e.target.value } : prev,
                )
              }
            />
          </div>
        </div>
      </AppModal>

      {/* Delete Confirmation Dialog */}
      <AppAlertModal
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Bevestig Verwijdering"
        description={
          <DestructiveConfirmDescription message="Weet je zeker dat je deze locatie wilt verwijderen?" />
        }
        confirmAction={{
          label: isLoading ? 'Verwijderen...' : 'Verwijderen',
          onClick: handleDeleteConfirm,
          variant: "destructive",
          disabled: isLoading,
          loading: isLoading,
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: handleDeleteCancel,
          variant: "secondary",
        }}
      />
    </>
  );
};

export default VenuesSettings; 