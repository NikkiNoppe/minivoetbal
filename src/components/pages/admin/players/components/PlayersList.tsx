import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Edit, Calendar, User, Trophy } from "lucide-react";
import { AppAlertModal, DestructiveConfirmDescription } from "@/components/modals";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PUBLIC_CARD_CLASS } from "@/components/layout";
import { getRosterDisplayName, isTeamRosterFull, MAX_TEAM_PLAYERS } from "../utils/playerUtils";

interface Player {
  player_id: number;
  first_name: string;
  last_name: string;
  birth_date: string;
}

interface PlayersListProps {
  players: Player[];
  loading: boolean;
  editMode: boolean;
  onRemovePlayer: (playerId: number) => void;
  onEditPlayer: (playerId: number) => void;
  formatDate: (dateString: string) => string;
  getFullName: (player: Player) => string;
  variant?: "default" | "profile";
  /** Wedstrijdtelling per speler (profiel-spelerslijst) */
  matchCountByPlayerId?: Map<number, number>;
}

// Loading skeleton - profile variant
const PlayerCardSkeleton = ({ profile = false }: { profile?: boolean }) =>
  profile ? (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  ) : null;

// Empty state
const EmptyState = ({ profile = false }: { profile?: boolean }) =>
  profile ? (
    <p className="text-sm text-muted-foreground italic">
      Nog geen spelers toegevoegd. Gebruik &quot;Speler toevoegen&quot; om te
      starten.
    </p>
  ) : (
    <div className="text-center py-12 px-4">
      <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
      <h3 className="text-lg font-semibold mb-2 text-foreground">Geen spelers</h3>
      <p className="text-muted-foreground">
        Er zijn nog geen spelers toegevoegd aan deze lijst.
      </p>
    </div>
  );

