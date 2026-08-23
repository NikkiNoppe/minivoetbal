import React, { memo, useMemo, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Trophy} from "lucide-react";
import { Link } from "react-router-dom";
import ResponsiveStandingsTable from "@/components/tables/ResponsiveStandingsTable";
import { useCompetitionData, MatchData } from "@/hooks/useCompetitionData";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { PageHeader, PublicPage, PublicSectionHeading, PUBLIC_CARD_CLASS } from "@/components/layout";
import { FilterSelect, FilterGroup } from "@/components/ui/filter-select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DownloadScheduleButton from "@/components/common/DownloadScheduleButton";
import {
  SCHEDULE_ACCORDION_ITEM,
  SCHEDULE_MATCH_META,
  SCHEDULE_MATCH_ROW,
  SCHEDULE_MATCH_SCORE,
  SCHEDULE_MATCH_TEAM,
  SCHEDULE_TRIGGER,
  SCHEDULE_TRIGGER_ACTIVE,
} from "@/components/common/scheduleControlStyles";
import { seasonService } from "@/services/seasonService";
import { deriveSeasonLabel } from "@/services/archiveService";
import { useTabVisibility } from "@/context/TabVisibilityContext";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { cn } from "@/lib/utils";
import {
  divisionFromSpeeldag,
  divisionSortKey,
  formatDivisionDisplayName,
  speeldagNumberFromLabel,
} from "@/lib/competitionDivision";

const DataErrorState = memo(({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <div className="text-center p-6">
    <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" aria-hidden="true" />
    <p className="text-sm text-muted-foreground mb-4">{message}</p>
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-[44px]"
      onClick={() => onRetry()}
    >
      Opnieuw proberen
    </Button>
  </div>
));
DataErrorState.displayName = "DataErrorState";

const ScheduleAccordionSkeleton = memo(() => (
  <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
    {[...Array(3)].map((_, i) => (
      <div key={i} className={SCHEDULE_ACCORDION_ITEM}>
        <Skeleton className="h-11 w-full rounded-none bg-muted/60" />
      </div>
    ))}
  </div>
));
ScheduleAccordionSkeleton.displayName = "ScheduleAccordionSkeleton";

const MONTHS_NL_SHORT = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
] as const;

function parseUtcDate(dateStr: string): Date | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDayMonth(dateStr: string): string {
  const date = parseUtcDate(dateStr);
  if (!date) return dateStr;
  return `${date.getUTCDate()} ${MONTHS_NL_SHORT[date.getUTCMonth()]}`;
}

