import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AppModal, AppAlertModal, DestructiveConfirmDescription } from "@/components/modals";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Edit, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { useSeasonDataScope } from "@/hooks/useSeasonDataScope";
import { competitionDataService, type VenueTimeslot } from "@/services/competitionDataService";
import { SectionIcon } from "@/components/layout";
import { DEFAULT_ORGANIZATION_ID } from "@/config/organization";
import {
  formatTimeslotPeriod,
  normalizeOptionalDateField,
  normalizeVenueTimeslotForSave,
} from "@/lib/timeslotAvailability";
import { sortTimeslotsForDisplay } from "@/lib/timeslotBulkPresets";
import { emitSeasonDataChanged } from "@/lib/seasonDataEvents";

const TimeslotsSettings: React.FC = () => {
  const { toast } = useToast();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { getSeasonData, saveSeasonData } = useSeasonDataScope();
  const [timeslots, setTimeslots] = useState<VenueTimeslot[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VenueTimeslot | null>(null);
  const [deleteItem, setDeleteItem] = useState<VenueTimeslot | null>(null);

  const dayNames: { [key: number]: string } = {
    1: 'Maandag',
    2: 'Dinsdag', 
    3: 'Woensdag',
    4: 'Donderdag',
    5: 'Vrijdag',
    6: 'Zaterdag',
    0: 'Zondag'
  };

  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;
    void loadData();
  }, [orgQueryEnabled, organizationId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const orgId = organizationId ?? undefined;
      const [timeslotsData, venuesData] = await Promise.all([
        competitionDataService.getVenueTimeslots(orgId),
        competitionDataService.getVenues(orgId),
      ]);
      setTimeslots(timeslotsData);
      setVenues(venuesData);
    } catch (error) {
      console.error('\u274c Error loading data:', error);
      toast({
        title: "Fout",
        description: "Kon tijdslots niet laden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (item: VenueTimeslot) => {
    setEditingItem({ ...item });
    setIsEditDialogOpen(true);
  };

  const handleAdd = () => {
    const newTimeslot: VenueTimeslot = {
      timeslot_id: Date.now(),
      venue_id: venues[0]?.venue_id || 1,
      day_of_week: 1,
      start_time: "19:00",
      end_time: "20:30",
      priority: timeslots.length + 1,
    };
    setEditingItem(newTimeslot);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (item: VenueTimeslot) => {
    setDeleteItem(item);
    setIsDeleteDialogOpen(true);
  };

  const updateEditingItem = (field: keyof VenueTimeslot, value: string | number | undefined) => {
    setEditingItem((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = async () => {
    if (!editingItem) return;

    if (!orgQueryEnabled || organizationId == null) {
      toast({
        title: "Fout bij opslaan",
        description: "Organisatie-context is nog niet geladen. Probeer het opnieuw.",
        variant: "destructive",
      });
      return;
    }

    const from = normalizeOptionalDateField(editingItem.valid_from);
    const until = normalizeOptionalDateField(editingItem.valid_until);
    if (from && until && from > until) {
      toast({
        title: "Ongeldige periode",
        description: "De startdatum moet vóór of gelijk zijn aan de einddatum.",
        variant: "destructive",
      });
      return;
    }

    if (!editingItem.start_time?.trim() || !editingItem.end_time?.trim()) {
      toast({
        title: "Onvolledig",
        description: "Start- en eindtijd zijn verplicht.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const currentData = await getSeasonData();
      const updatedTimeslots = [...(currentData.venue_timeslots || [])];
      const slotId = Number(editingItem.timeslot_id);
      const existingIndex = updatedTimeslots.findIndex(
        (t) => Number(t.timeslot_id) === slotId,
      );

      const venue = venues.find((v) => v.venue_id === editingItem.venue_id);
      const timeslotWithVenueName = normalizeVenueTimeslotForSave(
        editingItem,
        venue?.name || editingItem.venue_name || "Onbekend",
      );

      if (existingIndex >= 0) {
        updatedTimeslots[existingIndex] = timeslotWithVenueName;
      } else {
        updatedTimeslots.push(timeslotWithVenueName);
      }

      const result = await saveSeasonData({
        ...currentData,
        venue_timeslots: updatedTimeslots,
      });

      if (result.success) {
        toast({
          title: "Tijdslot opgeslagen",
          description: result.message,
        });

        setIsEditDialogOpen(false);
        setEditingItem(null);
        emitSeasonDataChanged({
          organizationId: organizationId ?? undefined,
          source: "timeslots",
        });
        await loadData();
      } else {
        toast({
          title: "Fout bij opslaan",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Fout bij opslaan",
        description:
          error instanceof Error ? error.message : "Kon tijdslot niet opslaan",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;

    setIsLoading(true);
    try {
      const currentData = await getSeasonData();
      const updatedTimeslots = (currentData.venue_timeslots || []).filter(
        (t) => t.timeslot_id !== deleteItem.timeslot_id,
      );

      const result = await saveSeasonData({
        ...currentData,
        venue_timeslots: updatedTimeslots,
      });

      if (result.success) {
        toast({
          title: "Tijdslot verwijderd",
          description: result.message,
        });

        setIsDeleteDialogOpen(false);
        setDeleteItem(null);
        emitSeasonDataChanged({
          organizationId: organizationId ?? undefined,
          source: "timeslots",
        });
        loadData();
      } else {
        toast({
          title: "Fout bij verwijderen",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Fout bij verwijderen",
        description: "Kon tijdslot niet verwijderen",
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

  const getVenueName = (venueId: number) => {
    const venue = venues.find((v) => v.venue_id === venueId);
    return venue?.name || 'Onbekend';
  };

  const getTimeslotOptionLabel = (slot: VenueTimeslot) =>
    `${getVenueName(slot.venue_id)} · ${dayNames[slot.day_of_week] ?? `Dag ${slot.day_of_week}`} ${slot.start_time}–${slot.end_time}`;

  const getStandbyLabel = (slot: VenueTimeslot) => {
    const primaryId = slot.available_when_blocked_timeslot_id;
    if (primaryId == null) return null;
    const primary = timeslots.find((t) => t.timeslot_id === primaryId);
    if (!primary) return "Reserve tot gekoppeld slot geblokkeerd is";
    return `Reserve tot ${getVenueName(primary.venue_id)} ${primary.start_time} geblokkeerd is`;
  };

  const timeslotsSorted = useMemo(
    () => sortTimeslotsForDisplay(timeslots),
    [timeslots],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SectionIcon icon={Settings} />
            Tijdslots
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Beheer de tijdslots per locatie waar wedstrijden kunnen worden gespeeld.
              Tijdslots blijven behouden bij seizoenswissel of soft-archive; pas ze manueel
              aan als de speeltijden wijzigen.
              Laat de periode leeg voor slots die het hele seizoen gelden, of stel een
              start- en einddatum in voor extra speelmomenten in bepaalde periodes.
              Een reserve-slot telt alleen als het gekoppelde veld die week geblokkeerd is.
            </p>
            {organizationId === DEFAULT_ORGANIZATION_ID ? (
              <p className="text-sm text-muted-foreground">
                Dageraad maandag 21:00–22:00 is extra speelbaar zolang de Zweetvoetmannen
                niet spelen. Markeer hun avonden als veldblokkade op dat slot; dan schuift
                de wedstrijd naar Vlasschaard 18:00–19:00.
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold">Tijdslots</h3>
              <Button
                type="button"
                onClick={handleAdd}
                className="min-h-[44px] w-full sm:w-auto"
                disabled={venues.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nieuwe Tijdslot
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">Locatie</TableHead>
                  <TableHead className="hidden sm:table-cell">Dag</TableHead>
                  <TableHead>Tijd</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="hidden md:table-cell">Prioriteit</TableHead>
                  <TableHead className="text-right w-[88px]">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeslotsSorted.map((timeslot) => {
                  const standbyLabel = getStandbyLabel(timeslot);
                  return (
                  <TableRow key={timeslot.timeslot_id}>
                    <TableCell className="hidden sm:table-cell font-medium">
                      {getVenueName(timeslot.venue_id)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {dayNames[timeslot.day_of_week]}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium tabular-nums">
                        {timeslot.start_time} - {timeslot.end_time}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                        {dayNames[timeslot.day_of_week]}
                        {getVenueName(timeslot.venue_id)
                          ? ` · ${getVenueName(timeslot.venue_id)}`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="line-clamp-2 sm:line-clamp-none">
                        {formatTimeslotPeriod(timeslot)}
                      </span>
                      {standbyLabel ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {standbyLabel}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {timeslot.priority || "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
                          onClick={() => handleEdit(timeslot)}
                          aria-label="Tijdslot bewerken"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
                          onClick={() => handleDelete(timeslot)}
                          aria-label="Tijdslot verwijderen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AppModal
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title={editingItem?.timeslot_id ? 'Bewerk Tijdslot' : 'Nieuwe Tijdslot'}
        size="md"
        primaryAction={{
          label: isLoading ? 'Opslaan...' : 'Opslaan',
          onClick: () => void handleSave(),
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
            <Label htmlFor="timeslotVenue">Locatie</Label>
            <Select
              value={editingItem?.venue_id?.toString() || ''}
              onValueChange={(value) => updateEditingItem('venue_id', parseInt(value, 10))}
            >
              <SelectTrigger id="timeslotVenue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {venues.map((venue) => (
                  <SelectItem key={venue.venue_id} value={venue.venue_id.toString()}>
                    {venue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="timeslotDay">Dag</Label>
            <Select
              value={editingItem?.day_of_week?.toString() || '1'}
              onValueChange={(value) => updateEditingItem('day_of_week', parseInt(value, 10))}
            >
              <SelectTrigger id="timeslotDay">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(dayNames).map(([day, name]) => (
                  <SelectItem key={day} value={day}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="startTime">Starttijd</Label>
              <Input
                id="startTime"
                type="time"
                value={editingItem?.start_time || ''}
                onChange={(e) => updateEditingItem('start_time', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endTime">Eindtijd</Label>
              <Input
                id="endTime"
                type="time"
                value={editingItem?.end_time || ''}
                onChange={(e) => updateEditingItem('end_time', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-primary/20 bg-muted/30 p-3">
            <p className="text-sm font-medium">Beschikbaarheidsperiode</p>
            <p className="text-xs text-muted-foreground">
              Optioneel. Bijv. maandag 18:00–19:00 alleen van 1 september tot 14 oktober
              voor extra speelmomenten in die periode. Leeg = heel seizoen.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="validFrom">Geldig vanaf</Label>
                <Input
                  id="validFrom"
                  type="date"
                  value={editingItem?.valid_from?.split('T')[0] || ''}
                  onChange={(e) => updateEditingItem('valid_from', e.target.value || undefined)}
                />
              </div>
              <div>
                <Label htmlFor="validUntil">Geldig tot</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={editingItem?.valid_until?.split('T')[0] || ''}
                  onChange={(e) => updateEditingItem('valid_until', e.target.value || undefined)}
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="priority">Prioriteit</Label>
            <Input
              id="priority"
              type="number"
              min="1"
              value={
                typeof editingItem?.priority === "number" &&
                Number.isFinite(editingItem.priority)
                  ? editingItem.priority
                  : ""
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                updateEditingItem(
                  "priority",
                  raw === "" ? undefined : Number.parseInt(raw, 10),
                );
              }}
            />
          </div>

          <div>
            <Label htmlFor="standbyFor">Reserve voor geblokkeerd slot</Label>
            <Select
              value={
                editingItem?.available_when_blocked_timeslot_id != null
                  ? String(editingItem.available_when_blocked_timeslot_id)
                  : "none"
              }
              onValueChange={(value) =>
                updateEditingItem(
                  "available_when_blocked_timeslot_id",
                  value === "none" ? undefined : parseInt(value, 10),
                )
              }
            >
              <SelectTrigger id="standbyFor" className="min-h-[44px]">
                <SelectValue placeholder="Altijd beschikbaar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Altijd beschikbaar</SelectItem>
                {timeslots
                  .filter((slot) => slot.timeslot_id !== editingItem?.timeslot_id)
                  .map((slot) => (
                    <SelectItem key={slot.timeslot_id} value={String(slot.timeslot_id)}>
                      {getTimeslotOptionLabel(slot)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Alleen gebruiken als vervanging, bv. Vlasschaard 18:00–19:00 wanneer
              Dageraad 21:00–22:00 niet speelbaar is.
            </p>
          </div>
        </div>
      </AppModal>

      <AppAlertModal
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Bevestig Verwijdering"
        description={
          <DestructiveConfirmDescription message="Weet je zeker dat je dit tijdslot wilt verwijderen?" />
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

export default TimeslotsSettings;
