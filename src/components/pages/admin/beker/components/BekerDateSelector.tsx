import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AppModal } from "@/components/modals/base/app-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Info, Sparkles } from "lucide-react";
import { seasonService } from "@/services";
import { fetchMatchesForSession } from "@/services/core/matchesSessionBulk";
import {
  buildCupRoundLabels,
  type IdealCupDatesSuggestion,
} from "@/lib/cupBracketPlan";
import { toMondayIso } from "@/lib/competitionPlanningEstimate";
import {
  buildSlotDetailsFromSeasonData,
  reserveCupWeeks,
} from "@/lib/seasonCalendar";
import { filterActiveSlotUnavailability } from "@/services/slotUnavailabilityService";
import { cn } from "@/lib/utils";

interface BekerDateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDatesSelected: (dates: string[], rationale?: string[]) => void;
  isLoading?: boolean;
  /** Exact aantal speelweken (berekend uit teamcount + effectieve slots). */
  weeks: number;
  /** Aantal 1/8-weken (voor ronde-labels). */
  firstRoundWeeks?: number;
  organizationId: number;
  /** Aantal geselecteerde bekerteams (voor effectieve bracket). */
  cupTeamCount: number;
  allowByeSelection?: boolean;
  teamsForBye?: Array<{ team_id: number; team_name: string }>;
  onByeSelected?: (teamId: number | null) => void;
  /** Wanneer dat effectieve weken/slots afwijken van de parent-schatting. */
  onResolvedPlan?: (plan: {
    requiredWeeks: number;
    firstRoundWeeks: number;
    effectiveSlotsPerWeek: number;
  }) => void;
}

