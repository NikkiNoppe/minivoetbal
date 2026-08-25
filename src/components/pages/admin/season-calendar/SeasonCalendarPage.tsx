import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, CalendarRange, Info, Loader2, X } from "lucide-react";
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
  splitPlayoffGroups,
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
import SeasonStepSection from "./SeasonStepSection";
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

const WEEK_PHASE_LABELS: Record<SeasonSetupWeekPhase, string> = {
  competition: "Competitie",
  cup: "Beker",
  playoff: "Play-off",
  free: "Vrijhouden",
};

const PHASE_FILL_FRAMES: Array<{
  key: "competition" | "cup" | "playoff";
  title: string;
  unit: string;
  style: SeasonPhase;
}> = [
  { key: "competition", title: "Competitie", unit: "speeldagen", style: "competition" },
  { key: "cup", title: "Beker", unit: "speelweken", style: "cup" },
  { key: "playoff", title: "Play-offs", unit: "speeldagen", style: "playoff" },
];

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
  const refreshPlanFromSettings = useCallback(async () => {
    if (!orgQueryEnabled || organizationId == null) return;
    try {
      setSettingsSyncing(true);
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
      if (nextPlan) setPlan(nextPlan);
    } catch {
      // Auto-sync: geen toast; weekstrook blijft op laatste bekende plan.
    } finally {
      setSettingsSyncing(false);
    }
  }, [orgQueryEnabled, organizationId, setup, liveTeamCount, buildPlanFromSetup]);

  const scheduleSettingsRefresh = useCallback(() => {
    if (settingsRefreshTimerRef.current) {
      clearTimeout(settingsRefreshTimerRef.current);
    }
    settingsRefreshTimerRef.current = setTimeout(() => {
      void refreshPlanFromSettings();
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

  const handleSave = useCallback(async (opts?: { nextSetup?: SeasonSetup }) => {
    if (!orgQueryEnabled || organizationId == null) {
      setAutoSaveStatus("error");
      setAutoSaveError("Organisatie-context ontbreekt nog. Probeer opnieuw.");
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (savePromiseRef.current) return;
    const source = opts?.nextSetup ?? setupRef.current;
    const job = (async () => {
      try {
        setAutoSaveStatus("saving");
        setAutoSaveError(null);
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
        setAutoSaveStatus("saved");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Onbekende fout";
        setAutoSaveStatus("error");
        setAutoSaveError(message);
      }
    })();
    savePromiseRef.current = job;
    try {
      await job;
    } finally {
      if (savePromiseRef.current === job) savePromiseRef.current = null;
    }
  }, [orgQueryEnabled, organizationId]);

  /** Debounced auto-save na wijzigingen (incl. reeks-toewijzing). */
  const scheduleAutoSave = useCallback(
    (nextSetup: SeasonSetup) => {
      if (!setupHydratedRef.current) return;
      if (!orgQueryEnabled || organizationId == null) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus("saving");
      autoSaveTimerRef.current = setTimeout(() => {
        void handleSave({ nextSetup });
      }, 700);
    },
    [orgQueryEnabled, organizationId, handleSave],
  );

  const handleSetupChange = useCallback(
    (next: SeasonSetup) => {
      const synced: SeasonSetup = {
        ...next,
        playoffs: { ...next.playoffs, ...splitPlayoffGroups(liveTeamCount) },
      };
      setSetup(synced);
      scheduleAutoSave(synced);
    },
    [scheduleAutoSave, liveTeamCount],
  );

  const weeksToShow = useMemo(() => plan?.weeks ?? [], [plan]);
  const cupRequiredWeeks = plan?.cupBracket.requiredWeeks ?? 0;
  const preferredCupWeeks = setup.cup.preferredWeeks ?? [];
  const cupWeekMode = setup.cup.weekMode ?? "auto";
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
      const synced: SeasonSetup = {
        ...nextSetup,
        playoffs: { ...nextSetup.playoffs, ...splitPlayoffGroups(liveTeamCount) },
      };
      setSetup(synced);
      scheduleAutoSave(synced);
      if (!seasonBounds) return;
      try {
        const nextPlan = await buildPlanFromSetup(synced, liveTeamCount);
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
        onChange={handleSetupChange}
        statusFooter={
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
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
                    ? `Auto-opslaan mislukt${autoSaveError ? ` — ${autoSaveError}` : ""}`
                    : "Wijzigingen (incl. reeksen) worden automatisch bewaard"}
            </p>
            {autoSaveStatus === "error" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full sm:w-auto"
                onClick={() => void handleSave()}
              >
                Opnieuw
              </Button>
            ) : null}
          </div>
        }
      />

      <SeasonStepSection
        step={3}
        title="Kalender"
        headingId="season-calendar-section-heading"
        className="border-t border-primary/20 pt-6 mt-2"
        contentClassName="space-y-4"
      >
        {settingsSyncing ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Kalender synchroniseren met Instellingen…
          </p>
        ) : null}

      {plan ? (
        <>
          <Card className="border-primary/20 shadow-lg">
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">Weekstrook</CardTitle>
              <ul
                className="grid grid-cols-3 gap-2"
                aria-label="Ingevulde speelweken per fase"
              >
                {PHASE_FILL_FRAMES.map((frame) => {
                  const filled = phaseCounts[frame.key];
                  const need = phaseNeeds[frame.key];
                  const active = need > 0;
                  const complete = active && filled >= need;
                  const short = active && filled < need;
                  const pct = !active ? 0 : Math.min(100, Math.round((filled / Math.max(need, 1)) * 100));
                  return (
                    <li
                      key={frame.key}
                      className={cn(
                        "rounded-lg border p-2 sm:p-3 min-w-0 flex flex-col gap-1 min-h-[72px]",
                        PHASE_STYLES[frame.style].className,
                        !active && "opacity-60",
                      )}
                      aria-label={
                        active
                          ? `${frame.title}: ${filled} van ${need} ${frame.unit} ingevuld`
                          : `${frame.title}: uit`
                      }
                    >
                      <p className="text-xs font-medium leading-tight truncate">
                        {frame.title}
                      </p>
                      {active ? (
                        <>
                          <p className="text-sm sm:text-lg font-semibold tabular-nums leading-none">
                            {filled}/{need}
                          </p>
                          <p className="text-[10px] sm:text-xs leading-tight">
                            {frame.unit} ingevuld
                          </p>
                          <div
                            className="mt-auto h-1.5 rounded-full bg-black/10 overflow-hidden"
                            aria-hidden
                          >
                            <div
                              className={cn(
                                "h-full",
                                complete
                                  ? "bg-emerald-500"
                                  : short
                                    ? "bg-orange-400"
                                    : "bg-current opacity-70",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <p className="text-xs leading-tight">Uit</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <CardDescription>
                Tik op een week om de fase te kiezen. Weken zonder keuze vult de planner in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    week.totalConfiguredCount > 0
                      ? Math.round((week.freeCount / week.totalConfiguredCount) * 100)
                      : 0;
                  const isBlocked =
                    week.configAvailableCount <= 0 || week.phases.includes("blocked");
                  const isVacation = week.phases.includes("vacation");
                  const isVacationException = playableVacationSet.has(monday);
                  const weekAdvice = cupWeekAdvice?.byWeek.get(monday);

                  const content = (
                    <>
                      <span className="text-xs font-medium tabular-nums">
                        {formatWeekLabel(monday)}
                      </span>
                      <span className="text-xs font-medium opacity-90">
                        {isShared ? "Gedeeld" : style.label}
                      </span>
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
                            week.freeCount === week.totalConfiguredCount && week.totalConfiguredCount > 0
                              ? "bg-emerald-500"
                              : week.freeCount >= week.totalConfiguredCount - 1 && week.totalConfiguredCount > 0
                                ? "bg-orange-400"
                                : "bg-current opacity-70",
                          )}
                          style={{ width: `${capacityPct}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[10px] tabular-nums",
                          week.freeCount === week.totalConfiguredCount && week.totalConfiguredCount > 0
                            ? "font-semibold text-emerald-600"
                            : week.freeCount >= week.totalConfiguredCount - 1 && week.totalConfiguredCount > 0
                              ? "text-orange-600"
                              : "opacity-80",
                        )}
                      >
                        {week.freeCount}/{week.totalConfiguredCount} vrij
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

                  const ringClass = isVacation
                    ? "opacity-80 hover:opacity-100 border-dashed"
                    : isBlocked
                      ? "opacity-55"
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
                            "border border-destructive/40 bg-destructive text-destructive-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "hover:bg-destructive/90",
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
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nog geen kalender. De weekstrook verschijnt automatisch na het instellen van seizoensdata en speelsystemen.
        </p>
      )}
      </SeasonStepSection>

      <SeasonStepSection
        step={4}
        title="Preview speelmomenten"
        headingId="season-preview-section-heading"
        className="border-t border-primary/20 pt-6"
        contentClassName="space-y-4"
      >
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
      </SeasonStepSection>
    </div>
  );
};

export default React.memo(SeasonCalendarPage);
