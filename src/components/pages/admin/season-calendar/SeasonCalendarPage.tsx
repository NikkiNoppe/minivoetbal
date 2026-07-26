import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout";
import { AlertCircle, CalendarRange, Info, Loader2, Save, Sparkles, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { useOrgAwareNavigate } from "@/hooks/useOrgAwareNavigate";
import { useTabVisibility } from "@/context/TabVisibilityContext";
import { seasonService } from "@/services";
import { teamService } from "@/services/core";
import { fetchMatchesForSession } from "@/services/core/matchesSessionBulk";
import { filterActiveSlotUnavailability } from "@/services/slotUnavailabilityService";
import {
  buildSeasonPlan,
  buildSlotDetailsFromSeasonData,
  evaluateCupWeekSelection,
  pruneOrphanVacationSlotBlocks,
  type SeasonPhase,
  type SeasonPlan,
} from "@/lib/seasonCalendar";
import {
  buildUnifiedSeasonPreview,
  commitUnifiedSeasonPreview,
  createDefaultSeasonSetup,
  ensureAtLeastOneSystem,
  estimateCompetitionMatchdays,
  mergeSeasonSetupIntoFormats,
  normalizeSeasonSetup,
  seasonSetupToDemand,
  type SeasonSetup,
  type UnifiedSeasonPreview,
} from "@/lib/seasonSetup";
import { getSuperAdminTenantById } from "@/config/superAdminTenants";
import { ADMIN_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";
import {
  SEASON_DATA_CHANGED_EVENT,
  type SeasonDataChangedDetail,
} from "@/lib/seasonDataEvents";
import SeasonSetupPanel from "./SeasonSetupPanel";
import SeasonUnifiedPreviewPanel from "./SeasonUnifiedPreviewPanel";
import { useQueryClient } from "@tanstack/react-query";

const PHASE_STYLES: Record<
  SeasonPhase,
  { label: string; className: string }
> = {
  competition: {
    label: "Competitie",
    className: "bg-brand-100 text-brand-dark border-primary/30",
  },
  cup: {
    label: "Beker",
    className: "bg-amber-50 text-amber-950 border-amber-300/60",
  },
  playoff: {
    label: "Play-off",
    className: "bg-emerald-50 text-emerald-900 border-emerald-300/60",
  },
  vacation: {
    label: "Vakantie",
    className: "bg-muted text-muted-foreground border-border",
  },
  blocked: {
    label: "Geblokkeerd",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  free: {
    label: "Vrij",
    className: "bg-card text-muted-foreground border-primary/15",
  },
};

/** @deprecated Alleen voor type-compatibiliteit; hub heeft geen subtabs meer. */
export type SeasonPlanningTab = "calendar" | "competition" | "cup" | "playoffs";

interface SeasonCalendarPageProps {
  embedded?: boolean;
}

function formatWeekLabel(monday: string): string {
  return new Date(`${monday}T12:00:00`).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
  });
}

const SeasonCalendarPage: React.FC<SeasonCalendarPageProps> = ({
  embedded = false,
}) => {
  const { toast } = useToast();
  const navigate = useOrgAwareNavigate();
  const queryClient = useQueryClient();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { isTabVisible } = useTabVisibility();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setup, setSetup] = useState<SeasonSetup>(() => createDefaultSeasonSetup());
  const [liveTeamCount, setLiveTeamCount] = useState(14);
  const [teams, setTeams] = useState<Array<{ team_id: number; team_name: string }>>([]);
  const [plan, setPlan] = useState<SeasonPlan | null>(null);
  const [seasonBounds, setSeasonBounds] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [unifiedPreview, setUnifiedPreview] = useState<UnifiedSeasonPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmingPreview, setConfirmingPreview] = useState(false);
  const [settingsSyncing, setSettingsSyncing] = useState(false);
  const settingsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const setupHydratedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowedSystems = useMemo(
    () => ({
      competition: isTabVisible("format-competition"),
      cup: isTabVisible("format-cup"),
      playoffs: isTabVisible("format-playoffs"),
    }),
    [isTabVisible],
  );

  const buildPlanFromSetup = useCallback(
    async (nextSetup: SeasonSetup, teamsCount: number) => {
      if (!orgQueryEnabled || organizationId == null || !seasonBounds) return null;
      const [seasonData, matches] = await Promise.all([
        seasonService.getSeasonData(organizationId),
        fetchMatchesForSession({}).catch(() => []),
      ]);
      const vacations = seasonData.vacation_periods || [];
      const pruned = pruneOrphanVacationSlotBlocks(
        seasonData.slot_unavailability || [],
        vacations,
      );
      if (pruned.removed.length > 0) {
        await seasonService.saveSeasonData(
          { ...seasonData, slot_unavailability: pruned.blocks },
          organizationId,
        );
      }
      const demand = seasonSetupToDemand(nextSetup, teamsCount);
      const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
      return buildSeasonPlan({
        seasonStart: seasonBounds.start,
        seasonEnd: seasonBounds.end,
        vacations,
        timeslots: seasonData.venue_timeslots || [],
        slotDetails,
        blocks: filterActiveSlotUnavailability(pruned.blocks),
        matches: matches.map((m: Record<string, unknown>) => ({
          match_date: m.match_date as string | undefined,
          location: m.location as string | undefined,
          match_time: m.match_time as string | undefined,
          is_cup_match: Boolean(m.is_cup_match),
          is_playoff_match: Boolean(m.is_playoff_match),
        })),
        ...demand,
      });
    },
    [orgQueryEnabled, organizationId, seasonBounds],
  );

  const loadDefaults = useCallback(async () => {
    if (!orgQueryEnabled || organizationId == null) return;
    try {
      setLoading(true);
      const [seasonData, teams] = await Promise.all([
        seasonService.getSeasonData(organizationId),
        teamService.getAllTeams().catch(() => []),
      ]);
      const start = seasonData.season_start_date || "";
      const end = seasonData.season_end_date || "";
      const bounds = start && end ? { start, end } : null;
      setSeasonBounds(bounds);

      const n = teams.length || 14;
      setLiveTeamCount(n);
      setTeams(
        teams.map((t: { team_id: number; team_name: string }) => ({
          team_id: t.team_id,
          team_name: t.team_name,
        })),
      );

      let next = normalizeSeasonSetup(seasonData.season_setup, n);
      // Respect visibility: zet niet-zichtbare systemen uit
      next = {
        ...next,
        systems: {
          competition: next.systems.competition && isTabVisible("format-competition"),
          cup: next.systems.cup && isTabVisible("format-cup"),
          playoffs: next.systems.playoffs && isTabVisible("format-playoffs"),
        },
        cup: {
          ...next.cup,
          teamCount: next.cup.useAllTeams ? n : next.cup.teamCount,
        },
        competition: {
          ...next.competition,
          estimatedTeamCount: next.competition.estimatedTeamCount || n,
        },
      };
      next = ensureAtLeastOneSystem(next);
      // Als visibility alles uitzet: zet eerste zichtbare systeem aan
      if (
        !next.systems.competition &&
        !next.systems.cup &&
        !next.systems.playoffs
      ) {
        next = {
          ...next,
          systems: {
            competition: isTabVisible("format-competition"),
            cup: isTabVisible("format-cup") && !isTabVisible("format-competition"),
            playoffs:
              isTabVisible("format-playoffs") &&
              !isTabVisible("format-competition") &&
              !isTabVisible("format-cup"),
          },
        };
        next = ensureAtLeastOneSystem(next);
      }
      setSetup(next);
      // Laat eerste paint klaar zijn vóór auto-save aan gaat
      queueMicrotask(() => {
        setupHydratedRef.current = true;
      });

      if (bounds) {
        const vacations = seasonData.vacation_periods || [];
        const pruned = pruneOrphanVacationSlotBlocks(
          seasonData.slot_unavailability || [],
          vacations,
        );
        if (pruned.removed.length > 0) {
          await seasonService.saveSeasonData(
            { ...seasonData, slot_unavailability: pruned.blocks },
            organizationId,
          );
        }
        const demand = seasonSetupToDemand(next, n);
        const matches = await fetchMatchesForSession({}).catch(() => []);
        const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
        setPlan(
          buildSeasonPlan({
            seasonStart: bounds.start,
            seasonEnd: bounds.end,
            vacations,
            timeslots: seasonData.venue_timeslots || [],
            slotDetails,
            blocks: filterActiveSlotUnavailability(pruned.blocks),
            matches: matches.map((m: Record<string, unknown>) => ({
              match_date: m.match_date as string | undefined,
              location: m.location as string | undefined,
              match_time: m.match_time as string | undefined,
              is_cup_match: Boolean(m.is_cup_match),
              is_playoff_match: Boolean(m.is_playoff_match),
            })),
            ...demand,
          }),
        );
      }
    } catch (e) {
      toast({
        title: "Laden mislukt",
        description: e instanceof Error ? e.message : "Kon seizoensdata niet laden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [orgQueryEnabled, organizationId, toast, isTabVisible]);

  useEffect(() => {
    void loadDefaults();
  }, [loadDefaults]);

  /** Herbouw kalender uit verse Instellingen (vakanties, veldblokkades, seizoensdata). */
  const refreshPlanFromSettings = useCallback(
    async (opts?: { silent?: boolean; toastOnDone?: boolean }) => {
      if (!orgQueryEnabled || organizationId == null) return;
      const silent = opts?.silent ?? true;
      try {
        if (silent) setSettingsSyncing(true);
        else setGenerating(true);

        seasonService.clearSeasonDataCache(organizationId);
        const seasonData = await seasonService.getSeasonData(organizationId);
        const start = seasonData.season_start_date || "";
        const end = seasonData.season_end_date || "";
        const bounds = start && end ? { start, end } : null;
        setSeasonBounds(bounds);

        if (!bounds) {
          setPlan(null);
          return;
        }

        const nextPlan = await buildPlanFromSetup(setup, liveTeamCount);
        if (nextPlan) {
          setPlan(nextPlan);
          if (opts?.toastOnDone) {
            toast({
              title: "Kalender bijgewerkt",
              description: `Op basis van Instellingen · ${nextPlan.efficiency.usableWeeks} bruikbare weken`,
            });
          }
        }
      } catch (e) {
        if (!silent || opts?.toastOnDone) {
          toast({
            title: "Kalender vernieuwen mislukt",
            description: e instanceof Error ? e.message : "Onbekende fout",
            variant: "destructive",
          });
        }
      } finally {
        if (silent) setSettingsSyncing(false);
        else setGenerating(false);
      }
    },
    [
      orgQueryEnabled,
      organizationId,
      setup,
      liveTeamCount,
      buildPlanFromSetup,
      toast,
    ],
  );

  const scheduleSettingsRefresh = useCallback(() => {
    if (settingsRefreshTimerRef.current) {
      clearTimeout(settingsRefreshTimerRef.current);
    }
    settingsRefreshTimerRef.current = setTimeout(() => {
      void refreshPlanFromSettings({ silent: true });
    }, 300);
  }, [refreshPlanFromSettings]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleSettingsRefresh();
    };
    const onFocus = () => scheduleSettingsRefresh();
    const onSeasonData = (event: Event) => {
      const detail = (event as CustomEvent<SeasonDataChangedDetail>).detail;
      if (
        detail?.organizationId != null &&
        organizationId != null &&
        detail.organizationId !== organizationId
      ) {
        return;
      }
      scheduleSettingsRefresh();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener(SEASON_DATA_CHANGED_EVENT, onSeasonData);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(SEASON_DATA_CHANGED_EVENT, onSeasonData);
      if (settingsRefreshTimerRef.current) {
        clearTimeout(settingsRefreshTimerRef.current);
      }
    };
  }, [scheduleSettingsRefresh, organizationId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    await refreshPlanFromSettings({ silent: false, toastOnDone: true });
  }, [refreshPlanFromSettings]);

  const handleSave = useCallback(async (opts?: { silent?: boolean; nextSetup?: SeasonSetup }) => {
    if (!orgQueryEnabled || organizationId == null) return;
    const source = opts?.nextSetup ?? setup;
    try {
      if (opts?.silent) setAutoSaveStatus("saving");
      else setSaving(true);
      const toSave = ensureAtLeastOneSystem({
        ...source,
        updatedAt: new Date().toISOString(),
      });
      const seasonData = await seasonService.getSeasonData(organizationId);
      const formats = mergeSeasonSetupIntoFormats(
        seasonData.competition_formats || [],
        toSave,
      );
      const result = await seasonService.saveSeasonData(
        {
          ...seasonData,
          season_setup: toSave,
          competition_formats: formats,
        },
        organizationId,
      );
      if (!result.success) {
        throw new Error(result.message);
      }
      setSetup(toSave);
      if (opts?.silent) {
        setAutoSaveStatus("saved");
      } else {
        toast({
          title: "Opzet opgeslagen",
          description:
            "Speelsystemen en parameters zijn bewaard. Fase-tabbladen gebruiken deze opzet.",
        });
        const nextPlan = await buildPlanFromSetup(toSave, liveTeamCount);
        if (nextPlan) setPlan(nextPlan);
      }
    } catch (e) {
      if (opts?.silent) {
        setAutoSaveStatus("error");
      } else {
        toast({
          title: "Opslaan mislukt",
          description: e instanceof Error ? e.message : "Onbekende fout",
          variant: "destructive",
        });
      }
    } finally {
      if (!opts?.silent) setSaving(false);
    }
  }, [
    orgQueryEnabled,
    organizationId,
    setup,
    liveTeamCount,
    buildPlanFromSetup,
    toast,
  ]);

  /** Debounced auto-save na wijzigingen (incl. reeks-toewijzing). */
  const scheduleAutoSave = useCallback(
    (nextSetup: SeasonSetup) => {
      if (!setupHydratedRef.current) return;
      if (!orgQueryEnabled || organizationId == null) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus("saving");
      autoSaveTimerRef.current = setTimeout(() => {
        void handleSave({ silent: true, nextSetup });
      }, 700);
    },
    [orgQueryEnabled, organizationId, handleSave],
  );

  const handleSetupChange = useCallback(
    (next: SeasonSetup) => {
      setSetup(next);
      scheduleAutoSave(next);
    },
    [scheduleAutoSave],
  );

  const weeksToShow = useMemo(() => plan?.weeks ?? [], [plan]);
  const cupRequiredWeeks = plan?.cupBracket.requiredWeeks ?? 0;
  const preferredCupWeeks = setup.cup.preferredWeeks ?? [];
  const cupWeekMode = setup.cup.weekMode ?? "auto";
  const preferredCupSet = useMemo(
    () => new Set(preferredCupWeeks),
    [preferredCupWeeks],
  );

  const cupWeekAdvice = useMemo(() => {
    if (!plan || !setup.systems.cup) return null;
    const pairs = plan.cupBracket.firstRoundPairs;
    const firstWeeks = Math.max(1, plan.cupBracket.firstRoundWeeks);
    const minComfortableSlots = Math.max(
      1,
      Math.min(
        plan.cupBracket.slotsPerWeekUsed || 4,
        Math.ceil(pairs / firstWeeks) || 4,
      ),
    );
    return evaluateCupWeekSelection({
      weeks: plan.weeks,
      preferredMondays: preferredCupWeeks,
      suggestedMondays: plan.cupDates,
      requiredWeeks: cupRequiredWeeks,
      minComfortableSlots,
      daySeparation: plan.daySeparation,
    });
  }, [plan, setup.systems.cup, preferredCupWeeks, cupRequiredWeeks]);

  const competitionCapacityWarning = useMemo(() => {
    if (!plan || !setup.systems.competition) return null;
    const needed = estimateCompetitionMatchdays(setup);
    const available = plan.competitionWeeks.length;
    if (needed <= 0 || available >= needed) return null;
    return {
      needed,
      available,
      shortfall: needed - available,
    };
  }, [plan, setup]);

  const applySetupAndRefreshPlan = useCallback(
    async (nextSetup: SeasonSetup) => {
      setSetup(nextSetup);
      scheduleAutoSave(nextSetup);
      if (!seasonBounds) return;
      try {
        const nextPlan = await buildPlanFromSetup(nextSetup, liveTeamCount);
        if (nextPlan) setPlan(nextPlan);
      } catch {
        // stil: UI blijft op vorige plan
      }
    },
    [seasonBounds, buildPlanFromSetup, liveTeamCount, scheduleAutoSave],
  );

  const toggleCupWeek = useCallback(
    (weekMonday: string) => {
      if (!setup.systems.cup) return;
      const advice = cupWeekAdvice?.byWeek.get(weekMonday.slice(0, 10));
      const current = setup.cup.preferredWeeks ?? [];
      const exists = current.includes(weekMonday);

      if (!exists && advice?.blockReason) {
        toast({
          title: "Week niet mogelijk voor beker",
          description: advice.blockReason,
          variant: "destructive",
        });
        return;
      }

      if (!exists && advice?.warningOnSelect) {
        toast({
          title: "Let op bij deze bekerweek",
          description: advice.warningOnSelect,
        });
      }

      if (
        !exists &&
        cupRequiredWeeks > 0 &&
        current.length >= cupRequiredWeeks
      ) {
        toast({
          title: "Extra bekerweek",
          description: `Je hebt al ${current.length}/${cupRequiredWeeks} weken. Extra keuzes mag — de planner spreidt ${cupRequiredWeeks} weken uit je selectie.`,
        });
      }

      const preferredWeeks = exists
        ? current.filter((d) => d !== weekMonday)
        : [...current, weekMonday].sort();
      void applySetupAndRefreshPlan({
        ...setup,
        cup: {
          ...setup.cup,
          weekMode: "manual",
          preferredWeeks,
        },
      });
    },
    [
      setup,
      applySetupAndRefreshPlan,
      cupWeekAdvice,
      cupRequiredWeeks,
      toast,
    ],
  );

  const setCupWeekMode = useCallback(
    (weekMode: "auto" | "manual") => {
      void applySetupAndRefreshPlan({
        ...setup,
        cup: {
          ...setup.cup,
          weekMode,
          preferredWeeks:
            weekMode === "auto"
              ? setup.cup.preferredWeeks ?? []
              : setup.cup.preferredWeeks?.length
                ? setup.cup.preferredWeeks
                : plan?.cupDates ?? [],
        },
      });
    },
    [setup, plan?.cupDates, applySetupAndRefreshPlan],
  );

  const seedCupWeeksFromPlan = useCallback(() => {
    if (!plan?.cupDates.length) return;
    void applySetupAndRefreshPlan({
      ...setup,
      cup: {
        ...setup.cup,
        weekMode: "manual",
        preferredWeeks: [...plan.cupDates].sort(),
      },
    });
  }, [setup, plan?.cupDates, applySetupAndRefreshPlan]);

  const clearCupWeekSelection = useCallback(() => {
    void applySetupAndRefreshPlan({
      ...setup,
      cup: {
        ...setup.cup,
        weekMode: "auto",
        preferredWeeks: [],
      },
    });
  }, [setup, applySetupAndRefreshPlan]);

  const handleUnifiedPreview = useCallback(async () => {
    if (!orgQueryEnabled || organizationId == null || !seasonBounds) {
      const msg = "Seizoensperiode ontbreekt of organisatie is niet geladen.";
      setPreviewError(msg);
      toast({
        title: "Preview niet mogelijk",
        description: msg,
        variant: "destructive",
      });
      return;
    }
    if (teams.length === 0) {
      const msg = "Geen teams geladen — kan geen preview maken.";
      setPreviewError(msg);
      toast({ title: "Preview niet mogelijk", description: msg, variant: "destructive" });
      return;
    }
    try {
      setPreviewing(true);
      setPreviewError(null);
      setUnifiedPreview(null);
      let activePlan = plan;
      if (!activePlan) {
        activePlan = await buildPlanFromSetup(setup, liveTeamCount);
        if (activePlan) setPlan(activePlan);
      }
      const result = await buildUnifiedSeasonPreview({
        setup,
        seasonStart: seasonBounds.start,
        seasonEnd: seasonBounds.end,
        organizationId,
        teams,
        plan: activePlan,
      });
      setUnifiedPreview(result);
      const ok = result.sections.filter((s) => s.success).length;
      const fail = result.sections.filter((s) => !s.success).length;
      const freeCount = result.rows.filter((r) => r.phase === "free").length;
      const matchCount = result.rows.length - freeCount;
      toast({
        title: matchCount > 0 ? "Preview klaar" : "Preview zonder wedstrijden",
        description: `${matchCount} wedstrijden${
          freeCount ? ` · ${freeCount} leeg` : ""
        } · ${ok} systeem(en) ok${fail ? ` · ${fail} met fout` : ""}`,
        variant: matchCount > 0 || ok > 0 ? "default" : "destructive",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Onbekende fout";
      console.error("Unified season preview failed:", e);
      setPreviewError(msg);
      setUnifiedPreview(null);
      toast({
        title: "Preview mislukt",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  }, [
    orgQueryEnabled,
    organizationId,
    seasonBounds,
    plan,
    setup,
    liveTeamCount,
    teams,
    buildPlanFromSetup,
    toast,
  ]);

  const handleConfirmUnifiedPreview = useCallback(async () => {
    const payload = unifiedPreview?.commit;
    if (!payload) {
      toast({
        title: "Niets om op te slaan",
        description: "Genereer eerst een geslaagde preview.",
        variant: "destructive",
      });
      return;
    }
    if (organizationId == null || payload.organizationId !== organizationId) {
      const expected = getSuperAdminTenantById(organizationId ?? -1)?.name;
      toast({
        title: "Organisatie komt niet overeen",
        description: expected
          ? `Preview hoort bij een andere organisatie dan de actieve site (${expected}, id ${organizationId}). Vernieuw de preview.`
          : "Preview en actieve organisatie komen niet overeen. Vernieuw de preview.",
        variant: "destructive",
      });
      return;
    }

    try {
      setConfirmingPreview(true);
      const result = await commitUnifiedSeasonPreview(payload);
      if (!result.success) {
        toast({
          title: "Opslaan mislukt",
          description: result.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Seizoensplanning opgeslagen",
        description: result.message,
      });
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return (
            key === "matches" ||
            key === "competition" ||
            key === "cup" ||
            key === "playoffs" ||
            key === "public-matches"
          );
        },
      });
      // Preview blijft staan als referentie; commit is gedaan
    } catch (e) {
      toast({
        title: "Opslaan mislukt",
        description: e instanceof Error ? e.message : "Onbekende fout",
        variant: "destructive",
      });
    } finally {
      setConfirmingPreview(false);
    }
  }, [unifiedPreview, organizationId, toast, queryClient]);

  if (!orgQueryEnabled || organizationId == null || loading) {
    return (
      <div className="flex justify-center items-center py-8" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Laden…</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 sm:space-y-6 pb-6", !embedded && "animate-slide-up")}>
      {!embedded ? (
        <PageHeader
          title="Seizoensopzet"
          subtitle="Kies speelsystemen, configureer rondes en bekijk de kalender"
          icon={CalendarRange}
        />
      ) : (
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-brand-dark">Seizoensopzet</h2>
          <p className="text-sm text-muted-foreground">
            Meerdere systemen tegelijk · kalender volgt uit jouw keuzes
          </p>
        </div>
      )}

      {!seasonBounds ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Stel eerst seizoensstart en -eind in via{" "}
            <button
              type="button"
              className="underline font-medium text-brand-dark min-h-[44px]"
              onClick={() => navigate(ADMIN_ROUTES.settings)}
            >
              Instellingen
            </button>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <SeasonSetupPanel
        setup={setup}
        liveTeamCount={liveTeamCount}
        teams={teams}
        allowedSystems={allowedSystems}
        onChange={handleSetupChange}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
        <Button
          type="button"
          className="min-h-[44px]"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Opslaan…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" aria-hidden />
              Opzet opslaan
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground min-h-[20px]" aria-live="polite">
          {autoSaveStatus === "saving"
            ? "Automatisch opslaan…"
            : autoSaveStatus === "saved"
              ? "Automatisch bewaard"
              : autoSaveStatus === "error"
                ? "Auto-opslaan mislukt — gebruik de knop"
                : "Wijzigingen (incl. reeksen) worden automatisch bewaard"}
        </p>
      </div>

      <section
        className="space-y-4 border-t border-primary/20 pt-6 mt-2"
        aria-labelledby="season-calendar-section-heading"
      >
        <div className="space-y-1 border-b border-primary/15 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stap 3
          </p>
          <h3
            id="season-calendar-section-heading"
            className="text-base font-semibold text-brand-dark"
          >
            Kalender
          </h3>
          <p className="text-sm text-muted-foreground">
            Volgt Instellingen (vakanties, veld niet beschikbaar, seizoensperiode). Wordt
            automatisch bijgewerkt als je terugkomt van Instellingen — of via vernieuwen.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] w-full sm:w-auto"
            onClick={handleGenerate}
            disabled={generating || settingsSyncing || !seasonBounds}
          >
            {generating || settingsSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {settingsSyncing ? "Instellingen laden…" : "Genereren…"}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Kalender vernieuwen
              </>
            )}
          </Button>
          {settingsSyncing ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Kalender synchroniseren met Instellingen…
            </p>
          ) : null}
        </div>

      {plan ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-primary/20">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Bruikbare weken</p>
                <p className="text-xl font-semibold text-brand-dark tabular-nums">
                  {plan.efficiency.usableWeeks}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{plan.efficiency.playableWeeks}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Benutting</p>
                <p className="text-xl font-semibold text-brand-dark tabular-nums">
                  {Math.round(plan.efficiency.utilization * 100)}%
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Bekerweken</p>
                <p className="text-xl font-semibold text-brand-dark tabular-nums">
                  {plan.cupDates.length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Gedeeld (dagen)</p>
                <p className="text-xl font-semibold text-brand-dark tabular-nums">
                  {plan.efficiency.sharedWeeks}
                </p>
              </CardContent>
            </Card>
          </div>

          {plan.efficiency.sharedWeeks > 0 ? (
            <Alert className="border-amber-400/40 bg-amber-50/80 text-amber-950">
              <Info className="h-4 w-4" aria-hidden />
              <AlertDescription className="text-sm">
                Speelweken-tekort: {plan.efficiency.sharedWeeks} week(en) worden gedeeld.
                Beker bij voorkeur op{" "}
                <span className="font-medium">{plan.daySeparation.earlyLabel}</span>, competitie
                op <span className="font-medium">{plan.daySeparation.lateLabel}</span>.
                Standaard speelt een ploeg max. 1× per week; uitzonderlijk mag beker + competitie
                als er ≥3 dagen tussen zitten. Bij genoeg weken blijft alles exclusief.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Weekstrook</CardTitle>
              <CardDescription>
                {setup.systems.cup
                  ? "Tik op weken voor beker. Bij speelweken-tekort mogen beker en competitie dezelfde week delen op verschillende speeldagen; anders blijven ze exclusief."
                  : "Effectieve capaciteit per week op basis van de gekozen speelsystemen."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setup.systems.cup ? (
                <div className="space-y-3 rounded-lg border border-amber-300/50 bg-amber-50/60 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-medium text-amber-950">
                      Bekerweken{" "}
                      <span className="font-normal text-muted-foreground">
                        ({preferredCupWeeks.length}
                        {cupRequiredWeeks > 0 ? ` gekozen · ${cupRequiredWeeks} nodig` : " gekozen"})
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={cupWeekMode === "auto" ? "default" : "outline"}
                        className="min-h-[44px]"
                        onClick={() => setCupWeekMode("auto")}
                      >
                        Automatisch
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={cupWeekMode === "manual" ? "default" : "outline"}
                        className="min-h-[44px]"
                        onClick={() => setCupWeekMode("manual")}
                      >
                        Handmatig
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cupWeekMode === "manual"
                      ? "Gele rand = gekozen. Gestippelde rand = voorstel/mogelijkheid. Rood/gedimd = niet mogelijk (tik voor uitleg). Oranje tip = krap maar toegestaan."
                      : "Gestippelde weken zijn het automatische voorstel. Tik een week om handmatig te sturen; geblokkeerde weken geven een foutmelding."}
                  </p>
                  {cupWeekAdvice ? (
                    <p
                      className="text-sm text-amber-950"
                      role="status"
                      aria-live="polite"
                    >
                      {cupWeekAdvice.statusLine}
                    </p>
                  ) : null}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={seedCupWeeksFromPlan}
                      disabled={!plan?.cupDates.length}
                    >
                      <Wand2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                      Voorstel vastzetten
                    </Button>
                    {cupWeekAdvice && cupWeekAdvice.suggestionMondays.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-h-[44px]"
                        onClick={() => {
                          const need = Math.max(
                            0,
                            cupRequiredWeeks - preferredCupWeeks.length,
                          );
                          if (need <= 0) {
                            toast({
                              title: "Genoeg bekerweken",
                              description: `Je hebt al ${preferredCupWeeks.length}/${cupRequiredWeeks} gekozen.`,
                            });
                            return;
                          }
                          const add = cupWeekAdvice.suggestionMondays.slice(0, need);
                          void applySetupAndRefreshPlan({
                            ...setup,
                            cup: {
                              ...setup.cup,
                              weekMode: "manual",
                              preferredWeeks: [...preferredCupWeeks, ...add].sort(),
                            },
                          });
                          toast({
                            title: "Suggesties toegevoegd",
                            description: `${add.length} week(en) uit het voorstel toegevoegd.`,
                          });
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                        Vul met suggesties
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px]"
                      onClick={clearCupWeekSelection}
                      disabled={preferredCupWeeks.length === 0 && cupWeekMode === "auto"}
                    >
                      Selectie wissen
                    </Button>
                  </div>
                </div>
              ) : null}

              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {weeksToShow.map((week) => {
                  const isShared =
                    week.phases.includes("cup") && week.phases.includes("competition");
                  const primary = isShared
                    ? "cup"
                    : (week.phases[0] ?? "free");
                  const style = PHASE_STYLES[primary];
                  const capacityPct =
                    week.configAvailableCount > 0
                      ? Math.round((week.freeCount / week.configAvailableCount) * 100)
                      : 0;
                  const isBlocked =
                    week.configAvailableCount <= 0 || week.phases.includes("blocked");
                  const isCupPreferred = preferredCupSet.has(week.weekMonday);
                  const isCupAssigned = week.phases.includes("cup");
                  const weekAdvice = cupWeekAdvice?.byWeek.get(week.weekMonday);
                  const selectability = weekAdvice?.selectability;
                  const cupInteractive = Boolean(setup.systems.cup);

                  const content = (
                    <>
                      <span className="text-xs font-medium tabular-nums">
                        {formatWeekLabel(week.weekMonday)}
                      </span>
                      {isShared ? (
                        <Badge
                          variant="outline"
                          className="w-fit text-[10px] px-1.5 py-0 border-amber-400/70 bg-amber-50 text-amber-950"
                        >
                          Gedeeld
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
                          {style.label}
                        </Badge>
                      )}
                      {week.sharedDayHint ? (
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {week.sharedDayHint}
                        </span>
                      ) : null}
                      {selectability === "suggested" ? (
                        <Badge
                          variant="outline"
                          className="w-fit text-[10px] px-1.5 py-0 border-dashed border-primary/50 text-primary"
                        >
                          Voorstel
                        </Badge>
                      ) : null}
                      {isCupPreferred || (isCupAssigned && cupWeekMode === "auto") ? (
                        <Badge
                          variant="secondary"
                          className="w-fit text-[10px] px-1.5 py-0 bg-amber-100 text-amber-950"
                        >
                          {isCupPreferred ? "Bekerkeuze" : "Beker"}
                        </Badge>
                      ) : null}
                      {selectability === "tight" ? (
                        <Badge
                          variant="outline"
                          className="w-fit text-[10px] px-1.5 py-0 border-orange-400/70 text-orange-950 bg-orange-50"
                        >
                          Krap
                        </Badge>
                      ) : null}
                      <div
                        className="mt-auto h-1.5 rounded-full bg-black/10 overflow-hidden"
                        aria-hidden
                      >
                        <div
                          className="h-full bg-current opacity-70"
                          style={{ width: `${capacityPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums opacity-80">
                        {week.freeCount}/{week.configAvailableCount} vrij
                      </span>
                    </>
                  );

                  if (!cupInteractive) {
                    return (
                      <li key={week.weekMonday}>
                        <div
                          className={cn(
                            "rounded-lg border p-2 min-h-[72px] flex flex-col gap-1",
                            style.className,
                            isBlocked && "opacity-60",
                          )}
                        >
                          {content}
                        </div>
                      </li>
                    );
                  }

                  const isSelectedVisual =
                    isCupPreferred ||
                    (isCupAssigned && cupWeekMode === "auto" && !weekAdvice?.blockReason);
                  const ringClass =
                    selectability === "blocked"
                      ? "opacity-55"
                      : isCupPreferred && selectability === "tight"
                        ? "ring-2 ring-orange-500 border-orange-500"
                        : isSelectedVisual
                          ? "ring-2 ring-amber-500 border-amber-500"
                          : selectability === "suggested"
                            ? "border-2 border-dashed border-primary/50"
                            : selectability === "tight"
                              ? "ring-1 ring-orange-300/80 border-orange-300/60"
                              : null;

                  return (
                    <li key={week.weekMonday}>
                      <button
                        type="button"
                        onClick={() => toggleCupWeek(week.weekMonday)}
                        aria-pressed={isCupPreferred || isCupAssigned}
                        aria-disabled={selectability === "blocked" && !isCupPreferred}
                        aria-label={
                          selectability === "blocked" && !isCupPreferred
                            ? `Week ${formatWeekLabel(week.weekMonday)} niet beschikbaar voor beker`
                            : `Week ${formatWeekLabel(week.weekMonday)} ${
                                isCupPreferred
                                  ? "als bekerweek demarkeren"
                                  : "als bekerweek markeren"
                              }`
                        }
                        title={
                          weekAdvice?.blockReason ??
                          weekAdvice?.warningWhileSelected ??
                          weekAdvice?.warningOnSelect ??
                          undefined
                        }
                        className={cn(
                          "w-full rounded-lg border p-2 min-h-[72px] flex flex-col gap-1 text-left",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          "transition-shadow hover:shadow-md",
                          style.className,
                          ringClass,
                        )}
                      >
                        {content}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {(plan.rationale.length > 0 || plan.notes.length > 0) && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-base">Waarom dit plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.rationale.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {plan.rationale.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {plan.notes.length > 0 ? (
                  <Alert className="border-primary/20">
                    <Info className="h-4 w-4" aria-hidden />
                    <AlertDescription className="text-sm space-y-1">
                      {plan.notes.map((n) => (
                        <p key={n}>{n}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nog geen kalender — klik op &quot;Kalender vernieuwen&quot; na het kiezen van speelsystemen.
        </p>
      )}
      </section>

      <section
        className="space-y-4 border-t border-primary/20 pt-6"
        aria-labelledby="season-preview-section-heading"
      >
        <div className="space-y-1 border-b border-primary/15 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stap 4
          </p>
          <h3
            id="season-preview-section-heading"
            className="text-base font-semibold text-brand-dark"
          >
            Preview speelmomenten
          </h3>
          <p className="text-sm text-muted-foreground">
            Genereer de concrete wedstrijden, controleer ze, en bevestig om ze in de database op te
            slaan (beker → competitie → play-offs).
          </p>
        </div>

        {competitionCapacityWarning ? (
          <Alert className="border-amber-400/50 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Capaciteit competitie</AlertTitle>
            <AlertDescription className="text-sm space-y-1">
              <p>
                Er zijn ~{competitionCapacityWarning.needed} competitie-speeldagen nodig, maar de
                kalender reserveert nu {competitionCapacityWarning.available} competitieweken (
                {competitionCapacityWarning.shortfall} tekort).
              </p>
              <p>
                Tip: minder rondes, langere seizoensperiode, of minder/andere bekerweken zodat er meer
                ruimte voor competitie overblijft.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <SeasonUnifiedPreviewPanel
          preview={unifiedPreview}
          loading={previewing}
          error={previewError}
          onGenerate={handleUnifiedPreview}
          onConfirm={handleConfirmUnifiedPreview}
          confirming={confirmingPreview}
          disabled={!seasonBounds || teams.length === 0}
        />
      </section>
    </div>
  );
};

export default React.memo(SeasonCalendarPage);
