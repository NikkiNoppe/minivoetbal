import React, { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { Check, Loader2, Minus, Star, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getLocationOrder } from "@/lib/matchSortingUtils";
import { formatDateWithDay, formatTimeForDisplay } from "@/lib/dateUtils";
import type {
  ScheduleCluster,
  ScheduleMatch,
} from "@/services/scheidsrechter/monthScheduleService";
import {
  buildMatchPollGroupId,
  matchAvailabilityKey,
} from "@/services/scheidsrechter/monthScheduleService";

type CellStatus = "assigned" | "available" | "unavailable" | "none";
type AvailValue = boolean | null; // null = geen reactie / unset in map

interface MatrixRow {
  key: string;
  clusterKey: string;
  pollMonth: string;
  dateOnly: string;
  matchDateIso: string;
  location: string;
  match: ScheduleMatch;
}

interface RefereeAvailabilityMatrixProps {
  clusters: ScheduleCluster[];
  myAvailability: Map<string, boolean>;
  username: string;
  userId: number;
  onSubmit: (
    matchId: number,
    pollMonth: string,
    isAvailable: boolean | null,
  ) => Promise<void>;
  isSubmitting?: boolean;
}

const SESSION_COLUMN_WIDTH = 260;
const REFEREE_COLUMN_WIDTH = 64;
const SESSION_ROW_HEIGHT = 44;
const DAY_HEADER_HEIGHT = 32;

function formatLocationShort(location: string): string {
  const [place] = location.split(" - ");
  return place?.trim() || location;
}

function MatrixStatusLegend() {
  return (
    <div
      className="mx-auto flex max-w-[200px] flex-col gap-1 text-[10px] leading-tight text-muted-foreground"
      role="note"
      aria-label="Legenda beschikbaarheid"
    >
      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-success/90 shadow-sm">
            <Star className="h-2 w-2 fill-white text-white" aria-hidden />
          </span>
          <span className="truncate">Toegewezen</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-success/40 bg-success/10">
            <Check className="h-2 w-2 text-success" aria-hidden />
          </span>
          <span className="truncate">Beschikbaar</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-border/80 bg-muted/50">
            <X className="h-2 w-2 text-muted-foreground" aria-hidden />
          </span>
          <span className="truncate">Niet beschikbaar</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-dashed border-border/70 bg-card/50">
            <Minus className="h-2 w-2 text-muted-foreground/50" aria-hidden />
          </span>
          <span className="truncate">Geen reactie</span>
        </div>
      </div>
      <p className="mt-1 border-t border-border/40 pt-1 text-[9px] font-normal italic text-muted-foreground/80">
        Klik op een cel om een van de 4 statussen te kiezen.
      </p>
    </div>
  );
}

function buildRows(clusters: ScheduleCluster[]): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const cluster of clusters) {
    const matches = [...cluster.matches].sort((a, b) =>
      a.match_date.localeCompare(b.match_date),
    );
    for (const match of matches) {
      rows.push({
        key: `match-${match.match_id}`,
        clusterKey: cluster.cluster_key,
        pollMonth: cluster.poll_month,
        dateOnly: cluster.match_date,
        matchDateIso: match.match_date,
        location: cluster.location,
        match,
      });
    }
  }

  return rows.sort((a, b) => {
    const day = a.dateOnly.localeCompare(b.dateOnly);
    if (day !== 0) return day;
    const loc = getLocationOrder(a.location) - getLocationOrder(b.location);
    if (loc !== 0) return loc;
    const time = a.matchDateIso.localeCompare(b.matchDateIso);
    if (time !== 0) return time;
    return a.match.match_id - b.match.match_id;
  });
}

interface DayGroup {
  dateOnly: string;
  sharedLocation: string | null;
  rows: MatrixRow[];
}

function groupRowsByDay(rows: MatrixRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.dateOnly === row.dateOnly) {
      last.rows.push(row);
    } else {
      groups.push({ dateOnly: row.dateOnly, sharedLocation: null, rows: [row] });
    }
  }
  return groups.map((group) => {
    const locations = [...new Set(group.rows.map((r) => formatLocationShort(r.location)))];
    return {
      ...group,
      sharedLocation: locations.length === 1 ? locations[0] : null,
    };
  });
}

/**
 * Zelfde matrix-UI als admin AvailabilityMatrix, voor één scheidsrechter (profiel).
 */