function formatDateHint(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const BekerDateInput = React.memo<{
  id: string;
  label: string;
  value: string;
  minDate: string;
  onChange: (value: string) => void;
}>(({ id, label, value, minDate, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={id} className="text-sm font-medium text-brand-dark">
        {label}
      </Label>
      {value ? (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {formatDateHint(value)}
        </span>
      ) : null}
    </div>
    <Input
      id={id}
      type="date"
      value={value}
      min={minDate}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-[44px]"
      aria-required
    />
  </div>
));
BekerDateInput.displayName = "BekerDateInput";

const BekerRoundComponent = React.memo<{
  round: {
    type: "group" | "single";
    name: string;
    index?: number;
    subRounds?: Array<{ name: string; index: number }>;
  };
  selectedDates: string[];
  minimumDates: string[];
  onDateChange: (index: number, value: string) => void;
}>(({ round, selectedDates, minimumDates, onDateChange }) => {
  if (round.type === "group") {
    return (
      <section className="rounded-lg border border-primary/20 bg-card p-3 sm:p-4 space-y-3">
        <h3 className="text-sm font-semibold text-brand-dark">{round.name}</h3>
        <div className="space-y-3">
          {round.subRounds?.map((subRound) => (
            <BekerDateInput
              key={subRound.index}
              id={`beker-date-${subRound.index}`}
              label={subRound.name}
              value={selectedDates[subRound.index] ?? ""}
              minDate={minimumDates[subRound.index] ?? ""}
              onChange={(value) => onDateChange(subRound.index, value)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-primary/20 bg-card p-3 sm:p-4">
      <BekerDateInput
        id={`beker-date-${round.index}`}
        label={round.name}
        value={selectedDates[round.index!] ?? ""}
        minDate={minimumDates[round.index!] ?? ""}
        onChange={(value) => onDateChange(round.index!, value)}
      />
    </section>
  );
});
BekerRoundComponent.displayName = "BekerRoundComponent";

const BekerLoadingSkeleton = React.memo(() => (
  <div className="space-y-3" aria-busy="true" aria-live="polite">
    <span className="sr-only">Ideale speeldata laden…</span>
    <Skeleton className="h-16 w-full rounded-lg" />
    <Skeleton className="h-10 w-full rounded-md" />
    <Skeleton className="h-20 w-full rounded-lg" />
    <Skeleton className="h-20 w-full rounded-lg" />
    <Skeleton className="h-20 w-full rounded-lg" />
  </div>
));
BekerLoadingSkeleton.displayName = "BekerLoadingSkeleton";

const BekerDateSelector: React.FC<BekerDateSelectorProps> = ({
  open,
  onOpenChange,
  onDatesSelected,
  isLoading = false,
  weeks,
  firstRoundWeeks,
  organizationId,
  cupTeamCount,
  allowByeSelection = false,
  teamsForBye = [],
  onByeSelected,
  onResolvedPlan,
}) => {
  const [selectedDates, setSelectedDates] = useState<string[]>(() =>
    Array.from({ length: weeks }, () => ""),
  );
  const [seasonStartDate, setSeasonStartDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [byeTeamId, setByeTeamId] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<IdealCupDatesSuggestion | null>(null);
  const [resolvedWeeks, setResolvedWeeks] = useState(weeks);
  const [resolvedFirstRoundWeeks, setResolvedFirstRoundWeeks] = useState(
    firstRoundWeeks ?? Math.max(0, weeks - 3),
  );

  const showByeSelect = allowByeSelection && teamsForBye.length % 2 === 1;
  const activeWeeks = resolvedWeeks || weeks;
  const activeFirstRoundWeeks =
    resolvedFirstRoundWeeks || firstRoundWeeks || Math.max(0, activeWeeks - 3);

  const bekerRounds = useMemo(
    () => buildCupRoundLabels(activeFirstRoundWeeks),
    [activeFirstRoundWeeks],
  );

  const filledCount = useMemo(
    () => selectedDates.filter((d) => d !== "").length,
    [selectedDates],
  );

  useEffect(() => {
    setSelectedDates((prev) => {
      if (prev.length === activeWeeks) return prev;
      return Array.from({ length: activeWeeks }, (_, i) => prev[i] ?? "");
    });
  }, [activeWeeks]);

  useEffect(() => {
    if (!open) {
      setByeTeamId(null);
      return;
    }

    let cancelled = false;

    const loadAndSuggest = async () => {
      try {
        setLoading(true);
        const [seasonData, existingMatches] = await Promise.all([
          seasonService.getSeasonData(organizationId),
          fetchMatchesForSession({}).catch(() => []),
        ]);

        const start =
          seasonData.season_start_date ||
          (() => {
            const fallback = new Date();
            fallback.setDate(fallback.getDate() + 14);
            return fallback.toISOString().split("T")[0];
          })();
        const end =
          seasonData.season_end_date ||
          (() => {
            const d = new Date(start);
            d.setMonth(d.getMonth() + 9);
            return d.toISOString().split("T")[0];
          })();

        if (cancelled) return;
        setSeasonStartDate(start);

        const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
        const reserved = reserveCupWeeks({
          seasonStart: start,
          seasonEnd: end,
          vacations: seasonData.vacation_periods || [],
          timeslots: seasonData.venue_timeslots || [],
          slotDetails,
          blocks: filterActiveSlotUnavailability(seasonData.slot_unavailability),
          matches: (existingMatches || []).map((m: Record<string, unknown>) => ({
            match_date: m.match_date as string | undefined,
            location: m.location as string | undefined,
            match_time: m.match_time as string | undefined,
            is_cup_match: Boolean(m.is_cup_match),
            is_playoff_match: Boolean(m.is_playoff_match),
          })),
          cupTeamCount,
        });

        if (cancelled) return;

        setResolvedWeeks(reserved.requiredWeeks);
        setResolvedFirstRoundWeeks(reserved.firstRoundWeeks);
        onResolvedPlan?.({
          requiredWeeks: reserved.requiredWeeks,
          firstRoundWeeks: reserved.firstRoundWeeks,
          effectiveSlotsPerWeek: reserved.effectiveSlotsPerWeek,
        });

        const ideal: IdealCupDatesSuggestion = {
          dates: reserved.dates,
          overlappingMondays: reserved.overlappingMondays,
          freeWeeksAvailable: reserved.freeWeeksAvailable,
          daySeparation: reserved.daySeparation,
          notes: reserved.notes,
          rationale: reserved.rationale,
        };
        setSuggestion(ideal);
        if (reserved.dates.length === reserved.requiredWeeks) {
          setSelectedDates(reserved.dates);
        } else if (reserved.dates.length > 0) {
          setSelectedDates(
            Array.from({ length: reserved.requiredWeeks }, (_, i) => reserved.dates[i] ?? ""),
          );
        } else {
          setSelectedDates(Array.from({ length: reserved.requiredWeeks }, () => ""));
        }
      } catch (error) {
        console.error("❌ Error loading season/ideal cup dates:", error);
        if (!cancelled) {
          const fallback = new Date();
          fallback.setDate(fallback.getDate() + 14);
          setSeasonStartDate(fallback.toISOString().split("T")[0]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAndSuggest();
    return () => {
      cancelled = true;
    };
  }, [open, weeks, organizationId, cupTeamCount, onResolvedPlan]);

  const bekerMinimumDates = useMemo(() => {
    if (!seasonStartDate) {
      return Array.from({ length: activeWeeks }, () => "");
    }
    const seasonStart = new Date(`${toMondayIso(seasonStartDate)}T12:00:00`);
    return Array.from({ length: activeWeeks }, (_, i) => {
      const date = new Date(seasonStart);
      date.setDate(seasonStart.getDate() + i * 7);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    });
  }, [seasonStartDate, activeWeeks]);

  const applyIdealDates = useCallback(() => {
    if (suggestion?.dates?.length) {
      setSelectedDates(
        Array.from({ length: activeWeeks }, (_, i) => suggestion.dates[i] ?? ""),
      );
    }
  }, [suggestion, activeWeeks]);

  const handleBekerDateChange = useCallback((index: number, value: string) => {
    setSelectedDates((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleBekerSubmit = useCallback(() => {
    const validDates = selectedDates.filter((date) => date !== "");
    if (validDates.length === activeWeeks) {
      onDatesSelected(validDates, suggestion?.rationale);
    }
  }, [selectedDates, onDatesSelected, activeWeeks, suggestion?.rationale]);

  const handleClose = useCallback(() => {
    onByeSelected?.(null);
    onOpenChange(false);
  }, [onByeSelected, onOpenChange]);

  const isBekerSelectionValid = useMemo(
    () =>
      selectedDates.length === activeWeeks &&
      selectedDates.every((date) => date !== "") &&
      selectedDates.every(
        (date, index) => !bekerMinimumDates[index] || date >= bekerMinimumDates[index],
      ),
    [selectedDates, bekerMinimumDates, activeWeeks],
  );

  const byeRequiredButMissing = showByeSelect && !byeTeamId;
  const isBekerSubmitDisabled =
    !isBekerSelectionValid || isLoading || loading || byeRequiredButMissing;

  return (
    <AppModal
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
      title="Beker speeldata"
      size="md"
      showCloseButton
      primaryAction={{
        label: isLoading ? "Beker aanmaken…" : "Data bevestigen",
        onClick: handleBekerSubmit,
        variant: "primary",
        loading: isLoading,
        disabled: isBekerSubmitDisabled,
      }}
      secondaryAction={{
        label: "Annuleren",
        onClick: handleClose,
        variant: "secondary",
        disabled: isLoading,
      }}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-brand-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 min-w-0">
            <CalendarDays
              className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              {activeWeeks} speelweek{activeWeeks === 1 ? "" : "en"} nodig op basis van het aantal
              teams en effectieve tijdslots.
            </p>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "w-fit shrink-0 tabular-nums",
              filledCount === activeWeeks && "border-success/30 bg-success/10 text-success",
            )}
            aria-live="polite"
          >
            {filledCount}/{activeWeeks} gekozen
          </Badge>
        </div>

        {showByeSelect ? (
          <div className="space-y-1.5 rounded-lg border border-primary/20 bg-card p-3 sm:p-4">
            <Label htmlFor="beker-bye-team" className="text-sm font-medium text-brand-dark">
              Bye-team
            </Label>
            <p className="text-xs text-muted-foreground">
              Bij een oneven aantal teams stroomt één team automatisch door naar de
              volgende ronde.
            </p>
            <Select
              value={byeTeamId ? String(byeTeamId) : undefined}
              onValueChange={(val) => {
                const id = Number(val);
                setByeTeamId(id);
                onByeSelected?.(id);
              }}
            >
              <SelectTrigger id="beker-bye-team" className="min-h-[44px]">
                <SelectValue placeholder="Selecteer bye-team" />
              </SelectTrigger>
              <SelectContent>
                {teamsForBye.map((t) => (
                  <SelectItem key={t.team_id} value={String(t.team_id)}>
                    {t.team_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {loading ? (
          <BekerLoadingSkeleton />
        ) : (
          <div className="space-y-3">
            {suggestion && suggestion.rationale.length > 0 ? (
              <section
                className="rounded-lg border border-primary/20 bg-card p-3 sm:p-4 space-y-2"
                aria-labelledby="ideal-dates-rationale"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-dark shrink-0" aria-hidden />
                  <h3
                    id="ideal-dates-rationale"
                    className="text-sm font-semibold text-brand-dark"
                  >
                    Waarom deze data ideaal zijn
                  </h3>
                </div>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
                  {suggestion.rationale.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {suggestion && suggestion.notes.length > 0 ? (
              <Alert className="border-primary/20">
                <Info className="h-4 w-4" aria-hidden />
                <AlertDescription className="text-sm space-y-1">
                  {suggestion.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={applyIdealDates}
              disabled={!suggestion?.dates?.length}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              Ideale data opnieuw toepassen
            </Button>

            <div className="space-y-3">
              {bekerRounds.map((round, roundIndex) => (
                <BekerRoundComponent
                  key={`${round.name}-${roundIndex}`}
                  round={round}
                  selectedDates={selectedDates}
                  minimumDates={bekerMinimumDates}
                  onDateChange={handleBekerDateChange}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default React.memo(BekerDateSelector);
