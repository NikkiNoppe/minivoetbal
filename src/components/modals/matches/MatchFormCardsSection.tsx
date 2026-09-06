import React from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import MatchesCardIcon from "@/components/pages/admin/matches/components/MatchesCardIcon";
import { MatchFormSectionCard } from "@/components/modals/matches/MatchFormSectionCard";
import {
  MATCH_FORM_CARD_OPTIONS,
  type MatchFormCardItem,
  type MatchFormPlayersByTeam,
  type MatchFormSavedCard,
  type MatchFormTeamKey,
} from "@/components/modals/matches/matchFormTypes";

function CardsLoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">Kaarten laden…</span>
      {[...Array(3)].map((_, index) => (
        <div key={index} className="rounded-lg border border-primary/15 p-3 space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Skeleton className="h-8 min-h-[44px]" />
            <Skeleton className="h-8 min-h-[44px]" />
            <Skeleton className="h-8 min-h-[44px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface MatchFormCardsSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homeTeamName: string;
  awayTeamName: string;
  showRefereeFields: boolean;
  canEdit: boolean;
  isLoadingCards: boolean;
  cardItems: MatchFormCardItem[];
  savedCards: MatchFormSavedCard[];
  playersByTeam: MatchFormPlayersByTeam;
  isSavingCards: boolean;
  onAddCardItem: () => void;
  onUpdateCardItem: (index: number, field: keyof MatchFormCardItem, value: string | number | null) => void;
  onClearCardItems: () => void;
  onRemoveCardItem: (index: number) => void;
  onSaveCardItems: () => void;
  onRemoveSavedCard: (index: number) => void;
}

export function MatchFormCardsSection({
  open,
  onOpenChange,
  homeTeamName,
  awayTeamName,
  showRefereeFields,
  canEdit,
  isLoadingCards,
  cardItems,
  savedCards,
  playersByTeam,
  isSavingCards,
  onAddCardItem,
  onUpdateCardItem,
  onClearCardItems,
  onRemoveCardItem,
  onSaveCardItems,
  onRemoveSavedCard,
}: MatchFormCardsSectionProps) {
  if (!showRefereeFields) return null;

  const isEmpty =
    !isLoadingCards && cardItems.length === 0 && savedCards.length === 0 && !canEdit;

  return (
    <MatchFormSectionCard
      open={open}
      onOpenChange={onOpenChange}
      title="Kaarten"
    >
      {isEmpty ? null : (
      <CardContent className="pt-3">
        <div className="space-y-3">
          {isLoadingCards ? (
            <CardsLoadingSkeleton />
          ) : (
            <>
              {cardItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">Nieuwe kaarten</span>
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        {cardItems.length} {cardItems.length === 1 ? "kaart" : "kaarten"}
                      </span>
                    </div>
                    {cardItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClearCardItems}
                        className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <X className="mr-0.5 h-3 w-3" />
                        Alles wissen
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {cardItems.map((item, idx) => {
                      const teamPlayers =
                        item.team === "home"
                          ? playersByTeam.home
                          : item.team === "away"
                            ? playersByTeam.away
                            : [];
                      const isValid = item.team && item.playerId && item.cardType;

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "relative flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all duration-200",
                            isValid
                              ? "border-primary/30 bg-primary/5 shadow-sm"
                              : "border-border bg-muted/50",
                          )}
                        >
                          {canEdit && isValid && (
                            <Button
                              type="button"
                              variant="unstyled"
                              onClick={() => onRemoveCardItem(idx)}
                              className="btn btn--icon btn--danger absolute right-2 top-2 z-10"
                              aria-label="Kaart verwijderen"
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </Button>
                          )}

                          <div className="grid grid-cols-1 gap-1.5 pr-10 md:grid-cols-3">
                            <div className="space-y-0.5">
                              <Label className="text-xs font-medium">Team</Label>
                              <Select
                                value={item.team}
                                onValueChange={(v) =>
                                  onUpdateCardItem(idx, "team", v as MatchFormTeamKey)
                                }
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="dropdown-login-style h-8 w-full text-sm">
                                  <SelectValue placeholder="Selecteer team" />
                                </SelectTrigger>
                                <SelectContent className="dropdown-content-login-style z-50">
                                  <SelectItem value="home" className="dropdown-item-login-style">
                                    Thuis — {homeTeamName}
                                  </SelectItem>
                                  <SelectItem value="away" className="dropdown-item-login-style">
                                    Uit — {awayTeamName}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-0.5">
                              <Label className="text-xs font-medium">Speler</Label>
                              <Select
                                value={item.playerId ? String(item.playerId) : undefined}
                                onValueChange={(v) =>
                                  onUpdateCardItem(idx, "playerId", parseInt(v, 10))
                                }
                                disabled={!canEdit || !item.team}
                              >
                                <SelectTrigger className="dropdown-login-style h-8 w-full text-sm">
                                  <SelectValue
                                    placeholder={!item.team ? "Eerst team kiezen" : "Selecteer speler"}
                                  />
                                </SelectTrigger>
                                <SelectContent className="dropdown-content-login-style z-50">
                                  {teamPlayers.map((sel) => (
                                    <SelectItem
                                      key={sel.playerId!}
                                      value={String(sel.playerId!)}
                                      className="dropdown-item-login-style"
                                    >
                                      {sel.jerseyNumber ? `${sel.jerseyNumber} - ` : ""}
                                      {sel.playerName || `Speler ${sel.playerId}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-0.5">
                              <Label className="text-xs font-medium">Type kaart</Label>
                              <Select
                                value={item.cardType}
                                onValueChange={(v) => onUpdateCardItem(idx, "cardType", v)}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="dropdown-login-style h-8 w-full text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="dropdown-content-login-style z-50">
                                  {MATCH_FORM_CARD_OPTIONS.map((opt) => (
                                    <SelectItem
                                      key={opt.value}
                                      value={opt.value}
                                      className="dropdown-item-login-style"
                                    >
                                      <span className="flex items-center">
                                        <MatchesCardIcon type={opt.value} />
                                        <span className="ml-1">{opt.label}</span>
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col items-stretch justify-between gap-2 border-t border-border pt-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <Button
                      onClick={onAddCardItem}
                      variant="outline"
                      size="sm"
                      className="btn btn--secondary h-8 w-full px-3 sm:w-auto"
                      disabled={!canEdit}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Nog een kaart
                    </Button>
                    <Button
                      onClick={onSaveCardItems}
                      className="btn btn--primary h-8 w-full px-4 sm:w-auto"
                      disabled={
                        isSavingCards ||
                        cardItems.every((item) => !item.team || !item.playerId || !item.cardType)
                      }
                    >
                      {isSavingCards ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Opslaan...
                        </>
                      ) : (
                        <>
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                          Kaarten opslaan
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {cardItems.length === 0 && canEdit && (
                <div className="pt-1.5">
                  <Button onClick={onAddCardItem} className="btn btn--secondary h-8 w-full px-3">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Kaart toevoegen
                  </Button>
                </div>
              )}

              {savedCards.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-t border-border pt-2">
                    <span className="text-sm font-semibold text-foreground">Opgeslagen kaarten</span>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-muted-foreground text-primary">
                      {savedCards.length} {savedCards.length === 1 ? "kaart" : "kaarten"}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {savedCards.map((card, index) => {
                      const teamName = card.team === "home" ? homeTeamName : awayTeamName;
                      const iconBgClass =
                        card.cardType === "yellow"
                          ? "bg-yellow-50 border-yellow-200"
                          : card.cardType === "double_yellow"
                            ? "bg-yellow-100 border-yellow-300"
                            : "bg-red-50 border-red-200";
                      const cardTypeLabel =
                        card.cardType === "yellow"
                          ? "Geel"
                          : card.cardType === "double_yellow"
                            ? "2x Geel"
                            : "Rood";

                      return (
                        <div
                          key={`${card.playerId}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3.5 text-sm shadow-sm transition-all duration-150 hover:bg-muted/20 hover:shadow-md"
                          style={{ borderColor: "var(--color-400)" }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div
                              className={cn(
                                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border shadow-sm",
                                iconBgClass,
                              )}
                            >
                              <MatchesCardIcon type={card.cardType as MatchFormCardItem["cardType"]} size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold text-foreground">
                                  {teamName}
                                </span>
                                <span className="text-muted-foreground">•</span>
                                <span className="truncate text-sm font-medium text-foreground">
                                  {card.playerName}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                                  card.cardType === "yellow"
                                    ? "border border-yellow-200 bg-yellow-100 text-yellow-800"
                                    : card.cardType === "double_yellow"
                                      ? "border border-yellow-300 bg-yellow-200 text-yellow-900"
                                      : "border border-red-200 bg-red-100 text-red-800",
                                )}
                              >
                                {cardTypeLabel}
                              </span>
                            </div>
                          </div>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="unstyled"
                              onClick={() => onRemoveSavedCard(index)}
                              className="btn btn--icon btn--danger shrink-0"
                              aria-label="Kaart verwijderen"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
      )}
    </MatchFormSectionCard>
  );
}
