import React, { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerDataRefreshModal, InlinePlayerRetry } from "@/components/modals";
import type { PlayerSelection } from "@/components/pages/admin/matches/types";
import type { TeamPlayer } from "@/components/pages/admin/matches/hooks/useTeamPlayers";

const TABLE_COLUMNS = { speler: "w-[80%]", rugnr: "w-[20%]" } as const;

export interface MatchFormPlayerSelectionTableProps {
  teamLabel: string;
  selections: PlayerSelection[];
  selectedPlayerIds: (number | null)[];
  canEditTeam: boolean;
  isHomeTeam: boolean;
  players: TeamPlayer[] | undefined;
  isLoading: boolean;
  error: unknown;
  retryCount?: number;
  refetch?: () => Promise<void>;
  onPlayerSelection: (
    index: number,
    field: keyof PlayerSelection,
    value: string | number | boolean | null,
    isHomeTeam: boolean,
  ) => void;
  getPlayerDisplayName: (
    selection: PlayerSelection,
    players: TeamPlayer[] | undefined,
  ) => string | null;
  isPlayerSuspended: (playerId: number, players: TeamPlayer[] | undefined) => boolean;
}

export function MatchFormPlayerSelectionTable({
  teamLabel,
  selections,
  selectedPlayerIds,
  canEditTeam,
  isHomeTeam,
  players,
  isLoading,
  error,
  retryCount,
  refetch,
  onPlayerSelection,
  getPlayerDisplayName,
  isPlayerSuspended,
}: MatchFormPlayerSelectionTableProps) {
  const memoizedSelectedPlayerIds = useMemo(() => selectedPlayerIds, [selectedPlayerIds]);
  const memoizedPlayers = useMemo(() => players, [players]);

  if (isLoading) {
    const retryMessage = retryCount && retryCount > 0 ? ` (Poging ${retryCount}/3...)` : "";
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Spelers laden…{retryMessage}</span>
        {[...Array(4)].map((_, index) => (
          <div key={index} className="flex gap-2">
            <Skeleton className="h-11 min-h-[44px] flex-1" />
            <Skeleton className="h-11 min-h-[44px] w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-2 py-3 text-center text-destructive" role="alert">
          <span>Kan spelers niet laden</span>
          {refetch && (
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
              aria-label="Opnieuw proberen"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Opnieuw proberen
            </button>
          )}
        </div>
      </div>
    );
  }

  const hasExistingSelections = selections.some(
    (s) => s.playerName && s.playerName.trim() !== "" && s.playerName !== "(niet beschikbaar)",
  );
  const hasEmptyResult =
    !isLoading &&
    !error &&
    memoizedPlayers !== undefined &&
    memoizedPlayers.length === 0 &&
    !hasExistingSelections;

  const handlePlayerChange = (index: number, value: string) => {
    const newId = value === "no-player" ? null : parseInt(value, 10);
    onPlayerSelection(index, "playerId", newId, isHomeTeam);
    if (newId) {
      const p = memoizedPlayers?.find((pl) => pl.player_id === newId);
      const name = p ? `${p.first_name} ${p.last_name}` : "";
      onPlayerSelection(index, "playerName", name, isHomeTeam);
    } else {
      onPlayerSelection(index, "playerName", "", isHomeTeam);
    }
  };

  const renderPlayerSelect = (index: number, selection: PlayerSelection) => (
    <Select
      value={selection.playerId?.toString() || "no-player"}
      onValueChange={(value) => handlePlayerChange(index, value)}
      disabled={!canEditTeam || isLoading}
    >
      <SelectTrigger
        {...(index === 0 ? { "data-match-form-first-player": true } : {})}
        className={cn(
          "dropdown-login-style w-full max-w-full min-h-[44px] text-sm",
          isLoading && "cursor-wait opacity-75",
        )}
        disabled={isLoading}
      >
        <SelectValue
          placeholder={
            isLoading
              ? "Spelers worden geladen uit database..."
              : error
                ? "Fout bij laden, probeer opnieuw"
                : "Selecteer speler"
          }
          className="min-w-0 max-w-full truncate"
          style={{
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            minWidth: 0,
            maxWidth: "100%",
            display: "block",
          }}
        />
        {isLoading && (
          <div className="absolute right-2 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}
      </SelectTrigger>
      <SelectContent className="dropdown-content-login-style z-[1001] bg-white">
        <SelectItem value="no-player" className="dropdown-item-login-style" disabled={isLoading}>
          Geen speler
        </SelectItem>
        {isLoading ? (
          <SelectItem value="loading" disabled className="dropdown-item-login-style text-center" aria-busy="true">
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Spelers worden geladen uit database...</span>
            </div>
          </SelectItem>
        ) : error ? (
          <SelectItem value="error" disabled className="dropdown-item-login-style text-center text-destructive">
            <div className="flex flex-col items-center justify-center gap-1 py-2">
              <span className="text-sm font-medium">Fout bij laden spelers</span>
              {refetch && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    refetch();
                  }}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  Probeer opnieuw
                </button>
              )}
            </div>
          </SelectItem>
        ) : (
          <>
            {selection.playerId &&
              selection.playerName &&
              memoizedPlayers !== undefined &&
              !isLoading &&
              !memoizedPlayers.find((p) => p.player_id === selection.playerId) && (
                <SelectItem
                  value={selection.playerId.toString()}
                  className="dropdown-item-login-style opacity-75"
                >
                  {selection.playerName} (niet beschikbaar)
                </SelectItem>
              )}
            {memoizedPlayers?.map((player) => {
              const playerIdNum = player.player_id;
              const alreadySelected =
                memoizedSelectedPlayerIds.includes(playerIdNum) && selection.playerId !== playerIdNum;
              const suspended = isPlayerSuspended(playerIdNum, memoizedPlayers);
              const fullName = `${player.first_name} ${player.last_name}`;

              return (
                <SelectItem
                  key={playerIdNum}
                  value={playerIdNum.toString()}
                  disabled={alreadySelected || suspended}
                  className={cn(
                    "dropdown-item-login-style",
                    (alreadySelected || suspended) && "text-gray-400 opacity-50",
                  )}
                  style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}
                >
                  {fullName}
                </SelectItem>
              );
            })}
          </>
        )}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      {refetch && (
        <PlayerDataRefreshModal
          players={memoizedPlayers}
          loading={isLoading}
          error={error}
          onRefresh={refetch}
          teamLabel={teamLabel}
          showForEmptyArray
        />
      )}
      {hasEmptyResult && refetch && (
        <InlinePlayerRetry
          onRetry={refetch}
          isLoading={isLoading}
          error={error}
          itemCount={memoizedPlayers?.length || 0}
          emptyMessage="Geen spelers gevonden"
          className="mb-3"
        />
      )}

      <div className="hidden rounded-md border bg-white pb-2 md:block">
        <table className="table min-w-full">
          <thead>
            <tr className="table-head">
              <th className={TABLE_COLUMNS.speler + " py-1 text-left"}>Speler</th>
              <th className={TABLE_COLUMNS.rugnr + " py-1 text-center"}>Rugnr</th>
            </tr>
          </thead>
          <tbody>
            {selections.map((selection, index) => (
              <tr key={`${selection.playerId}-${index}`} className="table-row">
                <td className={TABLE_COLUMNS.speler + " text-sm"}>
                  {canEditTeam ? (
                    renderPlayerSelect(index, selection)
                  ) : (
                    <span className="block w-full">{selection.playerName || "-"}</span>
                  )}
                </td>
                <td className={TABLE_COLUMNS.rugnr + " px-0 text-center"}>
                  {canEditTeam ? (
                    <Input
                      id={`jersey-${index}`}
                      type="number"
                      min="1"
                      max="99"
                      placeholder="Rugnr"
                      value={selection.jerseyNumber || ""}
                      onChange={(e) =>
                        onPlayerSelection(index, "jerseyNumber", e.target.value, isHomeTeam)
                      }
                      disabled={!selection.playerId}
                      className="input-login-style h-8 w-16 min-w-[64px] px-2 py-1 text-center text-xs"
                      style={{ fontSize: "16px" }}
                    />
                  ) : (
                    <span className="text-xs">{selection.jerseyNumber && <>{selection.jerseyNumber}</>}</span>
                  )}
                </td>
              </tr>
            ))}
            {selections.length === 0 && (
              <tr>
                <td colSpan={2} className="py-3 text-center text-muted-foreground">
                  Geen spelers geselecteerd voor dit team.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {selections.length === 0 ? (
          <div className="py-3 text-center text-muted-foreground">
            Geen spelers geselecteerd voor dit team.
          </div>
        ) : (
          <div className="divide-y rounded-md border bg-white">
            {selections.map((selection, index) => (
              <div key={`${selection.playerId}-${index}`} className="p-2">
                <div className="grid min-w-0 grid-cols-[4fr_1fr] gap-2">
                  {canEditTeam ? (
                    <div className="min-w-0">{renderPlayerSelect(index, selection)}</div>
                  ) : (
                    <div className="flex h-8 min-w-0 items-center text-xs">{selection.playerName || "-"}</div>
                  )}
                  <div className="min-w-0">
                    {canEditTeam ? (
                      <Input
                        id={`m-jersey-${index}`}
                        type="number"
                        min="1"
                        max="99"
                        placeholder="Rugnr"
                        value={selection.jerseyNumber || ""}
                        onChange={(e) =>
                          onPlayerSelection(index, "jerseyNumber", e.target.value, isHomeTeam)
                        }
                        disabled={!selection.playerId}
                        className="input-login-style h-8 w-full min-w-[64px] px-2 py-1 text-center text-xs"
                        style={{ fontSize: "16px" }}
                      />
                    ) : (
                      <span className="block text-right text-xs">
                        {selection.jerseyNumber && selection.jerseyNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
