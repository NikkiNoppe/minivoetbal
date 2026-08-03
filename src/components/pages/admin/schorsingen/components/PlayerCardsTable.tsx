import React, { memo, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban, ChevronDown } from "lucide-react";
import { SuspensionBadge } from "./SuspensionBadge";
import { formatDateForDisplay, formatDateShort } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { PlayerCard, PlayerCardEvent, Suspension } from "@/domains/cards-suspensions";

interface PlayerCardsTableProps {
  playerCards: PlayerCard[];
  suspensions?: Suspension[];
  showTeam?: boolean;
  isLoading?: boolean;
  /** Mobiel-vriendelijke rijen zonder brede tabelkolommen */
  compact?: boolean;
  variant?: "default" | "profile";
}

const CardSkeleton = memo(({ profile = false }: { profile?: boolean }) => (
  <div className={cn("space-y-0", profile && "rounded-md border border-border/50 bg-card overflow-hidden divide-y divide-border/40")}>
    {[...Array(profile ? 4 : 6)].map((_, i) => (
      <div
        key={i}
        className={cn(
          "flex items-center justify-between gap-3 px-3 py-2.5",
          !profile && "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_52px_52px_52px_28px] items-center gap-3 px-3 py-2",
        )}
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16" />
      </div>
    ))}
  </div>
));

CardSkeleton.displayName = 'CardSkeleton';

const getPlayerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const CompactCardTotals = ({ yellow, red }: { yellow: number; red: number }) => (
  <span className="flex items-center gap-1 shrink-0" aria-label={`${yellow} geel, ${red} rood`}>
    {yellow > 0 && (
      <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-md border border-yellow-500/30 bg-yellow-500/10 px-1.5 text-[10px] font-semibold tabular-nums text-yellow-800 dark:text-yellow-300">
        {yellow}
      </span>
    )}
    {red > 0 && (
      <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-1.5 text-[10px] font-semibold tabular-nums text-red-800 dark:text-red-300">
        {red}
      </span>
    )}
  </span>
);

const mergePlayerSuspensions = (
  card: PlayerCard,
  fromProps: Suspension[],
): Suspension[] => {
  const derived = card.suspensionEpisodes ?? [];
  const derivedIds = new Set(derived.map((s) => s.id));
  const manualOrActive = fromProps.filter((s) => !derivedIds.has(s.id));
  return [...derived, ...manualOrActive].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    const dateA = a.cardDate || a.suspendedForMatch?.date || a.endDate || "";
    const dateB = b.cardDate || b.suspendedForMatch?.date || b.endDate || "";
    return dateB.localeCompare(dateA);
  });
};

const DetailSectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </p>
);

const CardEventRow = memo(({ event, compact }: { event: PlayerCardEvent; compact: boolean }) => {
  const dateLabel = compact
    ? (() => {
        try {
          const d = new Date(event.matchDate.includes("T") ? event.matchDate : `${event.matchDate}T12:00:00.000Z`);
          return d.toLocaleDateString("nl-BE", { day: "numeric", month: "short", timeZone: "UTC" });
        } catch {
          return formatDateShort(event.matchDate);
        }
      })()
    : formatDateShort(event.matchDate);

  return (
    <div className="flex items-center gap-2 py-1.5 min-h-[36px]">
      <span
        className="shrink-0 w-[4.25rem] sm:w-[5.25rem] tabular-nums text-[11px] sm:text-xs text-muted-foreground"
        title={formatDateForDisplay(event.matchDate)}
      >
        {dateLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        vs {event.opponent}
      </span>
      <SuspensionBadge type={event.cardType} />
    </div>
  );
});

CardEventRow.displayName = "CardEventRow";

function suspensionStripSurface(status: Suspension["status"]) {
  switch (status) {
    case "active":
      return "border-red-200/70 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/25";
    case "pending":
      return "border-red-200/55 bg-red-50/75 dark:border-red-900/45 dark:bg-red-950/20";
    default:
      return "border-red-100/60 bg-red-50/50 dark:border-red-900/35 dark:bg-red-950/15";
  }
}

function suspensionStripIconClass(status: Suspension["status"]) {
  switch (status) {
    case "active":
      return "text-red-600 dark:text-red-400";
    case "pending":
      return "text-red-500 dark:text-red-400";
    default:
      return "text-red-400/90 dark:text-red-500/80";
  }
}

const SuspensionEpisodeRow = memo(({ suspension }: { suspension: Suspension }) => {
  const matchLines =
    suspension.suspendedForMatches && suspension.suspendedForMatches.length > 0
      ? suspension.suspendedForMatches
      : suspension.suspendedForMatch
        ? [suspension.suspendedForMatch]
        : [];

  const statusLabel =
    suspension.status === "active"
      ? "Actief"
      : suspension.status === "pending"
        ? "Wachtend"
        : "Afgelopen";

  const matchPrefix =
    suspension.status === "active" ? "Geschorst" : "Was geschorst";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2.5",
        suspensionStripSurface(suspension.status),
      )}
      role="status"
    >
      <Ban
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          suspensionStripIconClass(suspension.status),
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground leading-snug">
          {statusLabel}
          <span className="font-normal text-muted-foreground"> · </span>
          {suspension.reason}
        </p>
        {matchLines.length > 0 ? (
          <div className="space-y-0.5">
            {matchLines.map((match, index) => (
              <p
                key={`${match.date}-${match.opponent}-${index}`}
                className="text-xs text-muted-foreground leading-snug"
              >
                {matchPrefix}{" "}
                <span className="text-foreground/80">
                  {formatDateShort(match.date)} · {match.opponent}
                </span>
              </p>
            ))}
          </div>
        ) : suspension.cardDate ? (
          <p className="text-xs text-muted-foreground leading-snug">
            Kaart op{" "}
            <span className="text-foreground/80">
              {formatDateShort(suspension.cardDate)}
            </span>
            {suspension.status === "completed"
              ? " · schorsing uitgeserveerd of nog geen volgende wedstrijd in kalender"
              : " · volgende wedstrijd nog niet gepland"}
          </p>
        ) : suspension.endDate ? (
          <p className="text-xs text-muted-foreground leading-snug">
            Eindigt rond {formatDateForDisplay(suspension.endDate)}
          </p>
        ) : null}
        {suspension.notes ? (
          <p className="text-xs text-muted-foreground border-l-2 border-red-200/60 pl-2 dark:border-red-900/40">
            {suspension.notes}
          </p>
        ) : null}
      </div>
    </div>
  );
});