function formatMatchDateSpan(dates: string[]): string {
  const sorted = [...new Set(dates.filter(Boolean))].sort();
  if (sorted.length === 0) return "";
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return formatDayMonth(first);
  return `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
}

type ScheduleMatchdayGroup = {
  value: string;
  title: string;
  dateLabel: string;
  matches: MatchData[];
};

type ScheduleReeksGroup = {
  name: string | null;
  displayName: string | null;
  matchdays: ScheduleMatchdayGroup[];
};

const ScheduleEmptyState = memo(({
  hasTeamFilter,
  onResetFilter,
}: {
  hasTeamFilter: boolean;
  onResetFilter: () => void;
}) => (
  <div className="text-center py-8 space-y-4">
    <p className="text-sm text-muted-foreground">
      Geen wedstrijden gevonden met de huidige filters
    </p>
    {hasTeamFilter && (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[44px]"
        onClick={onResetFilter}
      >
        Toon alles
      </Button>
    )}
  </div>
));
ScheduleEmptyState.displayName = "ScheduleEmptyState";

function reeksParamFromName(name: string): string {
  if (/eerste/i.test(name)) return "eerste";
  if (/tweede/i.test(name)) return "tweede";
  return name.toLowerCase().replace(/\s+/g, "-");
}

const ReeksFilter = memo(({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div
    className="grid grid-cols-3 gap-2 mb-3"
    role="radiogroup"
    aria-label="Reeks"
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-[44px] px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold border-[1.5px] text-center leading-tight",
            "transition-colors duration-200 motion-safe:transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            active
              ? "bg-brand-700 text-white border-brand-700 shadow-md"
              : "bg-card text-brand-800 border-brand-light hover:bg-primary/5",
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
));
ReeksFilter.displayName = "ReeksFilter";

const MatchListItem = memo(({ match }: { match: MatchData }) => {
  const isCompleted =
    match.homeScore !== undefined && match.awayScore !== undefined;

  return (
    <div className={SCHEDULE_MATCH_ROW}>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-1">
        <div className={cn("text-sm font-medium leading-tight text-left truncate", SCHEDULE_MATCH_TEAM)}>
          {match.homeTeamName}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted ? (
            <>
              <span className={cn("text-sm font-bold min-w-[20px] text-center tabular-nums", SCHEDULE_MATCH_SCORE)}>
                {match.homeScore}
              </span>
              <span className={cn("text-sm", SCHEDULE_MATCH_META)}>-</span>
              <span className={cn("text-sm font-bold min-w-[20px] text-center tabular-nums", SCHEDULE_MATCH_SCORE)}>
                {match.awayScore}
              </span>
            </>
          ) : (
            <span className={cn("text-sm font-medium", SCHEDULE_MATCH_META)}>vs</span>
          )}
        </div>
        <div className={cn("text-sm font-medium leading-tight text-right truncate", SCHEDULE_MATCH_TEAM)}>
          {match.awayTeamName}
        </div>
      </div>
      <div className={cn("grid grid-cols-3 gap-2 text-xs font-medium", SCHEDULE_MATCH_META)}>
        <span className="text-left truncate">{match.date}</span>
        <span className="text-center tabular-nums">{match.time || ""}</span>
        <span className="text-right truncate">{match.location || ""}</span>
      </div>
    </div>
  );
});
MatchListItem.displayName = "MatchListItem";

const MatchGroup = memo(({
  value,
  title,
  dateLabel,
  matches,
}: ScheduleMatchdayGroup) => (
  <AccordionItem value={value} className={SCHEDULE_ACCORDION_ITEM}>
    <AccordionTrigger
      variant="plain"
      className={cn(SCHEDULE_TRIGGER, SCHEDULE_TRIGGER_ACTIVE, "px-4 gap-3")}
    >
      <span className="text-left flex-1 min-w-0 truncate">{title}</span>
      {dateLabel ? (
        <span className="text-xs font-normal text-muted-foreground shrink-0 tabular-nums">
          {dateLabel}
        </span>
      ) : null}
    </AccordionTrigger>
    <AccordionContent className="!p-0 border-t border-brand-light bg-card">
      {matches.map((match) => (
        <MatchListItem key={match.matchId} match={match} />
      ))}
    </AccordionContent>
  </AccordionItem>
));
MatchGroup.displayName = "MatchGroup";

const EMPTY_MATCHES: MatchData[] = [];

const CompetitiePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    teams,
    hasStandingsData,
    hasMatchesData,
    matches,
    standingsFetching,
    standingsError,
    refetchStandings,
    matchesFetching,
    matchesFetched,
    matchesError,
    refetchMatches,
    isRefreshing,
  } = useCompetitionData();

  const waitingForStandings =
    !hasStandingsData && standingsFetching && !standingsError;
  const waitingForMatches =
    !hasMatchesData && matchesFetching && !matchesError;

  const standingsGate = useMinLoadingGate(waitingForStandings);
  const matchesGate = useMinLoadingGate(waitingForMatches);

  const showStandingsSkeleton =
    (waitingForStandings || !standingsGate.minReady) &&
    !standingsGate.timedOut &&
    !standingsError;
  const showStandingsTimeout = standingsGate.timedOut && !hasStandingsData;

  const showMatchesSkeleton =
    (waitingForMatches || !matchesGate.minReady) &&
    !matchesGate.timedOut &&
    !matchesError;
  const showMatchesTimeout = matchesGate.timedOut && !hasMatchesData;

  const { isTabVisible } = useTabVisibility();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const { data: seasonData } = useQuery({
    queryKey: withOrgQueryKey(["seasonData"], organizationId),
    queryFn: () => seasonService.getSeasonData(organizationId!),
    enabled: orgQueryEnabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const seasonSubtitle = seasonData
    ? `Seizoen ${deriveSeasonLabel(
        seasonData.season_start_date,
        seasonData.season_end_date,
      )}`
    : undefined;

  const [selectedTeam, setSelectedTeam] = useState(
    () => searchParams.get("team") ?? "all",
  );
  const [selectedReeks, setSelectedReeks] = useState("all");
  const [openSpeeldag, setOpenSpeeldag] = useState("");

  const handleTeamChange = useCallback(
    (value: string) => {
      setSelectedTeam(value);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === "all") {
            next.delete("team");
          } else {
            next.set("team", value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleReeksChange = useCallback(
    (value: string) => {
      setSelectedReeks(value);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === "all") {
            next.delete("reeks");
          } else {
            next.set("reeks", reeksParamFromName(value));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const urlTeam = searchParams.get("team") ?? "all";
    setSelectedTeam((prev) => (prev === urlTeam ? prev : urlTeam));
  }, [searchParams]);

  const allMatches = matches?.all ?? EMPTY_MATCHES;

  const availableReeksen = useMemo(() => {
    const names = [
      ...new Set(
        allMatches
          .map((match) => divisionFromSpeeldag(match.matchday))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    return names.sort((a, b) =>
      divisionSortKey(a).localeCompare(divisionSortKey(b), "nl"),
    );
  }, [allMatches]);

  const showReeksFilter = availableReeksen.length >= 2;

  const reeksFilterOptions = useMemo(
    () => [
      { value: "all", label: "Alle reeksen" },
      ...availableReeksen.map((name) => ({
        value: name,
        label: formatDivisionDisplayName(name) ?? name,
      })),
    ],
    [availableReeksen],
  );

  const visibleTeamNames = useMemo(() => {
    const source =
      selectedReeks === "all"
        ? allMatches
        : allMatches.filter(
            (match) => divisionFromSpeeldag(match.matchday) === selectedReeks,
          );
    return [
      ...new Set([
        ...source.map((match) => match.homeTeamName),
        ...source.map((match) => match.awayTeamName),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "nl"));
  }, [allMatches, selectedReeks]);

  useEffect(() => {
    const param = searchParams.get("reeks");
    if (!param || param === "all") {
      setSelectedReeks((prev) => (prev === "all" ? prev : "all"));
      return;
    }
    const match = availableReeksen.find(
      (name) => reeksParamFromName(name) === param || name === param,
    );
    if (match) {
      setSelectedReeks((prev) => (prev === match ? prev : match));
    } else if (availableReeksen.length > 0) {
      setSelectedReeks((prev) => (prev === "all" ? prev : "all"));
    }
  }, [searchParams, availableReeksen]);

  useEffect(() => {
    if (!matchesFetched) return;
    if (selectedTeam === "all") return;
    if (visibleTeamNames.includes(selectedTeam)) return;
    handleTeamChange("all");
  }, [matchesFetched, visibleTeamNames, selectedTeam, handleTeamChange]);

  const filteredMatches = useMemo(() => {
    const filtered = allMatches.filter((m) => {
      if (
        selectedReeks !== "all" &&
        divisionFromSpeeldag(m.matchday) !== selectedReeks
      ) {
        return false;
      }
      if (
        selectedTeam !== "all" &&
        m.homeTeamName !== selectedTeam &&
        m.awayTeamName !== selectedTeam
      ) {
        return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const aKey = `${a.date}T${a.time}`;
      const bKey = `${b.date}T${b.time}`;
      return aKey.localeCompare(bKey);
    });
  }, [allMatches, selectedTeam, selectedReeks]);

  const groupedMatches = useMemo((): ScheduleReeksGroup[] => {
    const byReeks = new Map<string, MatchData[]>();
    filteredMatches.forEach((match) => {
      const name = divisionFromSpeeldag(match.matchday);
      const reeksKey = name ?? "";
      const list = byReeks.get(reeksKey);
      if (list) list.push(match);
      else byReeks.set(reeksKey, [match]);
    });

    return Array.from(byReeks.entries())
      .sort(([a], [b]) =>
        divisionSortKey(a || null).localeCompare(divisionSortKey(b || null), "nl"),
      )
      .map(([reeksKey, reeksMatches]) => {
        const bySpeeldag = new Map<string, MatchData[]>();
        reeksMatches.forEach((match) => {
          const number = speeldagNumberFromLabel(match.matchday);
          const speeldagKey = number != null ? String(number) : (match.matchday || "Overige");
          const list = bySpeeldag.get(speeldagKey);
          if (list) list.push(match);
          else bySpeeldag.set(speeldagKey, [match]);
        });

        const matchdays = Array.from(bySpeeldag.entries())
          .sort(([a], [b]) => {
            const na = Number(a);
            const nb = Number(b);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            return a.localeCompare(b, "nl");
          })
          .map(([speeldagKey, dayMatches]) => {
            const number = Number(speeldagKey);
            const title = Number.isFinite(number)
              ? `Speeldag ${number}`
              : speeldagKey;
            return {
              value: `${reeksKey || "all"}::${speeldagKey}`,
              title,
              dateLabel: formatMatchDateSpan(dayMatches.map((m) => m.date)),
              matches: dayMatches,
            };
          });

        return {
          name: reeksKey || null,
          displayName: formatDivisionDisplayName(reeksKey || null),
          matchdays,
        };
      });
  }, [filteredMatches]);

  const allMatchdayKeys = useMemo(
    () => groupedMatches.flatMap((reeks) => reeks.matchdays.map((day) => day.value)),
    [groupedMatches],
  );

  const defaultOpenSpeeldag = useMemo(() => {
    for (const reeks of groupedMatches) {
      for (const day of reeks.matchdays) {
        const isCompleted = day.matches.every(
          (match) =>
            match.homeScore !== undefined &&
            match.homeScore !== null &&
            match.awayScore !== undefined &&
            match.awayScore !== null,
        );
        if (!isCompleted && day.matches.length > 0) {
          return day.value;
        }
      }
    }
    return allMatchdayKeys.length > 0
      ? allMatchdayKeys[allMatchdayKeys.length - 1]
      : undefined;
  }, [groupedMatches, allMatchdayKeys]);

  const allRegularMatchesComplete = useMemo(() => {
    if (allMatches.length === 0) return false;
    return allMatches.every(
      (m) =>
        m.homeScore !== undefined &&
        m.homeScore !== null &&
        m.awayScore !== undefined &&
        m.awayScore !== null,
    );
  }, [allMatches]);

  const showPlayoffBanner =
    allRegularMatchesComplete && isTabVisible("playoff");

  const matchdayKeysSignature = allMatchdayKeys.join("|");

  useEffect(() => {
    setOpenSpeeldag(defaultOpenSpeeldag ?? "");
  }, [selectedTeam, selectedReeks, matchdayKeysSignature, defaultOpenSpeeldag]);

  const handleAccordionChange = useCallback((reeksValues: string[]) => {
    return (value: string) => {
      if (value) {
        setOpenSpeeldag(value);
        return;
      }
      setOpenSpeeldag((prev) => (reeksValues.includes(prev) ? "" : prev));
    };
  }, []);

  const formatDutchDayShort = (dateStr: string): string => {
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      if (!y || !m || !d) return dateStr;
      const date = new Date(Date.UTC(y, m - 1, d));
      const days = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];
      const dayAbbr = days[date.getUTCDay()];
      const yy = String(y).slice(-2);
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${dayAbbr} ${dd}-${mm}-${yy}`;
    } catch {
      return dateStr;
    }
  };

  const scheduleMatchesForExport = filteredMatches.map((m) => ({
    matchId: m.matchId,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    date: m.date,
    time: m.time,
    location: m.location,
    matchday: m.matchday,
    uniqueNumber: m.uniqueNumber,
  }));

  const teamFilterValue =
    selectedTeam === "all" || visibleTeamNames.includes(selectedTeam)
      ? selectedTeam
      : "all";

  return (
    <PublicPage>
      <PageHeader
        title="Competitie"
        icon={Trophy}
        subtitle={seasonSubtitle}
        className="mb-0"
        rightAction={
          isRefreshing ? (
            <span
              className="flex items-center justify-end gap-1 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Vernieuwen…
            </span>
          ) : undefined
        }
      />

      {showPlayoffBanner && (
        <Alert
          className="border-primary/30 bg-primary/5 flex items-center justify-center py-4 text-center"
        >
          <AlertDescription className="text-center">
            <strong>Reguliere competitie afgelopen!</strong>{" "}
            <Link
              to="/playoff"
              className="text-primary font-medium hover:underline"
            >
              Bekijk de play-offs →
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <section role="region" aria-labelledby="standings-heading">
        <PublicSectionHeading id="standings-heading">
          Competitiestand
        </PublicSectionHeading>
        {standingsError || showStandingsTimeout ? (
          <Card className={PUBLIC_CARD_CLASS}>
            <CardContent className="p-4">
              <DataErrorState
                message={
                  showStandingsTimeout
                    ? "Het laden van de competitiestand duurt te lang. Controleer je verbinding."
                    : "Er is een fout opgetreden bij het laden van de competitiestand."
                }
                onRetry={() => refetchStandings()}
              />
            </CardContent>
          </Card>
        ) : (
          <ResponsiveStandingsTable
            teams={teams}
            isLoading={showStandingsSkeleton}
            embeddedInCard
          />
        )}
      </section>

      <section role="region" aria-labelledby="schedule-heading">
        <PublicSectionHeading id="schedule-heading">
          Speelschema
        </PublicSectionHeading>

        {showReeksFilter ? (
          <ReeksFilter
            options={reeksFilterOptions}
            value={selectedReeks}
            onChange={handleReeksChange}
          />
        ) : null}

        <FilterGroup columns={1} className="mb-4 w-full">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 w-full">
            <div className="flex-1 min-w-0 w-full">
              <FilterSelect
                label="Team"
                value={teamFilterValue}
                onValueChange={handleTeamChange}
                placeholder="Selecteer team"
                variant="schedule"
                options={[
                  { value: "all", label: "Alle teams" },
                  ...visibleTeamNames.map((t) => ({ value: t, label: t })),
                ]}
              />
            </div>
            <div className="w-full sm:w-1/4 sm:shrink-0">
              <DownloadScheduleButton
                matches={scheduleMatchesForExport}
                selectedTeamLabel={
                  selectedTeam !== "all" ? selectedTeam : undefined
                }
                filename={
                  selectedTeam !== "all"
                    ? `competitie-${selectedTeam.toLowerCase().replace(/\s+/g, "-")}`
                    : "competitie-schema"
                }
                calendarName={
                  selectedTeam !== "all"
                    ? `Competitie - ${selectedTeam}`
                    : "Competitie Speelschema"
                }
                competitionType="competitie"
              />
            </div>
          </div>
        </FilterGroup>

        {matchesError || showMatchesTimeout ? (
          <DataErrorState
            message={
              showMatchesTimeout
                ? "Het laden van het speelschema duurt te lang. Controleer je verbinding."
                : "Er is een fout opgetreden bij het laden van het speelschema."
            }
            onRetry={() => refetchMatches()}
          />
        ) : showMatchesSkeleton ? (
          <ScheduleAccordionSkeleton />
        ) : groupedMatches.length > 0 ? (
          <div className="space-y-6">
            {groupedMatches.map((reeks) => {
              const reeksValues = reeks.matchdays.map((day) => day.value);
              return (
                <div key={reeks.name ?? "all"} className="space-y-2">
                  {reeks.displayName && selectedReeks === "all" ? (
                    <h3 className="text-base font-semibold text-brand-dark">
                      {reeks.displayName}
                    </h3>
                  ) : null}
                  <Accordion
                    type="single"
                    collapsible
                    value={reeksValues.includes(openSpeeldag) ? openSpeeldag : ""}
                    onValueChange={handleAccordionChange(reeksValues)}
                    className="space-y-3"
                  >
                    {reeks.matchdays.map((day) => (
                      <MatchGroup
                        key={day.value}
                        value={day.value}
                        title={day.title}
                        dateLabel={day.dateLabel}
                        matches={day.matches.map((m) => ({
                          ...m,
                          date: formatDutchDayShort(m.date),
                        }))}
                      />
                    ))}
                  </Accordion>
                </div>
              );
            })}
          </div>
        ) : matchesFetched ? (
          <ScheduleEmptyState
            hasTeamFilter={selectedTeam !== "all" || selectedReeks !== "all"}
            onResetFilter={() => {
              handleTeamChange("all");
              if (selectedReeks !== "all") handleReeksChange("all");
            }}
          />
        ) : null}
      </section>
    </PublicPage>
  );
};

export default CompetitiePage;
