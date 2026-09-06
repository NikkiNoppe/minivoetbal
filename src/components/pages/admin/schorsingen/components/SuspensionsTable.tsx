import React, { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban, CalendarDays, Edit } from "lucide-react";
import { formatDateShort } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { Suspension } from "@/domains/cards-suspensions";

interface SuspensionsTableProps {
  suspensions: Suspension[];
  showTeam?: boolean;
  showActions?: boolean;
  isLoading?: boolean;
  onEdit?: (suspension: Suspension) => void;
  /** Compacte rijen voor profiel-sectie */
  variant?: "default" | "profile";
}

const getPlayerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const CardSkeleton = memo(() => (
  <div className="space-y-3" aria-busy="true">
    <span className="sr-only">Schorsingen laden…</span>
    {[...Array(2)].map((_, i) => (
      <div
        key={i}
        className="rounded-xl border border-primary/15 bg-brand-50/30 p-4 space-y-3"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    ))}
  </div>
));

CardSkeleton.displayName = "SuspensionsCardSkeleton";

function matchLinesFor(suspension: Suspension) {
  if (suspension.suspendedForMatches && suspension.suspendedForMatches.length > 0) {
    return suspension.suspendedForMatches;
  }
  if (suspension.suspendedForMatch) {
    return [suspension.suspendedForMatch];
  }
  return [];
}

const SuspensionCard = memo(({
  suspension,
  showTeam,
  showActions,
  onEdit,
  variant = "default",
}: {
  suspension: Suspension;
  showTeam: boolean;
  showActions: boolean;
  onEdit?: (suspension: Suspension) => void;
  variant?: "default" | "profile";
}) => {
  const isProfile = variant === "profile";
  const isManual = suspension.source === "manual";
  const isActive = suspension.status === "active";
  const matchLines = matchLinesFor(suspension);
  const matchesLabel = `${suspension.matches} wedstrijd${suspension.matches !== 1 ? "en" : ""}`;

  return (
    <li
      className={cn(
        "min-w-0",
        isProfile
          ? "border-b border-border/30 px-3 py-2.5 last:border-b-0 first:pt-2.5 last:pb-2.5"
          : cn(
              "rounded-xl border p-4",
              isActive && !isManual && "border-destructive/20 bg-destructive/5",
              isActive && isManual && "border-primary/20 bg-brand-50/40",
              !isActive && "border-primary/15 bg-card",
            ),
      )}
    >
      <div className="flex items-start gap-3">
        {!isProfile ? (
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              isActive && !isManual && "bg-destructive/10 text-destructive",
              isActive && isManual && "bg-primary/10 text-primary",
              !isActive && "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {getPlayerInitials(suspension.playerName)}
          </span>
        ) : (
          <Ban
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              isActive ? "text-destructive" : "text-muted-foreground",
            )}
            aria-hidden
          />
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold leading-tight text-brand-dark">
                {suspension.playerName}
              </p>
              {showTeam ? (
                <p className="truncate text-xs text-muted-foreground">{suspension.teamName}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                {!isProfile && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full text-[11px]",
                      isManual
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-muted/60 text-muted-foreground",
                    )}
                  >
                    {isManual ? "Handmatig" : "Automatisch"}
                  </Badge>
                )}
                <Badge
                  variant={isActive ? "destructive" : "secondary"}
                  className={cn(
                    "rounded-full",
                    isProfile && "h-5 px-1.5 text-[10px]",
                  )}
                >
                  {isActive ? "Actief" : suspension.status === "pending" ? "Wachtend" : "Afgelopen"}
                </Badge>
              </div>
            </div>

            {showActions && onEdit ? (
              <Button
                type="button"
                className="btn btn--icon btn--edit shrink-0"
                onClick={() => onEdit(suspension)}
                aria-label={
                  isManual
                    ? `Bewerk schorsing voor ${suspension.playerName}`
                    : `Pas automatische schorsing aan voor ${suspension.playerName}`
                }
                title={isManual ? undefined : "Aanpassen of notitie voor team"}
              >
                <Edit className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>

          <p
            className={cn(
              "leading-snug text-muted-foreground",
              isProfile ? "text-[11px]" : "text-xs",
            )}
          >
            <span className="font-medium text-foreground/90">{suspension.reason}</span>
            {!isProfile ? (
              <span> · {matchesLabel}</span>
            ) : null}
          </p>

          {matchLines.length > 0 ? (
            <ul className={cn("flex flex-col gap-1.5", isProfile && "gap-1")}>
              {matchLines.map((match, index) => (
                <li
                  key={`${match.date}-${match.opponent}-${index}`}
                  className={cn(
                    "flex min-h-[32px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs leading-snug",
                    isActive
                      ? "border-destructive/15 bg-background/70 text-foreground"
                      : "border-border/70 bg-muted/30 text-muted-foreground",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    Geschorst op{" "}
                    <span className="font-medium text-foreground">
                      {formatDateShort(match.date)} - {match.opponent}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : suspension.endDate ? (
            <p className="text-xs text-muted-foreground">
              Eindigt rond {formatDateShort(suspension.endDate)}
            </p>
          ) : null}

          {suspension.notes ? (
            <p className="border-l-2 border-primary/30 pl-2 text-xs leading-snug text-muted-foreground">
              <span className="font-medium text-foreground/90">Bericht voor team: </span>
              {suspension.notes}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
});

SuspensionCard.displayName = "SuspensionCard";

export const SuspensionsTable: React.FC<SuspensionsTableProps> = memo(({
  suspensions,
  showTeam = true,
  showActions = false,
  isLoading = false,
  onEdit,
  variant = "default",
}) => {
  const sortedSuspensions = useMemo(() => {
    return [...suspensions].sort((a, b) => {
      const dateA = a.suspendedForMatch?.date || a.endDate || a.cardDate || "";
      const dateB = b.suspendedForMatch?.date || b.endDate || b.cardDate || "";
      if (!dateA && !dateB) return a.playerName.localeCompare(b.playerName, "nl", { sensitivity: "base" });
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.localeCompare(dateB);
    });
  }, [suspensions]);

  if (isLoading) return <CardSkeleton />;

  if (sortedSuspensions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Geen schorsingen gevonden.
      </div>
    );
  }

  return (
    <ul
      className={cn(variant === "profile" ? "divide-y divide-border/30" : "space-y-3")}
      aria-label="Schorsingen lijst"
    >
      {sortedSuspensions.map((suspension) => (
        <SuspensionCard
          key={suspension.id}
          suspension={suspension}
          showTeam={showTeam}
          showActions={showActions}
          onEdit={onEdit}
          variant={variant}
        />
      ))}
    </ul>
  );
});

SuspensionsTable.displayName = "SuspensionsTable";
