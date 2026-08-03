import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Lock,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSeasonDataScope } from "@/hooks/useSeasonDataScope";
import { cn } from "@/lib/utils";
import { PUBLIC_CARD_CLASS, SectionIcon } from "@/components/layout";
import {
  buildSuggestedSeasonLockPeriod,
  getPlayerListLockScheduleStatus,
  nextEmptyLockPeriod,
  normalizePlayerListLockPeriods,
  PLAYER_LIST_LOCK_STATUS_LABELS,
  toPlayerListLockSettingValue,
  validatePlayerListLockPeriods,
  type PlayerListLockPeriod,
  type PlayerListLockScheduleStatus,
  type PlayerListLockSettingValue,
} from "@/lib/playerListLockUtils";
import {
  insertApplicationSettingForSession,
  listApplicationSettingsForSession,
  updateApplicationSettingForSession,
} from "@/services/core/applicationSettingsSessionFetch";

interface LockSettings {
  id: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS_BADGE_CLASS: Record<PlayerListLockScheduleStatus, string> = {
  inactive: "bg-muted text-muted-foreground",
  scheduled: "border-primary/30 bg-primary/5 text-primary",
  active: "bg-destructive/10 text-destructive border-destructive/20",
  expired: "bg-muted text-muted-foreground",
};

function periodHint(index: number, total: number): string {
  if (total <= 1) return "Seizoen";
  if (index === 0) return "Regulier seizoen";
  if (index === total - 1) return "Play-offs";
  return `Periode ${index + 1}`;
}

function periodDisplayLabel(period: PlayerListLockPeriod, index: number, total: number): string {
  return period.label?.trim() || periodHint(index, total);
}

function toFingerprint(lockEnabled: boolean, periods: PlayerListLockPeriod[]): string {
  return JSON.stringify(toPlayerListLockSettingValue(lockEnabled, periods));
}

function hasFilledPeriod(periods: PlayerListLockPeriod[]): boolean {
  return periods.some((p) => p.from.trim().length > 0);
}

const PlayerListLockSettings: React.FC = () => {
  const [settings, setSettings] = useState<LockSettings | null>(null);
  const [periods, setPeriods] = useState<PlayerListLockPeriod[]>([
    { from: "", until: null, label: null },
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState<PlayerListLockSettingValue>({
    lock_enabled: false,
    periods: [],
  });
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastSavedFingerprint = useRef("");
  const { toast } = useToast();
  const { orgQueryEnabled, getSeasonData } = useSeasonDataScope();

  /** Aan als er minstens één periode met startdatum is. */
  const lockEnabled = hasFilledPeriod(periods);

  const validationError = useMemo(
    () => validatePlayerListLockPeriods(lockEnabled, periods),
    [lockEnabled, periods],
  );

  const isValid = !validationError;

  const currentFingerprint = useMemo(
    () => toFingerprint(lockEnabled, periods),
    [lockEnabled, periods],
  );

  useEffect(() => {
    if (!orgQueryEnabled) return;
    void fetchSettings();
  }, [orgQueryEnabled]);

  const applyLoadedValue = (
    id: number,
    settingValue: PlayerListLockSettingValue,
    seasonHint?: { start: string; end: string },
  ) => {
    const normalized = normalizePlayerListLockPeriods(settingValue);
    const suggested = buildSuggestedSeasonLockPeriod(
      seasonHint?.start ?? seasonStart,
      seasonHint?.end ?? seasonEnd,
    );
    const nextPeriods = normalized.length > 0 ? normalized : [suggested];
    const enabled = hasFilledPeriod(normalized);
    const persisted = toPlayerListLockSettingValue(enabled, normalized);

    setSettings({ id });
    setPeriods(nextPeriods);
    setSavedSnapshot(persisted);
    lastSavedFingerprint.current = toFingerprint(enabled, normalized);
  };

  const fetchSettings = async () => {
    try {
      let start = "";
      let end = "";
      try {
        const season = await getSeasonData();
        start = season.season_start_date?.slice(0, 10) || "";
        end = season.season_end_date?.slice(0, 10) || "";
        setSeasonStart(start);
        setSeasonEnd(end);
      } catch {
        // Seizoensdatums optioneel
      }

      const suggested = buildSuggestedSeasonLockPeriod(start, end);
      const rows = await listApplicationSettingsForSession("player_list_lock");
      const data = rows.find((row) => row.setting_name === "global_lock");

      if (data) {
        const value = (data.setting_value ?? {}) as PlayerListLockSettingValue;
        const normalized = normalizePlayerListLockPeriods(value);
        // Bestaande rij zonder periodes: vul seizoensvoorstel in (nog niet auto-saven)
        if (normalized.length === 0 && suggested.from) {
          setSettings({ id: data.id });
          setPeriods([suggested]);
          setSavedSnapshot(toPlayerListLockSettingValue(false, []));
          lastSavedFingerprint.current = "";
          setHasChanges(true);
          setSaveState("idle");
          return;
        }
        applyLoadedValue(data.id, value);
      } else {
        // Eerste setup: standaard aan + seizoensperiode gepland
        const defaultEnabled = Boolean(suggested.from);
        const defaultSettingValue = toPlayerListLockSettingValue(
          defaultEnabled,
          suggested.from ? [suggested] : [],
        );
        const newId = await insertApplicationSettingForSession({
          setting_category: "player_list_lock",
          setting_name: "global_lock",
          setting_value: defaultSettingValue,
        });
        applyLoadedValue(newId, defaultSettingValue, { start, end });
        if (!suggested.from) {
          setPeriods([{ from: "", until: null, label: null }]);
        }
      }

      setHasChanges(false);
      setSaveState("idle");
    } catch (error) {
      console.error("Error fetching player list lock settings:", error);
      toast({
        title: "Fout bij ophalen instellingen",
        description: "Kon vergrendelingsinstellingen niet ophalen",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const persistSettings = async (nextEnabled: boolean, nextPeriods: PlayerListLockPeriod[]) => {
    if (!settings) return;

    setSaveState("saving");
    try {
      const settingValue = toPlayerListLockSettingValue(nextEnabled, nextPeriods);

      await updateApplicationSettingForSession(settings.id, {
        setting_value: settingValue,
        setting_category: "player_list_lock",
      });

      setSavedSnapshot(settingValue);
      lastSavedFingerprint.current = toFingerprint(nextEnabled, nextPeriods);
      setHasChanges(false);
      setSaveState("saved");
    } catch (error) {
      console.error("Error saving player list lock settings:", error);
      setSaveState("error");
      toast({
        title: "Fout bij opslaan",
        description: "Kon vergrendelingsinstellingen niet opslaan",
        variant: "destructive",
      });
    }
  };

  const markDirty = () => {
    setHasChanges(true);
    setSaveState("idle");
  };

  const updatePeriod = (index: number, patch: Partial<PlayerListLockPeriod>) => {
    setPeriods((prev) =>
      prev.map((period, i) => {
        if (i !== index) return period;
        return {
          from: patch.from !== undefined ? patch.from : period.from,
          until:
            patch.until !== undefined
              ? patch.until?.trim()
                ? patch.until.trim()
                : null
              : period.until,
          label:
            patch.label !== undefined
              ? patch.label?.trim()
                ? patch.label.trim()
                : null
              : period.label ?? null,
        };
      }),
    );
    markDirty();
  };

  const addPeriod = () => {
    setPeriods((prev) => [...prev, nextEmptyLockPeriod(prev)]);
    markDirty();
  };

  const removePeriod = (index: number) => {
    setPeriods((prev) => {
      if (prev.length <= 1) {
        return [{ from: "", until: null, label: null }];
      }
      return prev.filter((_, i) => i !== index);
    });
    markDirty();
  };

  useEffect(() => {
    if (!settings || !hasChanges || !isValid) return;
    if (currentFingerprint === lastSavedFingerprint.current) return;

    const timeoutId = window.setTimeout(() => {
      void persistSettings(lockEnabled, periods);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentFingerprint,
    hasChanges,
    isValid,
    lockEnabled,
    periods,
    settings,
  ]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timeoutId = window.setTimeout(() => setSaveState("idle"), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [saveState]);

  const saveStatusBadge =
    saveState === "saving" ? (
      <Badge variant="secondary" className="gap-1 rounded-full">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Opslaan…
      </Badge>
    ) : saveState === "saved" ? (
      <Badge variant="secondary" className="gap-1 rounded-full text-green-700">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Opgeslagen
      </Badge>
    ) : saveState === "error" ? (
      <Badge variant="secondary" className="gap-1 rounded-full text-destructive">
        <AlertCircle className="h-3 w-3" aria-hidden />
        Opslaan mislukt
      </Badge>
    ) : hasChanges ? (
      <Badge variant="secondary" className="rounded-full">
        Wijzigingen bezig
      </Badge>
    ) : (
      <Badge variant="secondary" className="rounded-full">
        Automatisch bewaren
      </Badge>
    );

  if (loading) {
    return (
      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-md")}>
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const savedScheduleStatus = getPlayerListLockScheduleStatus(savedSnapshot);

  return (
    <Card className={cn(PUBLIC_CARD_CLASS, "shadow-md")}>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-brand-dark">
              <SectionIcon icon={Lock} />
              Spelerslijst vergrendeling
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Vul periodes in om de spelerslijst te vergrendelen voor teammanagers. Zonder
              periodes blijft de lijst open.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={cn("rounded-full", STATUS_BADGE_CLASS[savedScheduleStatus])}
            >
              {PLAYER_LIST_LOCK_STATUS_LABELS[savedScheduleStatus]}
            </Badge>
            {saveStatusBadge}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
              <Calendar className="h-4 w-4 text-primary" aria-hidden />
              Periodes
            </div>
            <Button
              type="button"
              variant="unstyled"
              className="btn btn--outline min-h-[44px] w-full sm:w-auto gap-1"
              onClick={addPeriod}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Periode toevoegen
            </Button>
          </div>

          <div className="space-y-3 md:hidden">
            {periods.map((period, index) => {
              const hint = periodHint(index, periods.length);
              const ariaName = periodDisplayLabel(period, index, periods.length);
              return (
                <div
                  key={`lock-period-mobile-${index}`}
                  className="rounded-lg border border-primary/10 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Input
                      id={`lock-label-mobile-${index}`}
                      aria-label={`Label periode ${index + 1}`}
                      placeholder={hint}
                      value={period.label ?? ""}
                      onChange={(e) => updatePeriod(index, { label: e.target.value })}
                      className="min-h-[44px]"
                    />
                    <Button
                      type="button"
                      variant="unstyled"
                      className="btn btn--icon btn--danger shrink-0 min-h-[44px] min-w-[44px]"
                      onClick={() => removePeriod(index)}
                      aria-label={`${ariaName} verwijderen`}
                      disabled={
                        periods.length <= 1 && !period.from && !period.until && !period.label
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`lock-from-mobile-${index}`} className="text-xs">
                        Vanaf
                      </Label>
                      <Input
                        id={`lock-from-mobile-${index}`}
                        type="date"
                        aria-label={`${ariaName} vanaf`}
                        value={period.from}
                        onChange={(e) => updatePeriod(index, { from: e.target.value })}
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`lock-until-mobile-${index}`} className="text-xs">
                        Tot
                      </Label>
                      <Input
                        id={`lock-until-mobile-${index}`}
                        type="date"
                        aria-label={`${ariaName} tot`}
                        value={period.until ?? ""}
                        onChange={(e) => updatePeriod(index, { until: e.target.value })}
                        className="min-h-[44px]"
                        min={period.from || undefined}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-primary/10 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 text-xs font-medium w-[7rem]">Label</TableHead>
                  <TableHead className="h-10 text-xs font-medium">Vanaf</TableHead>
                  <TableHead className="h-10 text-xs font-medium">Tot</TableHead>
                  <TableHead className="h-10 w-12">
                    <span className="sr-only">Verwijderen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period, index) => {
                  const hint = periodHint(index, periods.length);
                  const ariaName = periodDisplayLabel(period, index, periods.length);
                  return (
                  <TableRow key={`lock-period-${index}`}>
                    <TableCell className="py-2">
                      <Input
                        id={`lock-label-${index}`}
                        aria-label={`Label periode ${index + 1}`}
                        placeholder={hint}
                        value={period.label ?? ""}
                        onChange={(e) => updatePeriod(index, { label: e.target.value })}
                        className="min-h-[44px] min-w-[9rem] max-w-[14rem]"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        id={`lock-from-${index}`}
                        type="date"
                        aria-label={`${ariaName} vanaf`}
                        value={period.from}
                        onChange={(e) => updatePeriod(index, { from: e.target.value })}
                        className="min-h-[44px] max-w-[11rem]"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        id={`lock-until-${index}`}
                        type="date"
                        aria-label={`${ariaName} tot`}
                        value={period.until ?? ""}
                        onChange={(e) => updatePeriod(index, { until: e.target.value })}
                        className="min-h-[44px] max-w-[11rem]"
                        min={period.from || undefined}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        type="button"
                        variant="unstyled"
                        className="btn btn--icon btn--danger"
                        onClick={() => removePeriod(index)}
                        aria-label={`${ariaName} verwijderen`}
                        disabled={periods.length <= 1 && !period.from && !period.until && !period.label}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {validationError && hasChanges ? (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription className="text-sm">{validationError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {saveState === "saving" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Instellingen worden bewaard…
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default PlayerListLockSettings;
