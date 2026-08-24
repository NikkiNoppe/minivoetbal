import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout";
import { AlertCircle, CalendarRange, Info, Loader2, Save, Sparkles, Wand2, X } from "lucide-react";
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
  commitUnifiedSeasonPreview,
  createDefaultSeasonSetup,
  ensureAtLeastOneSystem,
  estimateCompetitionMatchdays,
  estimatePlayoffMatchdays,
  getSeasonPreviewSession,
  mergeSeasonSetupIntoFormats,
  normalizeSeasonSetup,
  runSeasonPreviewGeneration,
  seasonSetupToDemand,
  subscribeSeasonPreviewSession,
  type SeasonPreviewProgress,
  type SeasonSetup,
  type SeasonSetupWeekPhase,
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
    className: "bg-sky-50 text-sky-950 border-sky-300/60",
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

const WEEK_PHASE_LABELS: Record<SeasonSetupWeekPhase, string> = {
  competition: "Competitie",
  cup: "Beker",
  playoff: "Play-off",
  free: "Vrijhouden",
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
  const { isTabVisible, loading: visibilityLoading } = useTabVisibility();
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
  const previewSession = useSyncExternalStore(
    subscribeSeasonPreviewSession,
    getSeasonPreviewSession,
    getSeasonPreviewSession,
  );
  const unifiedPreview =
    organizationId != null &&
    previewSession.organizationId === organizationId
      ? previewSession.preview
      : null;
  const previewing = previewSession.loading;
  const previewError =
    organizationId != null &&
    previewSession.organizationId === organizationId
      ? previewSession.error
      : null;
  const previewProgress: SeasonPreviewProgress | null =
    previewing &&
    organizationId != null &&
    previewSession.organizationId === organizationId
      ? previewSession.progress
      : null;
  const [confirmingPreview, setConfirmingPreview] = useState(false);
  const [settingsSyncing, setSettingsSyncing] = useState(false);
  const settingsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const setupHydratedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const setupRef = useRef(setup);
  setupRef.current = setup;

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
      next = {
        ...next,
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
  }, [orgQueryEnabled, organizationId, toast]);

  useEffect(() => {
    if (visibilityLoading) return;
    void loadDefaults();
  }, [loadDefaults, visibilityLoading]);

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
    if (!orgQueryEnabled || organizationId == null) {
      const message = "Organisatie-context ontbreekt nog. Probeer opnieuw.";
      if (opts?.silent) {
        setAutoSaveStatus("error");
        setAutoSaveError(message);
      } else {
        toast({ title: "Opslaan mislukt", description: message, variant: "destructive" });
      }
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (savePromiseRef.current) {
      if (opts?.silent) return;
      setSaving(true);
      await savePromiseRef.current;
    }
    const source = opts?.nextSetup ?? setupRef.current;
    const job = (async () => {
      try {
        if (opts?.silent) {
          setAutoSaveStatus("saving");
          setAutoSaveError(null);
        } else {
          setSaving(true);
          setAutoSaveError(null);
        }
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
          setSaving(false);
          toast({
            title: "Opzet opgeslagen",
            description:
              "Speelsystemen en parameters zijn bewaard. Fase-tabbladen gebruiken deze opzet.",
          });
          const nextPlan = await buildPlanFromSetup(toSave, liveTeamCount);
          if (nextPlan) setPlan(nextPlan);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Onbekende fout";
        if (opts?.silent) {
          setAutoSaveStatus("error");
          setAutoSaveError(message);
        } else {
          toast({
            title: "Opslaan mislukt",
            description: message,
            variant: "destructive",
          });
        }
      } finally {
        if (!opts?.silent) setSaving(false);
      }
    })();
    savePromiseRef.current = job;
    try {
      await job;
    } finally {
      if (savePromiseRef.current === job) savePromiseRef.current = null;
    }
  }, [
    orgQueryEnabled,
    organizationId,
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
  const cupSlotsPerWeek = plan?.cupBracket.slotsPerWeekUsed ?? 0;
  const preferredCupWeeks = setup.cup.preferredWeeks ?? [];
  const cupWeekMode = setup.cup.weekMode ?? "auto";
  const preferredCupSet = useMemo(
    () => new Set(preferredCupWeeks.map((d) => d.slice(0, 10))),
    [preferredCupWeeks],
  );
  const playableVacationWeeks = setup.playableVacationWeeks ?? [];
  const playableVacationSet = useMemo(
    () => new Set(playableVacationWeeks.map((d) => d.slice(0, 10))),
    [playableVacationWeeks],
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

  const togglePlayableVacationWeek = useCallback(
    (weekMonday: string) => {
      const monday = weekMonday.slice(0, 10);
      const current = setup.playableVacationWeeks ?? [];
      const exists = current.some((d) => d.slice(0, 10) === monday);
      const playableVacationWeeksNext = exists
        ? current.filter((d) => d.slice(0, 10) !== monday)
        : [...current, monday].sort();

      toast({
        title: exists ? "Uitzondering verwijderd" : "Vakantieweek speelbaar",
        description: exists
          ? "Deze week is opnieuw een vakantieweek (geen wedstrijden)."
          : "Deze week telt uitzonderlijk mee als speelweek (slots openen opnieuw).",
      });

      void applySetupAndRefreshPlan({
        ...setup,
        playableVacationWeeks: playableVacationWeeksNext,
        // Bekerkeuze op een week die terug vakantie wordt, opruimen
        cup: exists
          ? {
              ...setup.cup,
              preferredWeeks: (setup.cup.preferredWeeks ?? []).filter(
                (d) => d.slice(0, 10) !== monday,
              ),
            }
          : setup.cup,
      });
    },
    [setup, applySetupAndRefreshPlan, toast],
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

  const effectiveAssignments = useMemo(() => {
    const base: Record<string, SeasonSetupWeekPhase> = {};
    if (cupWeekMode === "manual") {
      for (const d of preferredCupWeeks) base[d.slice(0, 10)] = "cup";
    }
    return { ...base, ...(setup.weekAssignments ?? {}) };
  }, [cupWeekMode, preferredCupWeeks, setup.weekAssignments]);

  const phaseNeeds = useMemo(
    () => ({
      competition: setup.systems.competition ? estimateCompetitionMatchdays(setup) : 0,
      cup: setup.systems.cup ? cupRequiredWeeks : 0,
      playoff: setup.systems.playoffs ? estimatePlayoffMatchdays(setup) : 0,
    }),
    [setup, cupRequiredWeeks],
  );

  const phaseCounts = useMemo(
    () => ({
      competition: plan?.competitionWeeks.length ?? 0,
      cup: plan?.cupDates.length ?? 0,
      playoff: plan?.playoffWeeks.length ?? 0,
    }),
    [plan],
  );

  const setWeekPhase = useCallback(
    (weekMonday: string, phase: SeasonSetupWeekPhase | null) => {
      const monday = weekMonday.slice(0, 10);
      const next: Record<string, SeasonSetupWeekPhase> = { ...effectiveAssignments };

      if (phase && phase !== "free") {
        const systemOn =
          phase === "competition"
            ? setup.systems.competition
            : phase === "cup"
              ? setup.systems.cup
              : setup.systems.playoffs;
        if (!systemOn) {
          toast({
            title: `${WEEK_PHASE_LABELS[phase]} staat uit`,
            description: `Zet ${WEEK_PHASE_LABELS[phase].toLowerCase()} aan bij Speelsystemen voor je weken toewijst.`,
            variant: "destructive",
          });
          return;
        }
        const need = phaseNeeds[phase];
        const already = phaseCounts[phase];
        const weekPlan = plan?.weeks.find((w) => w.weekMonday.slice(0, 10) === monday);
        const alreadyThisPhase =
          effectiveAssignments[monday] === phase || Boolean(weekPlan?.phases.includes(phase));
        if (need > 0 && already >= need && !alreadyThisPhase) {
          toast({
            title: `Maximum ${WEEK_PHASE_LABELS[phase].toLowerCase()}weken bereikt`,
            description: `Er staan al ${already}/${need} ${WEEK_PHASE_LABELS[phase].toLowerCase()}weken in de kalender. Zet eerst een andere week op "Vrijhouden" en kies daarna deze week.`,
            variant: "destructive",
          });
          return;
        }
      }

      if (phase === null) delete next[monday];
      else next[monday] = phase;

      const cupWeeks = Object.entries(next)
        .filter(([, value]) => value === "cup")
        .map(([m]) => m)
        .sort();

      void applySetupAndRefreshPlan({
        ...setup,
        weekAssignments: next,
        cup: {
          ...setup.cup,
          // Eenmaal handmatig blijft handmatig: bij deselecteren wordt de week
          // niet automatisch elders ingevuld — de gebruiker kiest zelf.
          weekMode:
            cupWeeks.length > 0 || cupWeekMode === "manual" ? "manual" : "auto",
          preferredWeeks: cupWeeks,
        },

      });

      toast({
        title: phase
          ? `Week op ${WEEK_PHASE_LABELS[phase].toLowerCase()} gezet`
          : "Week terug automatisch",
        description: `${formatWeekLabel(monday)}${
          phase === "free" ? " wordt vrijgehouden." : phase ? "" : " volgt opnieuw het voorstel."
        }`,
      });
    },
    [
      effectiveAssignments,
      setup,
      cupWeekMode,
      phaseNeeds,
      phaseCounts,
      plan,
      applySetupAndRefreshPlan,
      toast,
    ],

  );

  const handleUnifiedPreview = useCallback(async (opts?: {
    allowDualMatchWeek?: boolean;
  }) => {
    if (!orgQueryEnabled || organizationId == null || !seasonBounds) {
      const msg = "Seizoensperiode ontbreekt of organisatie is niet geladen.";
      toast({
        title: "Preview niet mogelijk",
        description: msg,
        variant: "destructive",
      });
      return;
    }
    if (teams.length === 0) {
      const msg = "Geen teams geladen — kan geen preview maken.";
      toast({ title: "Preview niet mogelijk", description: msg, variant: "destructive" });
      return;
    }
    const forceDual = Boolean(opts?.allowDualMatchWeek);
    try {
      const result = await runSeasonPreviewGeneration({
        organizationId,
        setup,
        seasonStart: seasonBounds.start,
        seasonEnd: seasonBounds.end,
        teams,
        plan,
        allowDualMatchWeek: forceDual,
        prepare: async () => {
          seasonService.clearSeasonDataCache(organizationId);
          const activePlan = await buildPlanFromSetup(setup, liveTeamCount);
          if (activePlan) setPlan(activePlan);
          return activePlan;
        },
      });
      if (!result) return; // vervangen door nieuwere run of unmount
      const ok = result.sections.filter((s) => s.success).length;
      const fail = result.sections.filter((s) => !s.success).length;
      const freeCount = result.rows.filter((r) => r.phase === "free").length;
      const matchCount = result.rows.length - freeCount;
      toast({
        title: forceDual
          ? matchCount > 0
            ? "Geforceerd schema klaar"
            : "Geforceerd schema zonder wedstrijden"
          : matchCount > 0
            ? "Preview klaar"
            : "Preview zonder wedstrijden",
        description: `${matchCount} wedstrijden${
          freeCount ? ` · ${freeCount} leeg` : ""
        } · ${ok} systeem(en) ok${fail ? ` · ${fail} met fout` : ""}${
          forceDual ? " · max. 2×/week" : ""
        }`,
        variant: matchCount > 0 || ok > 0 ? "default" : "destructive",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Onbekende fout";
      console.error("Unified season preview failed:", e);
      toast({
        title: "Preview mislukt",
        description: msg,
        variant: "destructive",
      });
    }
  }, [
    orgQueryEnabled,
    organizationId,
    seasonBounds,
    setup,
    liveTeamCount,
    teams,
    plan,
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

  if (!orgQueryEnabled || organizationId == null || loading || visibilityLoading) {
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
      ) : null}

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
        slotsPerWeek={plan?.cupBracket.slotsPerWeekUsed}
        teams={teams}
        allowedSystems={allowedSystems}
        availableMoments={
          plan
            ? plan.weeks.reduce((sum, week) => sum + week.configAvailableCount, 0)
            : undefined
        }
        onChange={handleSetupChange}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
        <Button
          type="button"
          className="min-h-[44px]"
          onClick={() => void handleSave()}
          disabled={saving}
          loading={saving}
        >
          <Save className="mr-2 h-4 w-4" aria-hidden />
          Opzet opslaan
        </Button>
        <p
          className={cn(
            "text-xs min-h-[20px]",
            autoSaveStatus === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {autoSaveStatus === "saving"
            ? "Automatisch opslaan…"
            : autoSaveStatus === "saved"
              ? "Automatisch bewaard"
              : autoSaveStatus === "error"
                ? `Auto-opslaan mislukt${autoSaveError ? ` — ${autoSaveError}` : ""} · gebruik de knop`
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

          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Weekstrook</CardTitle>
              <CardDescription>
                Tik op een week en kies zelf de fase: competitie, beker, play-off of
                vrijhouden. Weken zonder keuze vult de planner automatisch in. Is een fase
                al volzet, dan moet je eerst een andere week vrijzetten. Vakantieweken kun
                je in hetzelfde menu uitzonderlijk speelbaar maken.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setup.systems.cup ? (
                <div className="space-y-3 rounded-lg border border-sky-300/50 bg-sky-50/60 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-medium text-sky-950">
                      Bekerweken{" "}
                      <span className="font-normal text-muted-foreground">
                        ({preferredCupWeeks.length}
                        {cupRequiredWeeks > 0
                          ? ` gekozen · ${cupRequiredWeeks} nodig${
                              cupSlotsPerWeek > 0
                                ? ` · ~${cupSlotsPerWeek} slots/week`
                                : ""
                            }`
                          : " gekozen"})
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
                      ? "Blauwe rand = gekozen. Gestippelde rand = voorstel/mogelijkheid. Rood/gedimd = niet mogelijk (tik voor uitleg). Oranje tip = krap maar toegestaan."
                      : "Gestippelde weken zijn het automatische voorstel. Tik een week om handmatig te sturen; geblokkeerde weken geven een foutmelding."}
                  </p>
                  {cupWeekAdvice ? (
                    <p
                      className="text-sm text-sky-950"
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

              <div className="space-y-2 rounded-lg border border-sky-300/50 bg-sky-50/70 p-3">
                <p className="text-sm font-medium text-sky-950">
                  Speeluitzonderingen (vakantie)
                </p>
                <p className="text-xs text-muted-foreground">
                  Tik op een vakantieweek hieronder om die speelbaar te maken. Verwijder
                  een uitzondering hier of via de knop onder die week.
                </p>
                {playableVacationWeeks.length > 0 ? (
                  <ul className="flex flex-wrap gap-2" aria-label="Actieve speeluitzonderingen">
                    {playableVacationWeeks.map((monday) => {
                      const key = monday.slice(0, 10);
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => togglePlayableVacationWeek(key)}
                            className={cn(
                              "inline-flex items-center gap-1.5 min-h-[44px] rounded-md border px-3",
                              "border-sky-400/70 bg-card text-sky-950 text-sm",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "hover:bg-sky-100/80",
                            )}
                            aria-label={`Uitzondering ${formatWeekLabel(key)} verwijderen`}
                          >
                            <span className="tabular-nums">{formatWeekLabel(key)}</span>
                            <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nog geen uitzonderingen — vakantieweken blijven gesloten.
                  </p>
                )}
              </div>

              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {weeksToShow.map((week) => {
                  const monday = week.weekMonday.slice(0, 10);
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
                  const isVacation = week.phases.includes("vacation");
                  const isVacationException = playableVacationSet.has(monday);
                  const isCupPreferred = preferredCupSet.has(monday);
                  const isCupAssigned = week.phases.includes("cup");
                  const weekAdvice = cupWeekAdvice?.byWeek.get(monday);
                  const selectability = weekAdvice?.selectability;
                  const manualBadgePhase = effectiveAssignments[monday];

                  // One status badge max — keeps week cards same height when selected
                  const statusBadge = manualBadgePhase ? (
                    <Badge
                      variant="outline"
                      className="w-fit text-[10px] px-1.5 py-0 border-primary/60 text-primary"
                    >
                      Vast: {WEEK_PHASE_LABELS[manualBadgePhase].toLowerCase()}
                    </Badge>
                  ) : isVacationException ? (
                    <Badge
                      variant="outline"
                      className="w-fit text-[10px] px-1.5 py-0 border-sky-400/70 bg-sky-50 text-sky-950"
                    >
                      Uitzondering
                    </Badge>
                  ) : isCupPreferred || (isCupAssigned && cupWeekMode === "auto") ? (
                    <Badge
                      variant="secondary"
                      className="w-fit text-[10px] px-1.5 py-0 bg-sky-100 text-sky-950"
                    >
                      {isCupPreferred ? "Bekerkeuze" : "Beker"}
                    </Badge>
                  ) : selectability === "suggested" ? (
                    <Badge
                      variant="outline"
                      className="w-fit text-[10px] px-1.5 py-0 border-dashed border-primary/50 text-primary"
                    >
                      Voorstel
                    </Badge>
                  ) : selectability === "tight" ? (
                    <Badge
                      variant="outline"
                      className="w-fit text-[10px] px-1.5 py-0 border-orange-400/70 text-orange-950 bg-orange-50"
                    >
                      Krap
                    </Badge>
                  ) : null;

                  const content = (
                    <>
                      <span className="text-xs font-medium tabular-nums">
                        {formatWeekLabel(monday)}
                      </span>
                      <div className="flex flex-wrap items-center gap-1 min-h-[18px]">
                        {isShared ? (
                          <Badge
                            variant="outline"
                            className="w-fit text-[10px] px-1.5 py-0 border-sky-400/70 bg-sky-50 text-sky-950"
                          >
                            Gedeeld
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
                            {style.label}
                          </Badge>
                        )}
                        {statusBadge}
                      </div>
                      {week.sharedDayHint ? (
                        <span
                          className="text-[10px] leading-tight text-muted-foreground line-clamp-1"
                          title={week.sharedDayHint}
                        >
                          {week.sharedDayHint}
                        </span>
                      ) : (
                        <span className="text-[10px] leading-tight invisible" aria-hidden>
                          —
                        </span>
                      )}
                      <div
                        className="mt-auto h-1.5 rounded-full bg-black/10 overflow-hidden"
                        aria-hidden
                      >
                        <div
                          className={cn(
                            "h-full",
                            week.freeCount === week.configAvailableCount && week.configAvailableCount > 0
                              ? "bg-emerald-500"
                              : "bg-current opacity-70",
                          )}
                          style={{ width: `${capacityPct}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[10px] tabular-nums",
                          week.freeCount === week.configAvailableCount && week.configAvailableCount > 0
                            ? "font-semibold text-emerald-600"
                            : "opacity-80",
                        )}
                      >
                        {week.freeCount}/{week.configAvailableCount} vrij
                      </span>
                    </>
                  );

                  const manualPhase = effectiveAssignments[monday];
                  const isInteractive = true;

                  if (!isInteractive) {
                    return (
                      <li key={monday} className="h-full">
                        <div
                          className={cn(
                            "h-full rounded-lg border p-2 min-h-[7.5rem] flex flex-col gap-1",
                            style.className,
                            isBlocked && "opacity-60",
                          )}
                        >
                          {content}
                        </div>
                      </li>
                    );
                  }

                  const isPlayoffWeek = week.phases.includes("playoff");
                  const isSelectedVisual =
                    Boolean(manualPhase) ||
                    isCupPreferred ||
                    (isCupAssigned && cupWeekMode === "auto" && !weekAdvice?.blockReason) ||
                    isVacationException;
                  const ringClass = isVacation
                    ? "opacity-80 hover:opacity-100 border-dashed"
                    : isVacationException
                      ? "ring-2 ring-sky-500 border-sky-500"
                      : isPlayoffWeek
                        ? "ring-2 ring-emerald-500 border-emerald-500"
                        : selectability === "blocked" && !isBlocked
                          ? null
                          : selectability === "blocked"
                            ? "opacity-55"
                            : isCupPreferred && selectability === "tight"
                              ? "ring-2 ring-orange-500 border-orange-500"
                              : isSelectedVisual
                                ? "ring-2 ring-primary border-primary"
                                : selectability === "suggested"
                                  ? "border-2 border-dashed border-primary/50"
                                  : selectability === "tight"
                                    ? "ring-1 ring-orange-300/80 border-orange-300/60"
                                    : null;


                  return (
                    <li key={monday} className="h-full flex flex-col gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-label={`Week ${formatWeekLabel(monday)} — fase kiezen (competitie, beker, play-off of vrijhouden)`}
                        title={
                          isVacation
                            ? "Vakantieweek — open het menu om die toch speelbaar te maken"
                            : weekAdvice?.blockReason ??
                              weekAdvice?.warningWhileSelected ??
                              week.sharedDayHint ??
                              "Open het menu om de fase van deze week te kiezen"
                        }
                        className={cn(
                          "w-full h-full rounded-lg border p-2 min-h-[7.5rem] flex flex-col gap-1 text-left",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          "transition-shadow hover:shadow-md",
                          style.className,
                          ringClass,
                        )}
                      >
                        {content}
                      </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel className="text-xs">
                            Week {formatWeekLabel(monday)}
                            {manualPhase
                              ? ` · handmatig: ${WEEK_PHASE_LABELS[manualPhase].toLowerCase()}`
                              : " · automatisch"}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {isVacation && !isVacationException ? (
                            <DropdownMenuItem onSelect={() => togglePlayableVacationWeek(monday)}>
                              Vakantieweek toch speelbaar maken
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem
                                disabled={!setup.systems.competition}
                                onSelect={() => setWeekPhase(monday, "competition")}
                              >
                                Competitie ({phaseCounts.competition}/{phaseNeeds.competition})
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!setup.systems.cup}
                                onSelect={() => setWeekPhase(monday, "cup")}
                              >
                                Beker ({phaseCounts.cup}/{phaseNeeds.cup})
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!setup.systems.playoffs}
                                onSelect={() => setWeekPhase(monday, "playoff")}
                              >
                                Play-off ({phaseCounts.playoff}/{phaseNeeds.playoff})
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setWeekPhase(monday, "free")}>
                                Vrijhouden (geen wedstrijden)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!manualPhase}
                                onSelect={() => setWeekPhase(monday, null)}
                              >
                                Automatisch laten kiezen
                              </DropdownMenuItem>
                              {isVacationException ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => togglePlayableVacationWeek(monday)}
                                  >
                                    Vakantie-uitzondering verwijderen
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {isVacationException ? (
                        <button
                          type="button"
                          className={cn(
                            "w-full min-h-[44px] rounded-md text-[11px] px-2 inline-flex items-center justify-center gap-1",
                            "border border-sky-300/70 bg-sky-50 text-sky-950",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "hover:bg-sky-100",
                          )}
                          onClick={() => togglePlayableVacationWeek(monday)}
                          aria-label={`Uitzondering voor week ${formatWeekLabel(monday)} verwijderen`}
                        >
                          <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Uitzondering uit
                        </button>
                      ) : null}
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
          <Alert className="border-orange-400/50 bg-orange-50 text-orange-950">
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
          progress={previewProgress}
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
