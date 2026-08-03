import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Edit, Plus, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AppAlertModal, AppModal, DestructiveConfirmDescription } from "@/components/modals";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSeasonDataScope } from "@/hooks/useSeasonDataScope";
import {
  createDefaultDivisions,
  createDivision,
  normalizeCompetitionFormat,
  normalizeCompetitionFormats,
  type CompetitionDivision,
  type CompetitionFormat,
} from "@/services/competitionDataService";
import { cn } from "@/lib/utils";
import { PUBLIC_CARD_CLASS, SectionIcon } from "@/components/layout";

type EditableCompetitionFormat = CompetitionFormat;

const EMPTY_FORMAT: EditableCompetitionFormat = {
  id: 0,
  name: "",
  description: "",
  has_playoffs: false,
  regular_rounds: 1,
  has_divisions: false,
  divisions: [],
};

function formatDivisionSummary(format: CompetitionFormat): string {
  if (!format.has_divisions) return "Enkele reeks";
  const count = format.divisions?.length ?? 0;
  if (count === 0) return "Geen reeksen";
  if (count <= 2) {
    return format.divisions!.map((division) => division.name).join(", ");
  }
  return `${count} reeksen`;
}

const CompetitionFormatsSettings: React.FC = () => {
  const { toast } = useToast();
  const {
    organizationId,
    orgQueryEnabled,
    getSeasonData,
    saveSeasonData,
    clearSeasonDataCache,
  } = useSeasonDataScope();
  const [formats, setFormats] = useState<CompetitionFormat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EditableCompetitionFormat | null>(null);
  const [deleteItem, setDeleteItem] = useState<CompetitionFormat | null>(null);

  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;
    void loadFormats();
  }, [orgQueryEnabled, organizationId]);

  const loadFormats = async () => {
    setIsLoading(true);
    try {
      const data = await getSeasonData();
      setFormats(normalizeCompetitionFormats(data.competition_formats || []));
    } catch (error) {
      console.error("Error loading competition formats:", error);
      toast({
        title: "Fout",
        description: "Kon competitieformaten niet laden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem({
      ...EMPTY_FORMAT,
      id: Date.now(),
    });
    setIsEditOpen(true);
  };

  const handleEdit = (item: CompetitionFormat) => {
    setEditingItem(normalizeCompetitionFormat({ ...item }));
    setIsEditOpen(true);
  };

  const handleDelete = (item: CompetitionFormat) => {
    setDeleteItem(item);
    setIsDeleteOpen(true);
  };

  const updateEditingItem = <K extends keyof EditableCompetitionFormat>(
    field: K,
    value: EditableCompetitionFormat[K],
  ) => {
    setEditingItem((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateDivisions = (nextDivisions: CompetitionDivision[]) => {
    setEditingItem((prev) =>
      prev
        ? {
            ...prev,
            divisions: nextDivisions.map((division, index) => ({
              ...division,
              sort_order: index + 1,
            })),
          }
        : prev,
    );
  };

  const handleDivisionsToggle = (enabled: boolean) => {
    setEditingItem((prev) => {
      if (!prev) return prev;
      const currentDivisions = prev.divisions ?? [];
      return {
        ...prev,
        has_divisions: enabled,
        divisions:
          enabled && currentDivisions.length === 0
            ? createDefaultDivisions()
            : currentDivisions,
      };
    });
  };

  const handleDivisionNameChange = (divisionId: number, name: string) => {
    if (!editingItem?.divisions) return;
    updateDivisions(
      editingItem.divisions.map((division) =>
        division.id === divisionId ? { ...division, name } : division,
      ),
    );
  };

  const handleAddDivision = () => {
    if (!editingItem) return;
    const nextIndex = (editingItem.divisions?.length ?? 0) + 1;
    updateDivisions([
      ...(editingItem.divisions ?? []),
      createDivision(`Reeks ${nextIndex}`, nextIndex),
    ]);
  };

  const handleRemoveDivision = (divisionId: number) => {
    if (!editingItem?.divisions) return;
    updateDivisions(editingItem.divisions.filter((division) => division.id !== divisionId));
  };

  const handleMoveDivision = (divisionId: number, direction: "up" | "down") => {
    if (!editingItem?.divisions) return;
    const index = editingItem.divisions.findIndex((division) => division.id === divisionId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editingItem.divisions.length) return;

    const nextDivisions = [...editingItem.divisions];
    const [moved] = nextDivisions.splice(index, 1);
    nextDivisions.splice(targetIndex, 0, moved);
    updateDivisions(nextDivisions);
  };

  const handleAddDefaultDivisions = () => {
    if (!editingItem) return;
    const existingNames = new Set(
      (editingItem.divisions ?? []).map((division) => division.name.trim().toLowerCase()),
    );
    const defaults = createDefaultDivisions().filter(
      (division) => !existingNames.has(division.name.toLowerCase()),
    );
    updateDivisions([...(editingItem.divisions ?? []), ...defaults]);
  };

  const persistFormats = async (nextFormats: CompetitionFormat[]) => {
    const currentData = await getSeasonData();
    return saveSeasonData({
      ...currentData,
      competition_formats: nextFormats.map(normalizeCompetitionFormat),
    });
  };

  const validateEditingItem = (item: EditableCompetitionFormat): string | null => {
    if (!item.name.trim()) {
      return "Geef het competitieformat minstens een naam.";
    }

    if (!item.has_divisions) return null;

    const divisions = (item.divisions ?? []).map((division) => division.name.trim()).filter(Boolean);
    if (divisions.length < 2) {
      return "Voeg minstens twee reeksen toe (bijv. Eerste klasse en Tweede klasse).";
    }

    const uniqueNames = new Set(divisions.map((name) => name.toLowerCase()));
    if (uniqueNames.size !== divisions.length) {
      return "Reeksnamen moeten uniek zijn.";
    }

    return null;
  };

  const handleSave = async () => {
    if (!editingItem) return;

    const validationError = validateEditingItem(editingItem);
    if (validationError) {
      toast({
        title: "Onvolledig",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    const normalizedItem = normalizeCompetitionFormat(editingItem);

    setIsLoading(true);
    try {
      const nextFormats = [...formats];
      const existingIndex = nextFormats.findIndex((format) => format.id === normalizedItem.id);
      if (existingIndex >= 0) {
        nextFormats[existingIndex] = normalizedItem;
      } else {
        nextFormats.push(normalizedItem);
      }

      const result = await persistFormats(nextFormats);
      if (result.success) {
        toast({
          title: "Competitieformat opgeslagen",
          description: result.message,
        });
        setIsEditOpen(false);
        setEditingItem(null);
        clearSeasonDataCache();
        await loadFormats();
      } else {
        toast({
          title: "Fout bij opslaan",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving competition format:", error);
      toast({
        title: "Fout bij opslaan",
        description: "Kon competitieformat niet opslaan",
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
      const nextFormats = formats.filter((format) => format.id !== deleteItem.id);
      const result = await persistFormats(nextFormats);
      if (result.success) {
        toast({
          title: "Competitieformat verwijderd",
          description: result.message,
        });
        setIsDeleteOpen(false);
        setDeleteItem(null);
        clearSeasonDataCache();
        await loadFormats();
      } else {
        toast({
          title: "Fout bij verwijderen",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting competition format:", error);
      toast({
        title: "Fout bij verwijderen",
        description: "Kon competitieformat niet verwijderen",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-md")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-dark">
            <SectionIcon icon={Trophy} />
            Competitieformats
          </CardTitle>
          <CardDescription>
            Bepaal welke formats beschikbaar zijn voor deze organisatie. Deze templates
            voeden later de competitieplanner, inclusief verdeling over reeksen zoals
            Eerste klasse en Tweede klasse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Voorzichtig wijzigen</AlertTitle>
            <AlertDescription>
              Pas formats alleen aan wanneer je zeker bent dat ze bij deze organisatie horen.
              Wijzigingen gelden enkel voor de actieve tenant en kunnen impact hebben op latere
              competitiegeneratie.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {formats.length} {formats.length === 1 ? "format" : "formats"} beschikbaar
            </p>
            <Button
              type="button"
              onClick={handleAdd}
              className="min-h-[44px] w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nieuw format
            </Button>
          </div>

          {formats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-primary/20 bg-brand-50/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Nog geen competitieformaten geconfigureerd voor deze organisatie.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead className="hidden md:table-cell">Beschrijving</TableHead>
                    <TableHead className="hidden sm:table-cell">Reeksen</TableHead>
                    <TableHead className="hidden sm:table-cell">Play-offs</TableHead>
                    <TableHead className="hidden lg:table-cell">Rondes</TableHead>
                    <TableHead className="text-right w-[88px]">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formats.map((format) => (
                    <TableRow key={format.id}>
                      <TableCell className="font-medium text-brand-dark">
                        <div className="min-w-0">
                          <div className="truncate">{format.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                            {formatDivisionSummary(format)}
                            {format.has_playoffs ? " · Play-offs" : ""}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {format.description || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={format.has_divisions ? "default" : "secondary"}>
                          {formatDivisionSummary(format)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={format.has_playoffs ? "default" : "secondary"}>
                          {format.has_playoffs ? "Play-offs" : "Competitie"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{format.regular_rounds}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="unstyled"
                            className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
                            aria-label="Bewerken"
                            onClick={() => handleEdit(format)}
                          >
                            <Edit className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="unstyled"
                            className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
                            aria-label="Verwijderen"
                            onClick={() => handleDelete(format)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
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
        title={
          editingItem && formats.some((format) => format.id === editingItem.id)
            ? "Competitieformat bewerken"
            : "Nieuw competitieformat"
        }
        size="md"
        primaryAction={{
          label: isLoading ? "Opslaan…" : "Opslaan",
          onClick: () => void handleSave(),
          variant: "primary",
          disabled: isLoading,
          loading: isLoading,
        }}
        secondaryAction={{
          label: "Annuleren",
          onClick: () => {
            setIsEditOpen(false);
            setEditingItem(null);
          },
          variant: "secondary",
        }}
      >
        {editingItem ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="format-name">Naam</Label>
              <Input
                id="format-name"
                className="min-h-[44px]"
                value={editingItem.name}
                onChange={(e) => updateEditingItem("name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format-description">Beschrijving</Label>
              <Input
                id="format-description"
                className="min-h-[44px]"
                value={editingItem.description}
                onChange={(e) => updateEditingItem("description", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format-playoffs">Play-offs</Label>
              <Select
                value={editingItem.has_playoffs ? "true" : "false"}
                onValueChange={(value) => updateEditingItem("has_playoffs", value === "true")}
              >
                <SelectTrigger id="format-playoffs" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ja</SelectItem>
                  <SelectItem value="false">Nee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="format-rounds">Aantal rondes</Label>
              <Input
                id="format-rounds"
                type="number"
                min="1"
                className="min-h-[44px]"
                value={editingItem.regular_rounds}
                onChange={(e) =>
                  updateEditingItem(
                    "regular_rounds",
                    Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                  )
                }
              />
            </div>

            <div className="rounded-xl border border-primary/15 bg-brand-50/40 p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="format-divisions-toggle" className="text-base">
                    Meerdere reeksen
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Verdeel teams over aparte reeksen zoals Eerste klasse, Tweede klasse
                    en Derde klasse. Elke reeks krijgt later een eigen klassement.
                  </p>
                </div>
                <Switch
                  id="format-divisions-toggle"
                  checked={Boolean(editingItem.has_divisions)}
                  onCheckedChange={handleDivisionsToggle}
                  aria-label="Teams verdelen over meerdere reeksen"
                />
              </div>

              {editingItem.has_divisions ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-brand-dark">
                      Reeksen ({editingItem.divisions?.length ?? 0})
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="unstyled"
                        className="btn btn--outline min-h-[44px]"
                        onClick={handleAddDefaultDivisions}
                      >
                        Standaard reeksen
                      </Button>
                      <Button
                        type="button"
                        variant="unstyled"
                        className="btn btn--outline min-h-[44px]"
                        onClick={handleAddDivision}
                      >
                        <Plus className="mr-2 h-4 w-4" aria-hidden />
                        Reeks toevoegen
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(editingItem.divisions ?? []).map((division, index) => (
                      <div
                        key={division.id}
                        className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex items-center gap-2 sm:w-28">
                          <Badge variant="outline" className="bg-brand-50">
                            #{index + 1}
                          </Badge>
                        </div>
                        <Input
                          value={division.name}
                          onChange={(e) => handleDivisionNameChange(division.id, e.target.value)}
                          placeholder={`Bijv. ${index === 0 ? "Eerste klasse" : index === 1 ? "Tweede klasse" : "Derde klasse"}`}
                          className="min-h-[44px] flex-1"
                          aria-label={`Naam reeks ${index + 1}`}
                        />
                        <div className="flex items-center gap-1.5 sm:shrink-0">
                          <Button
                            type="button"
                            variant="unstyled"
                            className="btn btn--icon btn--outline"
                            aria-label={`Reeks ${index + 1} omhoog`}
                            disabled={index === 0}
                            onClick={() => handleMoveDivision(division.id, "up")}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="unstyled"
                            className="btn btn--icon btn--outline"
                            aria-label={`Reeks ${index + 1} omlaag`}
                            disabled={index === (editingItem.divisions?.length ?? 0) - 1}
                            onClick={() => handleMoveDivision(division.id, "down")}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="unstyled"
                            className="btn btn--icon btn--danger"
                            aria-label={`Reeks ${index + 1} verwijderen`}
                            disabled={(editingItem.divisions?.length ?? 0) <= 2}
                            onClick={() => handleRemoveDivision(division.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Minimaal twee reeksen vereist. De volgorde bepaalt de rangorde (bovenaan =
                    hoogste reeks).
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppAlertModal
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Competitieformat verwijderen?"
        description={
          <DestructiveConfirmDescription
            message="Weet je zeker dat je dit competitieformat wilt verwijderen?"
            warning="Deze template verdwijnt uit de beschikbare competitie-opzet voor deze organisatie."
          />
        }
        confirmAction={{
          label: isLoading ? "Verwijderen…" : "Verwijderen",
          onClick: () => void handleDeleteConfirm(),
          variant: "destructive",
          disabled: isLoading,
          loading: isLoading,
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: () => {
            setIsDeleteOpen(false);
            setDeleteItem(null);
          },
          variant: "secondary",
        }}
      />
    </>
  );
};

export default CompetitionFormatsSettings;