const PlayersList: React.FC<PlayersListProps> = ({
  players,
  loading,
  editMode,
  onRemovePlayer,
  onEditPlayer,
  formatDate,
  getFullName,
  variant = "default",
  matchCountByPlayerId,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const isProfile = variant === "profile";

  const handleDeleteClick = (player: Player) => {
    setPlayerToDelete(player);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (playerToDelete) {
      onRemovePlayer(playerToDelete.player_id);
      setDeleteDialogOpen(false);
      setPlayerToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setPlayerToDelete(null);
  };

  if (isProfile) {
    if (loading) {
      return (
        <div className="space-y-2" aria-busy="true" aria-label="Spelers laden">
          {[1, 2, 3, 4].map((i) => (
            <PlayerCardSkeleton key={i} profile />
          ))}
        </div>
      );
    }

    if (players.length === 0) {
      return <EmptyState profile />;
    }

    const playerRows = players.map((player) => {
      const matchCount = matchCountByPlayerId?.get(player.player_id);
      const displayName = getRosterDisplayName(player);

      return (
        <div
          key={player.player_id}
          className="px-3 py-2.5 first:pt-2.5 last:pb-2.5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </h3>
              {matchCountByPlayerId && matchCount !== undefined && (
                <span
                  className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
                  title="Gespeelde wedstrijden"
                >
                  <Trophy className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span>
                    {matchCount}{" "}
                    {matchCount === 1 ? "wedstrijd" : "wedstrijden"}
                  </span>
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" aria-hidden />
                <span className="whitespace-nowrap">{formatDate(player.birth_date)}</span>
              </div>
              {editMode && (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    onClick={() => onEditPlayer(player.player_id)}
                    variant="unstyled"
                    className="btn btn--icon btn--edit"
                    aria-label={`Bewerk ${displayName}`}
                  >
                    <Edit className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(player);
                    }}
                    variant="unstyled"
                    className="btn btn--icon btn--danger"
                    aria-label={`Verwijder ${displayName}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    });

    return (
      <>
        <div
          className="overflow-hidden rounded-md border border-border/50 bg-card divide-y divide-border/40"
          role="region"
          aria-label="Spelerslijst"
        >
          {playerRows}
        </div>
        <AppAlertModal
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Speler verwijderen"
          description={
            <DestructiveConfirmDescription
              message={
                <>
                  Weet je zeker dat je{" "}
                  <span className="font-semibold text-destructive">
                    {playerToDelete?.first_name} {playerToDelete?.last_name}
                  </span>{" "}
                  wilt verwijderen?
                </>
              }
            />
          }
          confirmAction={{
            label: "Verwijderen",
            onClick: handleConfirmDelete,
            variant: "destructive",
          }}
          cancelAction={{
            label: "Annuleren",
            onClick: handleCancelDelete,
            variant: "secondary",
          }}
        />
      </>
    );
  }

  const rosterFull = isTeamRosterFull(players.length);
  const spotsRemaining = Math.max(0, MAX_TEAM_PLAYERS - players.length);

  const MobilePlayerSkeleton = () => (
    <ul className="divide-y divide-border/60 md:hidden" aria-busy="true" aria-label="Spelers laden">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={`player-mobile-skeleton-${index}`} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          {editMode ? (
            <div className="flex gap-1">
              <Skeleton className="h-11 w-11 rounded-md" />
              <Skeleton className="h-11 w-11 rounded-md" />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );

  const PlayerMobileCard = ({ player }: { player: Player }) => {
    const displayName = getFullName(player);
    return (
      <div className="flex items-start gap-3 px-3 py-3 min-h-[44px]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-semibold text-brand-dark">{displayName}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {formatDate(player.birth_date)}
          </p>
          <Badge variant="outline" className="bg-brand-50 text-xs">
            Actief
          </Badge>
        </div>
        {editMode ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              onClick={() => onEditPlayer(player.player_id)}
              variant="unstyled"
              className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
              aria-label={`Bewerk ${displayName}`}
            >
              <Edit className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              onClick={() => handleDeleteClick(player)}
              variant="unstyled"
              className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
              aria-label={`Verwijder ${displayName}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Spelers
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">{players.length}</p>
          </CardContent>
        </Card>
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plaatsen vrij
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">
              {rosterFull ? "0" : spotsRemaining}
            </p>
          </CardContent>
        </Card>
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Maximum
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">{MAX_TEAM_PLAYERS}</p>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-lg min-w-0")}>
        <CardContent className="min-w-0 p-0">
          {loading ? (
            <>
              <MobilePlayerSkeleton />
              <div className="hidden w-full min-w-0 md:block overflow-x-auto">
                <Table className="table w-full">
                  <TableHeader>
                    <TableRow className="table-header-row">
                      <TableHead className="min-w-[220px]">Naam</TableHead>
                      <TableHead className="hidden min-w-[140px] sm:table-cell">Geboortedatum</TableHead>
                      <TableHead className="hidden min-w-[120px] md:table-cell">Status</TableHead>
                      {editMode && <TableHead className="text-center min-w-[104px]">Acties</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        <TableCell className="table-skeleton-cell">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                        </TableCell>
                        <TableCell className="table-skeleton-cell hidden sm:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="table-skeleton-cell hidden md:table-cell">
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        {editMode && (
                          <TableCell className="text-center table-skeleton-cell">
                            <div className="flex justify-center gap-1">
                              <Skeleton className="h-8 w-8 rounded-md" />
                              <Skeleton className="h-8 w-8 rounded-md" />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : players.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ul className="divide-y divide-border/60 md:hidden" aria-label="Spelerslijst">
                {players.map((player) => (
                  <li key={player.player_id}>
                    <PlayerMobileCard player={player} />
                  </li>
                ))}
              </ul>

              <div className="hidden w-full min-w-0 md:block overflow-x-auto">
                <Table className="table w-full">
                  <TableHeader>
                    <TableRow className="table-header-row">
                      <TableHead className="min-w-[220px]">Naam</TableHead>
                      <TableHead className="hidden min-w-[140px] sm:table-cell">Geboortedatum</TableHead>
                      <TableHead className="hidden min-w-[120px] md:table-cell">Status</TableHead>
                      {editMode && <TableHead className="text-center min-w-[104px]">Acties</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {players.map((player) => {
                      const displayName = getFullName(player);
                      return (
                        <TableRow key={player.player_id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <User className="h-4 w-4" />
                              </span>
                              <span className="block truncate max-w-[220px] text-brand-dark">
                                {displayName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {formatDate(player.birth_date)}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="bg-brand-50">
                              Actief
                            </Badge>
                          </TableCell>
                          {editMode && (
                            <TableCell className="text-center">
                              <div className="flex items-center gap-1.5 justify-center">
                                <Button
                                  type="button"
                                  onClick={() => onEditPlayer(player.player_id)}
                                  variant="unstyled"
                                  className="btn btn--icon btn--edit"
                                  aria-label={`Bewerk ${displayName}`}
                                >
                                  <Edit className="h-4 w-4" aria-hidden />
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => handleDeleteClick(player)}
                                  variant="unstyled"
                                  className="btn btn--icon btn--danger"
                                  aria-label={`Verwijder ${displayName}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AppAlertModal
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Speler verwijderen"
        description={
          <DestructiveConfirmDescription
            message={
              <>
                Weet je zeker dat je{" "}
                <span className="font-semibold text-destructive">
                  {playerToDelete?.first_name} {playerToDelete?.last_name}
                </span>{" "}
                wilt verwijderen?
              </>
            }
          />
        }
        confirmAction={{
          label: "Verwijderen",
          onClick: handleConfirmDelete,
          variant: "destructive",
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: handleCancelDelete,
          variant: "secondary",
        }}
      />
    </div>
  );
};

export default PlayersList;
