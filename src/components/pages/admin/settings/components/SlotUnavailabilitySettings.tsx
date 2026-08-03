import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AppModal, AppAlertModal, DestructiveConfirmDescription } from '@/components/modals';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarOff, Edit, MapPin, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrgQueryScope } from '@/hooks/useOrganization';
import { useSeasonDataScope } from '@/hooks/useSeasonDataScope';
import { competitionDataService } from '@/services/competitionDataService';
import type { SlotUnavailability } from '@/types/slotUnavailability';
import type { Venue, VenueTimeslot } from '@/services/competitionDataService';
import { PUBLIC_CARD_CLASS } from '@/components/layout';
import { cn } from '@/lib/utils';
import { SectionIcon } from "@/components/layout";
import { emitSeasonDataChanged } from '@/lib/seasonDataEvents';

const DAY_NAMES: Record<number, string> = {
  0: 'Zondag',
  1: 'Maandag',
  2: 'Dinsdag',
  3: 'Woensdag',
  4: 'Donderdag',
  5: 'Vrijdag',
  6: 'Zaterdag',
};

function formatDateNl(dateString: string) {
  return new Date(`${dateString.split('T')[0]}T12:00:00`).toLocaleDateString('nl-BE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeslot(ts: VenueTimeslot | undefined) {
  if (!ts) return '—';
  const day = DAY_NAMES[ts.day_of_week] ?? `Dag ${ts.day_of_week}`;
  return `${day} ${ts.start_time}–${ts.end_time}`;
}

const SlotUnavailabilitySettings: React.FC = () => {
  const { toast } = useToast();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { getSeasonData, saveSeasonData } = useSeasonDataScope();
  const [blocks, setBlocks] = useState<SlotUnavailability[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [timeslots, setTimeslots] = useState<VenueTimeslot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SlotUnavailability | null>(null);
  const [deleteItem, setDeleteItem] = useState<SlotUnavailability | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const orgId = organizationId ?? undefined;
      const [blocksData, venuesData, timeslotsData] = await Promise.all([
        competitionDataService.getSlotUnavailability(orgId),
        competitionDataService.getVenues(orgId),
        competitionDataService.getVenueTimeslots(orgId),
      ]);
      setBlocks(blocksData);
      setVenues(venuesData);
      setTimeslots(timeslotsData);
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon veldblokkades niet laden',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;
    void loadData();
  }, [orgQueryEnabled, organizationId]);

  const timeslotsForVenue = useMemo(() => {
    if (!editingItem?.venue_id) return [];
    return timeslots.filter((ts) => ts.venue_id === editingItem.venue_id);
  }, [timeslots, editingItem?.venue_id]);

  const resolveVenueName = (venueId: number) =>
    venues.find((v) => v.venue_id === venueId)?.name ?? `Locatie ${venueId}`;

  const resolveTimeslotLabel = (timeslotId: number) =>
    formatTimeslot(timeslots.find((ts) => ts.timeslot_id === timeslotId));

  const persistBlocks = async (nextBlocks: SlotUnavailability[]) => {
    const currentData = await getSeasonData();
    return saveSeasonData({
      ...currentData,
      slot_unavailability: nextBlocks,
    });
  };

  const handleAdd = () => {
    const firstVenue = venues[0];
    const firstSlot = timeslots.find((ts) => ts.venue_id === firstVenue?.venue_id);
    setEditingItem({
      id: Date.now(),
      name: '',
      date: '',
      venue_id: firstVenue?.venue_id ?? 1,
      timeslot_id: firstSlot?.timeslot_id ?? 1,
      is_active: true,
      reason: '',
    });
    setIsEditOpen(true);
  };

  const handleEdit = (item: SlotUnavailability) => {
    setEditingItem({ ...item });
    setIsEditOpen(true);
  };

  const handleDelete = (item: SlotUnavailability) => {
    setDeleteItem(item);
    setIsDeleteOpen(true);
  };

  const updateEditing = <K extends keyof SlotUnavailability>(
    field: K,
    value: SlotUnavailability[K],
  ) => {
    setEditingItem((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = async () => {
    if (!editingItem?.name?.trim() || !editingItem.date) {
      toast({
        title: 'Onvolledig',
        description: 'Vul minstens een naam en datum in.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const currentData = await getSeasonData();
      const list = [...(currentData.slot_unavailability || [])];
      const idx = list.findIndex((b) => b.id === editingItem.id);
      if (idx >= 0) {
        list[idx] = editingItem;
      } else {
        list.push(editingItem);
      }
      const result = await saveSeasonData({
        ...currentData,
        slot_unavailability: list,
      });
      if (result.success) {
        toast({ title: 'Veldblokkade opgeslagen', description: result.message });
        setIsEditOpen(false);
        setEditingItem(null);
        emitSeasonDataChanged({
          organizationId: organizationId ?? undefined,
          source: 'slot-unavailability',
        });
        await loadData();
      } else {
        toast({ title: 'Fout', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon veldblokkade niet opslaan',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    setIsLoading(true);
    try {
      const next = blocks.filter((b) => b.id !== deleteItem.id);
      const result = await persistBlocks(next);
      if (result.success) {
        toast({ title: 'Veldblokkade verwijderd' });
        setIsDeleteOpen(false);
        setDeleteItem(null);
        emitSeasonDataChanged({
          organizationId: organizationId ?? undefined,
          source: 'slot-unavailability',
        });
        await loadData();
      } else {
        toast({ title: 'Fout', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon veldblokkade niet verwijderen',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className={cn(PUBLIC_CARD_CLASS)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-dark">
            <SectionIcon icon={MapPin} />
            Veld niet beschikbaar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground max-w-xl">
              Gebruik dit voor onderhoud, events of andere blokkades op één veld. Voor hele weken
              zonder voetbal: gebruik vakantieperiodes.
            </p>
            <Button
              type="button"
              onClick={handleAdd}
              className="min-h-[44px] w-full sm:w-auto shrink-0"
              disabled={isLoading || venues.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" aria-hidden />
              Blokkade toevoegen
            </Button>
          </div>

          {blocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-primary/20 bg-brand-50/30 px-4 py-8 text-center text-sm text-muted-foreground">
              <CalendarOff className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
              Nog geen veldblokades
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead className="hidden sm:table-cell">Datum</TableHead>
                    <TableHead className="hidden md:table-cell">Locatie</TableHead>
                    <TableHead className="hidden lg:table-cell">Tijdslot</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[88px]">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.map((block) => (
                    <TableRow key={block.id}>
                      <TableCell className="font-medium">
                        <div className="min-w-0">
                          <div className="truncate max-w-[180px] sm:max-w-none">{block.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                            {formatDateNl(block.date)}
                            {block.is_active ? "" : " · Inactief"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm sm:table-cell">
                        {formatDateNl(block.date)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {resolveVenueName(block.venue_id)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {resolveTimeslotLabel(block.timeslot_id)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={block.is_active ? "default" : "secondary"}>
                          {block.is_active ? "Actief" : "Inactief"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
                            aria-label="Blokkade bewerken"
                            onClick={() => handleEdit(block)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
                            aria-label="Blokkade verwijderen"
                            onClick={() => handleDelete(block)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AppModal
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title={editingItem && blocks.some((b) => b.id === editingItem.id) ? 'Blokkade bewerken' : 'Nieuwe veldblokkade'}
        size="sm"
        primaryAction={{
          label: isLoading ? 'Opslaan…' : 'Opslaan',
          onClick: () => void handleSave(),
          variant: 'primary',
          disabled: isLoading,
          loading: isLoading,
        }}
        secondaryAction={{
          label: 'Annuleren',
          onClick: () => {
            setIsEditOpen(false);
            setEditingItem(null);
          },
          variant: 'secondary',
        }}
      >
        {editingItem ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="block-name">Naam / reden</Label>
              <Input
                id="block-name"
                className="min-h-[44px]"
                value={editingItem.name}
                onChange={(e) => updateEditing('name', e.target.value)}
                placeholder="Bijv. Dageraad onderhoud"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-date">Datum</Label>
              <Input
                id="block-date"
                type="date"
                className="min-h-[44px]"
                value={editingItem.date.split('T')[0]}
                onChange={(e) => updateEditing('date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Locatie</Label>
              <Select
                value={String(editingItem.venue_id)}
                onValueChange={(v) => {
                  const venueId = Number.parseInt(v, 10);
                  const slot = timeslots.find((ts) => ts.venue_id === venueId);
                  setEditingItem((prev) =>
                    prev
                      ? {
                          ...prev,
                          venue_id: venueId,
                          timeslot_id: slot?.timeslot_id ?? prev.timeslot_id,
                        }
                      : prev,
                  );
                }}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Kies locatie" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.venue_id} value={String(v.venue_id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tijdslot</Label>
              <Select
                value={String(editingItem.timeslot_id)}
                onValueChange={(v) => updateEditing('timeslot_id', Number.parseInt(v, 10))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Kies tijdslot" />
                </SelectTrigger>
                <SelectContent>
                  {timeslotsForVenue.map((ts) => (
                    <SelectItem key={ts.timeslot_id} value={String(ts.timeslot_id)}>
                      {formatTimeslot(ts)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 min-h-[44px]">
              <Switch
                id="block-active"
                checked={editingItem.is_active}
                onCheckedChange={(checked) => updateEditing('is_active', checked)}
              />
              <Label htmlFor="block-active">Actief in planning</Label>
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppAlertModal
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Blokkade verwijderen?"
        description={
          <DestructiveConfirmDescription
            message="Weet je zeker dat je deze veldblokade wilt verwijderen?"
            warning="Deze speelweek krijgt dan weer het volledige aantal beschikbare slots."
          />
        }
        confirmAction={{
          label: isLoading ? 'Verwijderen…' : 'Verwijderen',
          onClick: () => void handleDeleteConfirm(),
          variant: 'destructive',
          disabled: isLoading,
          loading: isLoading,
        }}
        cancelAction={{
          label: 'Annuleren',
          onClick: () => {
            setIsDeleteOpen(false);
            setDeleteItem(null);
          },
          variant: 'secondary',
        }}
      />
    </>
  );
};

export default SlotUnavailabilitySettings;
