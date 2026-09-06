import React from "react";
import { AlertTriangle, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchFormSectionCard } from "@/components/modals/matches/MatchFormSectionCard";
import type {
  MatchFormMatchCost,
  MatchFormPenaltyItem,
  MatchFormPenaltyOption,
  MatchFormSavedPenalty,
  MatchFormTeamOption,
} from "@/components/modals/matches/matchFormTypes";
import { isAdminMatchCostName } from "@/services/financial/teamCostCategories";

function MatchCostsLoadingSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <span className="sr-only">Wedstrijdkosten laden…</span>
      {[...Array(2)].map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export interface MatchFormFinancialSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  canEdit: boolean;
  matchIsCompleted: boolean;
  matchAppearsPlayed: boolean;
  penalties: MatchFormPenaltyItem[];
  savedPenalties: MatchFormSavedPenalty[];
  sortedPenaltyOptions: MatchFormPenaltyOption[];
  penaltyTeamOptions: MatchFormTeamOption[];
  isLoadingPenalties: boolean;
  isAddPenaltyButtonDisabled: boolean;
  isSavePenaltyButtonDisabled: boolean;
  matchCosts: MatchFormMatchCost[];
  isLoadingMatchCosts: boolean;
  hasForfaitPenalty: boolean;
  skipAutoMatchCosts: boolean;
  restoringAutoMatchCosts: boolean;
  editingCostId: number | null;
  editingCostAmount: string;
  onAddPenalty: () => void;
  onClearPenalties: () => void;
  onUpdatePenalty: (index: number, field: keyof MatchFormPenaltyItem, value: number | null) => void;
  onRemovePenaltyDraft: (index: number) => void;
  onSavePenalties: () => void;
  onRemoveSavedPenalty: (index: number) => void;
  onRestoreAutoMatchCosts: () => void;
  onStartEditCost: (costId: number, amount: number) => void;
  onCancelEditCost: () => void;
  onEditingCostAmountChange: (value: string) => void;
  onUpdateMatchCostAmount: (costId: number, amount: number) => void;
  onDeleteMatchCost: (costId: number) => void;
  costNameImpliesMatchCostSuppression: (name: string) => boolean;
}