export function RefereeAvailabilityMatrix({
  clusters,
  myAvailability,
  username,
  userId,
  onSubmit,
  isSubmitting = false,
}: RefereeAvailabilityMatrixProps) {
  const [localAvailability, setLocalAvailability] = useState(myAvailability);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [menuCellKey, setMenuCellKey] = useState<string | null>(null);

  useEffect(() => {
    setLocalAvailability(myAvailability);
  }, [myAvailability]);

  const rows = useMemo(() => buildRows(clusters), [clusters]);
  const dayGroups = useMemo(() => groupRowsByDay(rows), [rows]);
  const matrixMinWidth = SESSION_COLUMN_WIDTH + REFEREE_COLUMN_WIDTH;

  const getStatus = useCallback(
    (row: MatrixRow): AvailValue => {
      const matchKey = matchAvailabilityKey(row.match.match_id);
      const monthKey = buildMatchPollGroupId(row.pollMonth, row.match.match_id);
      if (localAvailability.has(matchKey)) return localAvailability.get(matchKey) ?? false;
      if (localAvailability.has(monthKey)) return localAvailability.get(monthKey) ?? false;
      // Legacy profiel-rijen: datum__locatie
      if (localAvailability.has(row.clusterKey)) {
        return localAvailability.get(row.clusterKey) ?? false;
      }
      return null;
    },
    [localAvailability],
  );

  const applyStatus = useCallback(
    async (row: MatrixRow, choice: CellStatus) => {
      if (choice === "assigned") return; // alleen admin / toewijzing

      const next: AvailValue =
        choice === "available" ? true : choice === "unavailable" ? false : null;
      const matchKey = matchAvailabilityKey(row.match.match_id);
      const monthKey = buildMatchPollGroupId(row.pollMonth, row.match.match_id);
      const pendingKey = matchKey;

      setPendingKeys((prev) => new Set(prev).add(pendingKey));
      setLocalAvailability((prev) => {
        const map = new Map(prev);
        if (next === null) {
          map.delete(matchKey);
          map.delete(monthKey);
        } else {
          map.set(matchKey, next);
          map.set(monthKey, next);
        }
        return map;
      });

      try {
        await onSubmit(row.match.match_id, row.pollMonth, next);
      } catch {
        setLocalAvailability(myAvailability);
      } finally {
        setPendingKeys((prev) => {
          const map = new Set(prev);
          map.delete(pendingKey);
          return map;
        });
      }
    },
    [myAvailability, onSubmit],
  );

  if (clusters.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <table
            className="w-full table-fixed border-collapse text-sm"
            style={{ minWidth: matrixMinWidth }}
          >
            <colgroup>
              <col style={{ width: SESSION_COLUMN_WIDTH }} />
              <col style={{ width: REFEREE_COLUMN_WIDTH }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted">
                <th
                  scope="col"
                  className="sticky left-0 z-30 border-b border-r border-border bg-muted px-2 py-2 text-left align-middle"
                  style={{
                    width: SESSION_COLUMN_WIDTH,
                    minWidth: SESSION_COLUMN_WIDTH,
                  }}
                >
                  <MatrixStatusLegend />
                </th>
                <th
                  scope="col"
                  className="border-b border-border bg-muted p-1 align-bottom"
                  style={{
                    width: REFEREE_COLUMN_WIDTH,
                    minWidth: REFEREE_COLUMN_WIDTH,
                    height: 88,
                  }}
                >
                  <div
                    className="text-xs leading-tight whitespace-nowrap mx-auto font-semibold text-foreground"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    title={username}
                  >
                    {username}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {dayGroups.map((day) => (
                <Fragment key={day.dateOnly}>
                  <tr className="bg-muted">
                    <th
                      scope="rowgroup"
                      className="sticky left-0 z-10 border-r border-t border-border bg-muted px-2 py-1.5 text-left align-middle font-semibold"
                      style={{
                        width: SESSION_COLUMN_WIDTH,
                        minWidth: SESSION_COLUMN_WIDTH,
                        height: DAY_HEADER_HEIGHT,
                      }}
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0 text-xs text-foreground">
                          {formatDateWithDay(`${day.dateOnly}T12:00:00Z`)}
                        </span>
                        {day.sharedLocation ? (
                          <span className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
                            {day.sharedLocation}
                          </span>
                        ) : null}
                      </div>
                    </th>
                    <td
                      aria-hidden
                      className="border-t border-border bg-muted"
                      style={{
                        width: REFEREE_COLUMN_WIDTH,
                        minWidth: REFEREE_COLUMN_WIDTH,
                        height: DAY_HEADER_HEIGHT,
                      }}
                    />
                  </tr>
                  {day.rows.map((row, idx) => {
                    const matchKey = matchAvailabilityKey(row.match.match_id);
                    const monthKey = buildMatchPollGroupId(row.pollMonth, row.match.match_id);
                    const status = getStatus(row);
                    const isAssigned = row.match.assigned_referee_id === userId;
                    const hasResponded =
                      localAvailability.has(matchKey) ||
                      localAvailability.has(monthKey) ||
                      localAvailability.has(row.clusterKey);
                    const available = status === true;
                    const isPending =
                      pendingKeys.has(matchKey) || (isSubmitting && menuCellKey === row.key);
                    const rowBg = idx % 2 === 0 ? "bg-card" : "bg-muted/20";
                    const pairing = `${row.match.home_team_name} – ${row.match.away_team_name}`;

                    let cellClass = "bg-card hover:bg-primary/10 cursor-pointer";
                    let cellContent: React.ReactNode = (
                      <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/60" />
                    );
                    let tooltipText = `${username} – Geen reactie · Klik om status te kiezen`;

                    if (isAssigned) {
                      cellClass =
                        "bg-success hover:bg-success/90 cursor-default ring-2 ring-success/30 ring-inset";
                      cellContent = (
                        <Star className="mx-auto h-4 w-4 fill-white text-white" />
                      );
                      tooltipText = `${username} – Toegewezen`;
                    } else if (available) {
                      cellClass = "bg-success/15 hover:bg-success/30 cursor-pointer";
                      cellContent = <Check className="mx-auto h-4 w-4 text-success" />;
                      tooltipText = `${username} – Beschikbaar · Klik om status te kiezen`;
                    } else if (hasResponded) {
                      cellClass = "bg-destructive/5 hover:bg-destructive/15 cursor-pointer";
                      cellContent = (
                        <X className="mx-auto h-3.5 w-3.5 text-destructive/70" />
                      );
                      tooltipText = `${username} – Niet beschikbaar · Klik om status te kiezen`;
                    }

                    if (isPending) {
                      cellContent = (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin text-foreground" />
                      );
                    }

                    return (
                      <tr
                        key={row.key}
                        className={cn("group transition-colors hover:bg-muted", rowBg)}
                        style={{ height: SESSION_ROW_HEIGHT }}
                      >
                        <td
                          className={cn(
                            "sticky left-0 z-10 border-r border-t border-border p-0 align-middle group-hover:bg-muted",
                            rowBg,
                          )}
                          style={{
                            width: SESSION_COLUMN_WIDTH,
                            minWidth: SESSION_COLUMN_WIDTH,
                            height: SESSION_ROW_HEIGHT,
                          }}
                        >
                          <div className="flex h-full min-w-0 items-center gap-2 px-2 text-left">
                            <span className="w-11 shrink-0 tabular-nums text-xs font-semibold text-foreground">
                              {formatTimeForDisplay(row.matchDateIso)}
                            </span>
                            {!day.sharedLocation ? (
                              <span className="max-w-[5.5rem] shrink-0 truncate text-[10px] text-muted-foreground">
                                {formatLocationShort(row.location)}
                              </span>
                            ) : null}
                            <span
                              className="min-w-0 truncate text-xs font-medium text-foreground"
                              title={pairing}
                            >
                              {pairing}
                            </span>
                          </div>
                        </td>
                        <td
                          className="border-t border-border p-0 align-middle"
                          style={{
                            width: REFEREE_COLUMN_WIDTH,
                            minWidth: REFEREE_COLUMN_WIDTH,
                            height: SESSION_ROW_HEIGHT,
                          }}
                        >
                          <DropdownMenu
                            open={menuCellKey === row.key}
                            onOpenChange={(open) => setMenuCellKey(open ? row.key : null)}
                          >
                            <DropdownMenuTrigger asChild disabled={isPending}>
                              <button
                                type="button"
                                title={tooltipText}
                                aria-label={tooltipText}
                                aria-haspopup="menu"
                                className={cn(
                                  "flex h-full w-full items-center justify-center transition-all",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                  "disabled:cursor-wait",
                                  cellClass,
                                )}
                                style={{ height: SESSION_ROW_HEIGHT }}
                              >
                                {cellContent}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              side="bottom"
                              align="center"
                              sideOffset={4}
                              collisionPadding={12}
                              onCloseAutoFocus={(event) => event.preventDefault()}
                              className="z-[80] w-48 border border-[hsl(var(--color-200))] shadow-sm"
                            >
                              <DropdownMenuItem disabled>
                                <Star className="mr-2 h-3.5 w-3.5 text-success" />
                                Toegewezen
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  admin
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isAssigned}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void applyStatus(row, "available");
                                }}
                              >
                                <Check className="mr-2 h-3.5 w-3.5 text-success" />
                                Beschikbaar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isAssigned}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void applyStatus(row, "unavailable");
                                }}
                              >
                                <X className="mr-2 h-3.5 w-3.5 text-destructive/80" />
                                Niet beschikbaar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isAssigned}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  void applyStatus(row, "none");
                                }}
                              >
                                <Minus className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                Geen reactie
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