SuspensionEpisodeRow.displayName = "SuspensionEpisodeRow";

const PlayerDetailPanel = memo(({
  cardEvents,
  playerSuspensions,
  hasCardTotals,
  compact,
  variant = "default",
}: {
  cardEvents: PlayerCardEvent[];
  playerSuspensions: Suspension[];
  hasCardTotals: boolean;
  compact: boolean;
  variant?: "default" | "profile";
}) => (
  <div
    className={cn(
      "border-t border-border/50",
      variant === "profile" ? "bg-background px-3 py-2.5" : "bg-muted/10 px-2.5 py-2 sm:px-3",
    )}
  >
    <div
      className={cn(
        "overflow-hidden divide-y divide-border/40",
        variant === "profile"
          ? "rounded-md border border-border/40 bg-muted/15 divide-y divide-border/40"
          : cn(
              "rounded-md border border-border/60 bg-card divide-border/50",
              !compact && "lg:grid lg:grid-cols-2 lg:divide-y-0 lg:divide-x",
            ),
      )}
    >
      <div className="px-2.5 py-2 sm:px-3">
        <DetailSectionLabel>Kaarten</DetailSectionLabel>
        {cardEvents.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {hasCardTotals
              ? "Wedstrijddetails nog niet beschikbaar."
              : "Geen kaarten geregistreerd."}
          </p>
        ) : (
          <div className="mt-1 divide-y divide-border/40">
            {cardEvents.map((event) => (
              <CardEventRow key={event.id} event={event} compact={compact} />
            ))}
          </div>
        )}
      </div>

      <div className="px-2.5 py-2 sm:px-3">
        <DetailSectionLabel>Schorsing</DetailSectionLabel>
        {playerSuspensions.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Geen schorsing gekoppeld.
          </p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {playerSuspensions.map((suspension) => (
              <SuspensionEpisodeRow key={suspension.id} suspension={suspension} />
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
));

PlayerDetailPanel.displayName = "PlayerDetailPanel";

const PlayerCardRow = memo(({ 
  card, 
  showTeam,
  suspensions,
  isExpanded,
  onToggle,
  compact = false,
  variant = "default",
}: { 
  card: PlayerCard; 
  showTeam: boolean;
  suspensions: Suspension[];
  isExpanded: boolean;
  onToggle: () => void;
  compact?: boolean;
  variant?: "default" | "profile";
}) => {
  const cardEvents = card.cardEvents || [];
  const playerSuspensions = mergePlayerSuspensions(card, suspensions);
  const hasCardTotals = card.yellowCards + card.redCards > 0;

  return (
    <div
      className={cn(
        variant === "profile"
          ? "border-b border-border/40 last:border-b-0"
          : "border-b border-border/50 last:border-b-0",
        isExpanded && variant === "profile" && "bg-card",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          "w-full text-left text-sm transition-colors min-h-[44px]",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isExpanded && (variant === "profile" ? "bg-muted/20" : "bg-muted/30"),
          compact
            ? "flex items-center gap-3 px-3 py-2.5"
            : "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_52px_52px_52px_28px] items-center gap-3 px-3 py-2",
        )}
      >
        {compact && variant === "profile" ? (
          <>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
              aria-hidden
            >
              {getPlayerInitials(card.playerName)}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-medium text-foreground"
              title={card.playerName}
            >
              {card.playerName}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <CompactCardTotals yellow={card.yellowCards} red={card.redCards} />
              <ChevronDown
                size={16}
                className={cn(
                  "text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-180",
                )}
                aria-hidden="true"
              />
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground" title={card.playerName}>
                {card.playerName}
              </span>
              {showTeam ? (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {card.teamName}
                </span>
              ) : null}
            </span>
            {compact ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <SuspensionBadge type="yellow" count={card.yellowCards} />
                <SuspensionBadge type="red" count={card.redCards} />
                <ChevronDown
                  size={16}
                  className={cn(
                    "text-muted-foreground transition-transform duration-200",
                    isExpanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </span>
            ) : (
              <>
                <span
                  className="truncate text-muted-foreground"
                  title={showTeam ? card.teamName : undefined}
                >
                  {showTeam ? card.teamName : "—"}
                </span>
                <span className="flex justify-end">
                  <SuspensionBadge type="yellow" count={card.yellowCards} />
                </span>
                <span className="flex justify-end">
                  <SuspensionBadge type="red" count={card.redCards} />
                </span>
                <span className="flex justify-end">
                  <Badge variant="secondary" className="font-medium">
                    {card.yellowCards + card.redCards}
                  </Badge>
                </span>
                <span className="flex justify-end text-muted-foreground">
                  <ChevronDown
                    size={16}
                    className={cn("transition-transform duration-200", isExpanded && "rotate-180")}
                    aria-hidden="true"
                  />
                </span>
              </>
            )}
          </>
        )}
      </button>

      {isExpanded && (
        <PlayerDetailPanel
          cardEvents={cardEvents}
          playerSuspensions={playerSuspensions}
          hasCardTotals={hasCardTotals}
          compact={compact}
          variant={variant}
        />
      )}
    </div>
  );
});

PlayerCardRow.displayName = 'PlayerCardRow';

export const PlayerCardsTable: React.FC<PlayerCardsTableProps> = memo(({ 
  playerCards, 
  suspensions = [],
  showTeam = true,
  isLoading = false,
  compact = false,
  variant = "default",
}) => {
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  const sortedCards = useMemo(() => [...playerCards].sort((a, b) => {
    const totalCompare = (b.yellowCards + b.redCards) - (a.yellowCards + a.redCards);
    if (totalCompare !== 0) return totalCompare;
    const teamCompare = a.teamName.localeCompare(b.teamName, 'nl', { sensitivity: 'base' });
    if (teamCompare !== 0) return teamCompare;
    return a.playerName.localeCompare(b.playerName, 'nl', { sensitivity: 'base' });
  }), [playerCards]);

  const suspensionsByPlayerId = useMemo(() => {
    const grouped = new Map<number, Suspension[]>();
    suspensions.forEach((suspension) => {
      const currentSuspensions = grouped.get(suspension.playerId) || [];
      currentSuspensions.push(suspension);
      grouped.set(suspension.playerId, currentSuspensions);
    });
    return grouped;
  }, [suspensions]);

  if (isLoading) return <CardSkeleton profile={variant === "profile"} />;

  if (playerCards.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Geen kaarten geregistreerd.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden",
        variant === "profile"
          ? "rounded-md border border-border/50 bg-card shadow-sm"
          : "rounded-lg border border-border/70",
      )}
      role="region"
      aria-label="Kaarten lijst"
    >
      {!compact && (
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_52px_52px_52px_28px] items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span>Speler</span>
          <span>{showTeam ? "Team" : "Team"}</span>
          <span className="text-right">Geel</span>
          <span className="text-right">Rood</span>
          <span className="text-right">Totaal</span>
          <span className="sr-only">Details</span>
        </div>
      )}
      {sortedCards.map((card) => (
        <PlayerCardRow
          key={card.playerId}
          card={card}
          showTeam={showTeam}
          suspensions={suspensionsByPlayerId.get(card.playerId) || []}
          isExpanded={expandedPlayerId === card.playerId}
          onToggle={() =>
            setExpandedPlayerId((currentPlayerId) =>
              currentPlayerId === card.playerId ? null : card.playerId,
            )
          }
          compact={compact}
          variant={variant}
        />
      ))}
    </div>
  );
});

PlayerCardsTable.displayName = 'PlayerCardsTable';