export function MatchFormFinancialSection({
  open,
  onOpenChange,
  isAdmin,
  canEdit,
  matchIsCompleted,
  matchAppearsPlayed,
  penalties,
  savedPenalties,
  sortedPenaltyOptions,
  penaltyTeamOptions,
  isLoadingPenalties,
  isAddPenaltyButtonDisabled,
  isSavePenaltyButtonDisabled,
  matchCosts,
  isLoadingMatchCosts,
  hasForfaitPenalty,
  skipAutoMatchCosts,
  restoringAutoMatchCosts,
  editingCostId,
  editingCostAmount,
  onAddPenalty,
  onClearPenalties,
  onUpdatePenalty,
  onRemovePenaltyDraft,
  onSavePenalties,
  onRemoveSavedPenalty,
  onRestoreAutoMatchCosts,
  onStartEditCost,
  onCancelEditCost,
  onEditingCostAmountChange,
  onUpdateMatchCostAmount,
  onDeleteMatchCost,
  costNameImpliesMatchCostSuppression,
}: MatchFormFinancialSectionProps) {
  const hasPenaltyContent =
    canEdit || penalties.length > 0 || savedPenalties.length > 0;
  const isEmpty = !hasPenaltyContent && !isAdmin;

  return (
    <MatchFormSectionCard
      open={open}
      onOpenChange={onOpenChange}
      title="Financieel"
    >
      {isEmpty ? null : (
      <CardContent className="pt-3">
        <div className="space-y-4">
          {hasPenaltyContent && (
          <div className="space-y-3">
            {(penalties.length > 0 || savedPenalties.length > 0) && (
            <h4 className="border-b border-border pb-1 text-sm font-bold text-foreground">Boetes</h4>
            )}

            {canEdit && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={onAddPenalty}
                  disabled={isAddPenaltyButtonDisabled}
                  className="btn btn--secondary h-8 w-full px-3 sm:flex-1"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Boete toevoegen
                </Button>
              </div>
            )}

            {penalties.length > 0 && (
              <div id="penalties-new-list" className="animate-in fade-in slide-in-from-top-1 space-y-2.5 duration-200">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">Nieuwe boetes</span>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary text-muted-foreground">
                      {penalties.length} {penalties.length === 1 ? "boete" : "boetes"}
                    </span>
                  </div>
                  {penalties.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onClearPenalties}
                      className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="mr-0.5 h-3 w-3" />
                      Alles wissen
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {penalties.map((penalty, index) => {
                    const isValid = penalty.teamId && penalty.costSettingId;
                    return (
                      <div
                        key={`penalty-${index}`}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all duration-200",
                          isValid
                            ? "border-primary/30 bg-primary/5 shadow-sm"
                            : "border-border bg-muted/50",
                        )}
                      >
                        <div
                          className={cn(
                            "grid items-end gap-1.5",
                            canEdit
                              ? "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                              : "grid-cols-1 md:grid-cols-2",
                          )}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <Label htmlFor={`penalty-team-${index}`} className="text-xs font-medium">
                              Team
                            </Label>
                            <Select
                              value={penalty.teamId ? penalty.teamId.toString() : undefined}
                              onValueChange={(v) => onUpdatePenalty(index, "teamId", parseInt(v, 10))}
                              disabled={!canEdit}
                            >
                              <SelectTrigger
                                id={`penalty-team-${index}`}
                                className="dropdown-login-style h-8 w-full text-sm"
                              >
                                <SelectValue placeholder="Selecteer team" />
                              </SelectTrigger>
                              <SelectContent className="dropdown-content-login-style z-50">
                                {penaltyTeamOptions.map((team) => (
                                  <SelectItem
                                    key={team.id}
                                    value={team.id.toString()}
                                    className="dropdown-item-login-style"
                                  >
                                    {team.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div
                            className={cn(
                              "min-w-0 space-y-0.5",
                              canEdit && "col-span-2 md:col-span-1",
                            )}
                          >
                            <Label htmlFor={`penalty-cost-${index}`} className="text-xs font-medium">
                              Type Boete
                            </Label>
                            <Select
                              value={penalty.costSettingId ? penalty.costSettingId.toString() : undefined}
                              onValueChange={(v) =>
                                onUpdatePenalty(index, "costSettingId", parseInt(v, 10))
                              }
                              disabled={!canEdit || !penalty.teamId}
                            >
                              <SelectTrigger
                                id={`penalty-cost-${index}`}
                                className="dropdown-login-style h-8 w-full text-sm"
                              >
                                <SelectValue
                                  placeholder={
                                    !penalty.teamId ? "Eerst team kiezen" : "Selecteer boete type"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent className="dropdown-content-login-style z-50">
                                {sortedPenaltyOptions.map((costSetting) => (
                                  <SelectItem
                                    key={costSetting.id}
                                    value={costSetting.id.toString()}
                                    className="dropdown-item-login-style"
                                  >
                                    {costSetting.name} - €{costSetting.amount}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onRemovePenaltyDraft(index)}
                              className="row-start-1 col-start-2 flex h-8 min-h-[44px] w-8 min-w-[44px] shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-all duration-150 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive md:col-start-3"
                              aria-label="Boete verwijderen"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end border-t border-border pt-1.5">
                  <Button
                    onClick={onSavePenalties}
                    className="btn btn--secondary h-8 w-full px-4 sm:w-auto"
                    disabled={isSavePenaltyButtonDisabled || isLoadingPenalties}
                  >
                    {isLoadingPenalties ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Opslaan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Boetes opslaan
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {savedPenalties.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-t border-border pt-2">
                  <span className="text-sm font-semibold text-foreground">Opgeslagen boetes</span>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-muted-foreground text-primary">
                    {savedPenalties.length} {savedPenalties.length === 1 ? "boete" : "boetes"}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {savedPenalties.map((penalty, index) => {
                    const forfaitOnPlayedMatch =
                      matchAppearsPlayed &&
                      costNameImpliesMatchCostSuppression(penalty.penaltyName);
                    return (
                      <div
                        key={penalty.id ?? index}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-lg border bg-white p-3.5 text-sm shadow-sm transition-all duration-150 hover:bg-muted/20 hover:shadow-md",
                          forfaitOnPlayedMatch && "border-amber-400 bg-amber-50/40",
                        )}
                        style={forfaitOnPlayedMatch ? undefined : { borderColor: "var(--color-400)" }}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/80 shadow-sm">
                            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {penalty.teamName}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {penalty.penaltyName}
                              </span>
                              <span className="text-xs font-semibold text-foreground">
                                €{penalty.amount}
                              </span>
                            </div>
                            {forfaitOnPlayedMatch && (
                              <p className="mt-1 text-xs text-amber-900">
                                Waarschijnlijk fout: wedstrijd heeft uitslag — forfait verwittigd hoort
                                hier niet.
                              </p>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            type="button"
                            onClick={() => onRemoveSavedPenalty(index)}
                            className="btn btn--icon btn--danger shrink-0"
                            aria-label="Boete verwijderen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          )}

          {isAdmin && (
            <div className="space-y-3">
              <h4 className="border-b border-border pb-1 text-sm font-bold text-foreground">
                Wedstrijdkosten
              </h4>

              {hasForfaitPenalty && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm",
                    matchAppearsPlayed
                      ? "border-amber-300 bg-amber-50/90 text-amber-950"
                      : "border-blue-200 bg-blue-50/80 text-blue-950",
                  )}
                >
                  {matchAppearsPlayed ? (
                    <p>
                      Er staat een forfait-boete op een wedstrijd met uitslag. Dat hoort normaal niet —
                      verwijder de boete bij Financieel als die per ongeluk is toegevoegd. Wedstrijdkosten
                      blijven gelden zolang de wedstrijd gespeeld is.
                    </p>
                  ) : (
                    <p>
                      Forfait actief — veld- en scheidskosten vervallen. Administratiekosten blijven
                      voor beide teams doorlopen.
                    </p>
                  )}
                </div>
              )}

              {skipAutoMatchCosts && !hasForfaitPenalty && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950">
                  <p className="mb-2">
                    Je hebt wedstrijdkosten handmatig verwijderd. Automatisch aanvullen bij opslaan staat{" "}
                    <strong>uit</strong> tot je hieronder opnieuw standaardkosten toepast.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-input bg-background hover:bg-muted"
                    disabled={restoringAutoMatchCosts || !matchIsCompleted}
                    onClick={onRestoreAutoMatchCosts}
                  >
                    {restoringAutoMatchCosts ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Bezig…
                      </>
                    ) : (
                      "Standaard wedstrijdkosten opnieuw toepassen"
                    )}
                  </Button>
                  {!matchIsCompleted ? (
                    <p className="mt-1.5 text-xs text-amber-900/80">
                      Alleen mogelijk zodra de wedstrijd ingediend is.
                    </p>
                  ) : null}
                </div>
              )}

              {isLoadingMatchCosts ? (
                <MatchCostsLoadingSkeleton />
              ) : matchCosts.length === 0 ? (
                hasForfaitPenalty ? null : (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 px-4 py-3">
                    <p className="text-center text-sm text-muted-foreground">
                      Nog geen kosten. Worden automatisch aangemaakt bij indiening.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Kosten</span>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-muted-foreground text-primary">
                      {matchCosts.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {matchCosts.map((cost) => {
                      const isLockedAdminCost = isAdminMatchCostName(cost.costName);
                      return (
                      <div
                        key={cost.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3 text-sm shadow-sm transition-all duration-150 hover:shadow-md"
                        style={{ borderColor: "var(--color-400)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {cost.teamName}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-sm text-foreground">{cost.costName}</span>
                          </div>
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                              cost.category === "deposit"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : cost.category === "penalty"
                                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                                  : "border-primary/20 bg-primary/10 text-primary",
                            )}
                          >
                            {cost.category === "deposit"
                              ? "Storting"
                              : cost.category === "penalty"
                                ? "Boete"
                                : cost.category === "match_cost"
                                  ? "Wedstrijdkost"
                                  : "Overig"}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {editingCostId === cost.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-sm">€</span>
                              <Input
                                type="number"
                                step="0.01"
                                value={editingCostAmount}
                                onChange={(e) => onEditingCostAmountChange(e.target.value)}
                                className="input-login-style h-8 w-20 text-sm"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const val = parseFloat(editingCostAmount);
                                    if (!Number.isNaN(val)) onUpdateMatchCostAmount(cost.id, val);
                                  }
                                  if (e.key === "Escape") onCancelEditCost();
                                }}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                className="btn btn--primary h-8 px-2"
                                onClick={() => {
                                  const val = parseFloat(editingCostAmount);
                                  if (!Number.isNaN(val)) onUpdateMatchCostAmount(cost.id, val);
                                }}
                              >
                                <Save className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={onCancelEditCost}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="cursor-pointer text-sm font-semibold text-foreground transition-colors hover:text-primary"
                              onClick={() => onStartEditCost(cost.id, cost.amount)}
                              title="Klik om bedrag aan te passen"
                            >
                              €{cost.amount.toFixed(2)}
                            </button>
                          )}
                          <Button
                            type="button"
                            onClick={() => onDeleteMatchCost(cost.id)}
                            className={cn(
                              "btn btn--icon shrink-0 min-h-[44px] min-w-[44px]",
                              isLockedAdminCost
                                ? "cursor-not-allowed opacity-40 text-muted-foreground"
                                : "btn--danger",
                            )}
                            disabled={isLockedAdminCost}
                            aria-label={
                              isLockedAdminCost
                                ? "Administratiekosten kunnen niet worden verwijderd"
                                : "Kost verwijderen"
                            }
                            title={
                              isLockedAdminCost
                                ? "Administratiekosten blijven altijd staan"
                                : undefined
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
      )}
    </MatchFormSectionCard>
  );
}
