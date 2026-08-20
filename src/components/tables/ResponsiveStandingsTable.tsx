import React from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  divisionSortKey,
  formatDivisionDisplayName,
} from "@/lib/competitionDivision";

/** Rij in de competitiestand — herbruikbaar in hooks/pagina's */
export interface StandingsTeamRow {
  id: number;
  name: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalDiff: number;
  points: number;
  division?: string | null;
}

export interface ResponsiveStandingsTableProps {
  teams?: StandingsTeamRow[];
  isLoading?: boolean;
  /** Tabel als card: volle breedte, shadow, geen dubbele padding */
  embeddedInCard?: boolean;
}

/** Stat-kolommen tussen Team en Ptn (volgorde = tabel) */
const STAT_COLUMNS = [
  { id: "wed", label: "Wed", width: "w-10", dividerBefore: true },
  { id: "w", label: "W", width: "w-9" },
  { id: "g", label: "G", width: "w-9" },
  { id: "v", label: "V", width: "w-9" },
  { id: "saldo", label: "+/-", width: "w-10", dividerBefore: true },
] as const;

/**
 * Tailwind tokens — responsive gedrag in index.css (.responsive-standings-table).
 * Blauwe body-tekst: Team, W/G (incl. 0), +/-, Ptn — zie index.css.
 */
const S = {
  border: "border standings-table-shell",
  row: "standings-row-divider",
  colDivider: "standings-col-divider",
  scrollWrap:
    "responsive-standings-table standings-scroll-wrap overflow-x-auto",
  table:
    "w-full min-w-0 lg:min-w-[20rem] border-collapse text-sm standings-table-fit",
  headerCell:
    "standings-header-cell py-2 px-1.5 sm:px-2 text-center font-medium text-xs",
  statCell: "py-2.5 px-1.5 sm:px-2 text-center tabular-nums",
  teamCell:
    "py-2.5 px-1.5 sm:px-2 text-left font-medium standings-sticky-team standings-sticky-bg standings-team-col lg:min-w-[9rem]",
  embeddedClip:
    "w-full max-w-none rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 card-hover overflow-hidden",
  standaloneWrap: "rounded-md",
} as const;

function scrollWrapClass() {
  return S.scrollWrap;
}

function standingsTableShell(
  embeddedInCard: boolean | undefined,
  children: React.ReactNode,
  shellProps?: React.HTMLAttributes<HTMLDivElement>,
) {
  const scroll = (
    <div className={scrollWrapClass()} {...shellProps}>
      {children}
    </div>
  );

  if (embeddedInCard) {
    return <div className={cn(S.embeddedClip, S.border)}>{scroll}</div>;
  }

  return <div className={cn(S.standaloneWrap, S.border)}>{scroll}</div>;
}

function legendClass(embeddedInCard?: boolean, extra?: string) {
  return cn(embeddedInCard && "px-4 pb-3 pt-2", extra);
}

function statHeaderClass(
  col: (typeof STAT_COLUMNS)[number],
) {
  return cn(
    S.headerCell,
    col.width,
    "standings-scroll-stats",
    ("dividerBefore" in col && col.dividerBefore) && S.colDivider,
  );
}

function StandingsHeader() {
  return (
    <thead>
      <tr className={S.row}>
        <th scope="col" className={cn(S.headerCell, "w-9 standings-sticky-pos")}>
          #
        </th>
        <th
          scope="col"
          className={cn(
            S.headerCell,
            "standings-sticky-team standings-team-col text-left",
            S.colDivider,
          )}
        >
          Team
        </th>
        {STAT_COLUMNS.map((col) => (
          <th key={col.id} scope="col" className={statHeaderClass(col)}>
            {col.label}
          </th>
        ))}
        <th
          scope="col"
          className={cn(
            S.headerCell,
            "w-11 pr-2 sm:pr-3 font-semibold standings-sticky-ptn",
            S.colDivider,
          )}
        >
          Ptn
        </th>
      </tr>
    </thead>
  );
}

function StandingsRow({
  team,
  index,
}: {
  team: StandingsTeamRow;
  index: number;
}) {
  const position = index + 1;
  const cellBg = "bg-white group-hover:bg-muted";

  return (
    <tr
      className={cn(
        "group last:border-b-0 transition-colors bg-white hover:bg-muted",
        S.row,
      )}
    >
      <td
        className={cn(
          S.statCell,
          "w-9 text-muted-foreground font-medium standings-sticky-pos standings-sticky-bg",
          cellBg,
        )}
      >
        {position}
      </td>
      <td className={cn(S.teamCell, S.colDivider, cellBg)}>
        <span className="standings-team-name leading-snug break-words">
          {team.name}
        </span>
      </td>
      <td
        className={cn(
          S.statCell,
          "w-10 text-muted-foreground standings-scroll-stats",
          S.colDivider,
          cellBg,
        )}
      >
        {team.played}
      </td>
      <td
        className={cn(
          S.statCell,
          "w-9 standings-w-cell standings-scroll-stats",
          cellBg,
          team.won > 0 && "text-success font-medium",
        )}
      >
        {team.won}
      </td>
      <td
        className={cn(
          S.statCell,
          "w-9 standings-g-cell standings-scroll-stats",
          cellBg,
          team.draw > 0 && "text-warning font-medium",
        )}
      >
        {team.draw}
      </td>
      <td
        className={cn(
          S.statCell,
          "w-9 font-medium standings-lost standings-scroll-stats",
          cellBg,
        )}
      >
        {team.lost}
      </td>
      <td
        className={cn(
          S.statCell,
          "w-10 font-medium standings-saldo-cell standings-scroll-stats",
          S.colDivider,
          cellBg,
        )}
      >
        {team.goalDiff > 0 ? "+" : ""}
        {team.goalDiff}
      </td>
      <td
        className={cn(
          S.statCell,
          "w-11 pr-2 sm:pr-3 font-bold text-base sm:text-sm standings-ptn-cell standings-sticky-ptn standings-sticky-bg",
          S.colDivider,
          cellBg,
        )}
      >
        {team.points}
      </td>
    </tr>
  );
}

