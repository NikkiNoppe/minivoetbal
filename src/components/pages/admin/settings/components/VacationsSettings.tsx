import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AppModal, AppAlertModal, DestructiveConfirmDescription } from '@/components/modals';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Edit, Plus, Trash2, Umbrella } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrgQueryScope } from '@/hooks/useOrganization';
import { useSeasonDataScope } from '@/hooks/useSeasonDataScope';
import { competitionDataService } from '@/services/competitionDataService';
import type { VacationPeriod } from '@/services/competitionDataService';
import SlotUnavailabilitySettings from '@/components/pages/admin/settings/components/SlotUnavailabilitySettings';
import { PUBLIC_CARD_CLASS, PUBLIC_PAGE_CLASS } from '@/components/layout';
import { cn } from '@/lib/utils';
import { SectionIcon } from "@/components/layout";
import { pruneOrphanVacationSlotBlocks } from '@/lib/seasonCalendar';
import { emitSeasonDataChanged } from '@/lib/seasonDataEvents';

const VacationsSettings: React.FC = () => {
  const { toast } = useToast();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { getSeasonData, saveSeasonData } = useSeasonDataScope();
  const [vacations, setVacations] = useState<VacationPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VacationPeriod | null>(null);
  const [deleteItem, setDeleteItem] = useState<VacationPeriod | null>(null);

  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;
    void loadVacations();
  }, [orgQueryEnabled, organizationId]);

  const loadVacations = async () => {
    setIsLoading(true);
    try {
      const vacationsData = await competitionDataService.getVacationPeriods(
        organizationId ?? undefined,
      );
      setVacations(vacationsData);
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon vakantieperiodes niet laden',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (item: VacationPeriod) => {
    setEditingItem({ ...item });
    setIsEditDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingItem({
      id: Date.now(),
      name: '',
      start_date: '',
      end_date: '',
      is_active: true,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (item: VacationPeriod) => {
    setDeleteItem(item);
    setIsDeleteDialogOpen(true);
  };

  const updateEditingItem = (field: keyof VacationPeriod, value: string | boolean) => {
    setEditingItem((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setIsLoading(true);
    try {
      const currentData = await getSeasonData();
      const updatedVacations = [...(currentData.vacation_periods || [])];
      const existingIndex = updatedVacations.findIndex((v) => v.id === editingItem.id);

      if (existingIndex >= 0) {
        updatedVacations[existingIndex] = editingItem;
      } else {
        updatedVacations.push(editingItem);
      }

      const pruned = pruneOrphanVacationSlotBlocks(
        currentData.slot_unavailability || [],
        updatedVacations,
      );

      const result = await saveSeasonData({
        ...currentData,
        vacation_periods: updatedVacations,
        slot_unavailability: pruned.blocks,
      });

      if (result.success) {
        toast({
          title: 'Vakantieperiode opgeslagen',
          description:
            pruned.removed.length > 0
              ? `${result.message} · ${pruned.removed.length} slotblokkade(s) buiten de vakantie opgeruimd.`
              : result.message,
        });
        setIsEditDialogOpen(false);
        setEditingItem(null);
        emitSeasonDataChanged({
          organizationId: organizationId ?? undefined,
          source: 'vacations',
        });
        await loadVacations();
      } else {
        toast({ title: 'Fout bij opslaan', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({
        title: 'Fout bij opslaan',
        description: 'Kon vakantieperiode niet opslaan',
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
      const currentData = await getSeasonData();
      const updatedVacations = (currentData.vacation_periods || []).filter(
        (v) => v.id !== deleteItem.id,
      );
      const pruned = pruneOrphanVacationSlotBlocks(
        currentData.slot_unavailability || [],
        updatedVacations,
      );

      const result = await saveSeasonData({
        ...currentData,
        vacation_periods: updatedVacations,
        slot_unavailability: pruned.blocks,
      });

      if (result.success) {
        toast({ title: 'Vakantieperiode verwijderd', description: result.message });
        setIsDeleteDialogOpen(false);
        setDeleteItem(null);
        emitSeasonDataChanged({
          organizationId: organizationId ?? undefined,
          source: 'vacations',
        });
        await loadVacations();
      } else {
        toast({ title: 'Fout bij verwijderen', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({
        title: 'Fout bij verwijderen',
        description: 'Kon vakantieperiode niet verwijderen',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(`${dateString.split('T')[0]}T12:00:00`).toLocaleDateString('nl-BE');

  const vacationsSorted = useMemo(
    () =>
      [...vacations].sort((a, b) =>
        String(a.start_date).slice(0, 10).localeCompare(String(b.start_date).slice(0, 10)),
      ),
    [vacations],
  );

  return (
    <div className={cn(PUBLIC_PAGE_CLASS)}>
      <Tabs defaultValue="vacations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto min-h-[44px] p-1">
          <TabsTrigger value="vacations" className="min-h-[44px] gap-2">
            <Umbrella className="h-4 w-4 shrink-0" aria-hidden />
            Vakantieperiodes
          </TabsTrigger>
          <TabsTrigger value="slots" className="min-h-[44px] gap-2">
            <Calendar className="h-4 w-4 shrink-0" aria-hidden />
            Veld niet beschikbaar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vacations" className="mt-4 space-y-4">
          <Card className={cn(PUBLIC_CARD_CLASS)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-brand-dark">
                <SectionIcon icon={Umbrella} />
                Vakantieperiodes
              </CardTitle>
              <CardDescription>
                Hele periodes zonder competitiewedstrijden. De planner slaat deze weken over.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {vacationsSorted.length} {vacationsSorted.length === 1 ? 'periode' : 'periodes'} geconfigureerd
                </p>
                <Button
                  type="button"
                  onClick={handleAdd}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  Nieuwe vakantieperiode
                </Button>
              </div>

              {vacationsSorted.length === 0 ? (
                <div className="rounded-lg border border-dashed border-primary/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Geen vakantieperiodes — alle speelweken zijn in principe beschikbaar.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>Eind</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vacationsSorted.map((vacation) => (
                        <TableRow key={vacation.id}>
                          <TableCell className="font-medium">{vacation.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(vacation.start_date)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(vacation.end_date)}</TableCell>
                          <TableCell>
                            <Badge variant={vacation.is_active ? 'default' : 'secondary'}>
                              {vacation.is_active ? 'Actief' : 'Inactief'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Button
                                type="button"
                                className="btn btn--icon btn--edit"
                                aria-label="Vakantieperiode bewerken"
                                onClick={() => handleEdit(vacation)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                className="btn btn--icon btn--danger"
                                aria-label="Vakantieperiode verwijderen"
                                onClick={() => handleDelete(vacation)}
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
        </TabsContent>

        <TabsContent value="slots" className="mt-4">
          <SlotUnavailabilitySettings />
        </TabsContent>
      </Tabs>

      <AppModal
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title={
          editingItem && vacations.some((v) => v.id === editingItem.id)
            ? 'Vakantieperiode bewerken'
            : 'Nieuwe vakantieperiode'
        }
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
            setIsEditDialogOpen(false);
            setEditingItem(null);
          },
          variant: 'secondary',
        }}
      >
        {editingItem ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vacationName">Naam</Label>
              <Input
                id="vacationName"
                className="min-h-[44px]"
                value={editingItem.name}
                onChange={(e) => updateEditingItem('name', e.target.value)}
                placeholder="Bijv. Kerstvakantie"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Startdatum</Label>
                <Input
                  id="startDate"
                  type="date"
                  className="min-h-[44px]"
                  value={editingItem.start_date.split('T')[0]}
                  onChange={(e) => updateEditingItem('start_date', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Einddatum</Label>
                <Input
                  id="endDate"
                  type="date"
                  className="min-h-[44px]"
                  value={editingItem.end_date.split('T')[0]}
                  onChange={(e) => updateEditingItem('end_date', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 min-h-[44px]">
              <Switch
                id="isActive"
                checked={editingItem.is_active}
                onCheckedChange={(checked) => updateEditingItem('is_active', checked)}
              />
              <Label htmlFor="isActive">Actief in planning</Label>
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppAlertModal
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Vakantieperiode verwijderen?"
        description={
          <DestructiveConfirmDescription message="Weet je zeker dat je deze vakantieperiode wilt verwijderen?" />
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
            setIsDeleteDialogOpen(false);
            setDeleteItem(null);
          },
          variant: 'secondary',
        }}
      />
    </div>
  );
};

export default VacationsSettings;