function StandingsSkeleton({ embeddedInCard }: { embeddedInCard?: boolean }) {
  return standingsTableShell(
    embeddedInCard,
    <table className={S.table}>
      <StandingsHeader />
      <tbody>
        {Array.from({ length: 8 }, (_, i) => (
          <tr key={i} className={cn(S.row, "bg-white")}>
            <td className="w-9 py-2.5 standings-sticky-pos standings-sticky-bg bg-white">
              <Skeleton className="h-4 w-4 mx-auto bg-muted" />
            </td>
            <td className={cn(S.teamCell, S.colDivider, "py-2.5 pr-2 bg-white")}>
              <Skeleton className="h-4 w-full max-w-[10rem] bg-muted" />
            </td>
            {STAT_COLUMNS.map((col) => (
              <td
                key={col.id}
                className={cn(
                  "py-2.5 standings-scroll-stats bg-white",
                  ("dividerBefore" in col && col.dividerBefore) && S.colDivider,
                )}
              >
                <Skeleton className="h-4 w-5 mx-auto bg-muted" />
              </td>
            ))}
            <td
              className={cn(
                "py-2.5 pr-2 sm:pr-3 standings-sticky-ptn standings-sticky-bg bg-white",
                S.colDivider,
              )}
            >
              <Skeleton className="h-5 w-6 mx-auto bg-muted" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>,
    { role: "status", "aria-live": "polite", "aria-busy": true },
  );
}

function MobileScrollHint({ embeddedInCard }: { embeddedInCard?: boolean }) {
  return (
    <p
      className={legendClass(
        embeddedInCard,
        "mt-0 px-2 py-1 text-xs text-muted-foreground flex items-center justify-center gap-1.5 sm:hidden",
      )}
      aria-hidden="true"
    >
      <ChevronRight
        className="w-3.5 h-3.5 shrink-0 text-primary/70 motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <span>Veeg voor Wed, W, G, V en +/-</span>
      <ChevronRight
        className="w-3.5 h-3.5 shrink-0 text-primary/70 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    </p>
  );
}

function DesktopLegend({ embeddedInCard }: { embeddedInCard?: boolean }) {
  return (
    <p
      className={legendClass(
        embeddedInCard,
        "mt-0 px-1 text-xs text-muted-foreground text-center leading-relaxed hidden sm:block",
      )}
    >
      Wed = Gespeeld • W = Winst • G = Gelijk • V = Verlies • +/- = Doelsaldo •
      Ptn = Punten
    </p>
  );
}

function groupStandingsByDivision(
  teams: StandingsTeamRow[],
): { title: string | null; teams: StandingsTeamRow[] }[] {
  const named = [
    ...new Set(
      teams
        .map((team) => team.division)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (named.length < 2) {
    return [{ title: null, teams }];
  }

  const ordered = [...named].sort((a, b) =>
    divisionSortKey(a).localeCompare(divisionSortKey(b), "nl"),
  );
  const groups = ordered.map((title) => ({
    title,
    teams: teams.filter((team) => team.division === title),
  }));
  const leftover = teams.filter((team) => !team.division);
  if (leftover.length > 0) {
    groups.push({ title: null, teams: leftover });
  }
  return groups;
}

function StandingsTableBlock({
  teams,
  title,
  embeddedInCard,
}: {
  teams: StandingsTeamRow[];
  title: string | null;
  embeddedInCard?: boolean;
}) {
  const displayTitle = formatDivisionDisplayName(title);
  const label = displayTitle
    ? `Competitiestand ${displayTitle}`
    : "Competitiestand";

  return (
    <div className="space-y-2">
      {displayTitle ? (
        <h3 className="text-base font-semibold text-brand-dark">
          {displayTitle}
        </h3>
      ) : null}
      <div className="standings-scroll-hint relative w-full">
        {standingsTableShell(
          embeddedInCard,
          <table className={S.table}>
            <StandingsHeader />
            <tbody>
              {teams.map((team, index) => (
                <StandingsRow key={team.id} team={team} index={index} />
              ))}
            </tbody>
          </table>,
          { role: "table", "aria-label": label },
        )}
      </div>
    </div>
  );
}

const ResponsiveStandingsTable: React.FC<ResponsiveStandingsTableProps> = ({
  teams,
  isLoading,
  embeddedInCard,
}) => {
  if (isLoading) {
    return <StandingsSkeleton embeddedInCard={embeddedInCard} />;
  }

  if (!teams?.length) {
    return (
      <div
        className={cn(
          "text-center py-8 text-sm text-muted-foreground",
          embeddedInCard && "px-4",
        )}
      >
        Geen teams beschikbaar
      </div>
    );
  }

  const groups = groupStandingsByDivision(teams);

  return (
    <div className={cn("space-y-4", embeddedInCard && "w-full max-w-none")}>
      {groups.map((group) => (
        <StandingsTableBlock
          key={group.title ?? "all"}
          title={group.title}
          teams={group.teams}
          embeddedInCard={embeddedInCard}
        />
      ))}
      <MobileScrollHint embeddedInCard={embeddedInCard} />
      <DesktopLegend embeddedInCard={embeddedInCard} />
    </div>
  );
};

export default ResponsiveStandingsTable;
