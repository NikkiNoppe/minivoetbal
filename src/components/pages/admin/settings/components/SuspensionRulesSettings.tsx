import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { PUBLIC_CARD_CLASS, SectionIcon } from "@/components/layout";
import {
  suspensionRulesService,
  type SuspensionRules,
  type YellowCardRule,
} from "@/domains/cards-suspensions";

type SaveState = "idle" | "saving" | "saved" | "error";

function fingerprintSuspensionRules(r: SuspensionRules): string {
  const normalized: SuspensionRules = {
    ...r,
    yellow_card_rules: [...r.yellow_card_rules].sort((a, b) => a.card_count - b.card_count),
  };
  return JSON.stringify(normalized);
}

function validateSuspensionRules(rules: SuspensionRules): string | null {
  for (const rule of rules.yellow_card_rules) {
    if (rule.card_count < 1) {
      return "Elke gele-kaart drempel moet minstens 1 zijn.";
    }
    if (rule.suspension_matches < 0) {
      return "Schorsingsduur kan niet negatief zijn.";
    }
  }

  const counts = rules.yellow_card_rules.map((rule) => rule.card_count);
  if (new Set(counts).size !== counts.length) {
    return "Elke gele-kaart drempel moet uniek zijn.";
  }

  if (rules.red_card_rules.default_suspension_matches < 1) {
    return "Standaard rood-schorsing moet minstens 1 wedstrijd zijn.";
  }

  return null;
}

function formatYellowSummary(rules: YellowCardRule[]): string {
  if (rules.length === 0) return "Geen drempels";
  return [...rules]
    .sort((a, b) => a.card_count - b.card_count)
    .map((r) => `${r.card_count}→${r.suspension_matches}`)
    .join(" · ");
}

export const SuspensionRulesSettings: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orgQueryEnabled } = useOrgQueryScope();
  const [rules, setRules] = useState<SuspensionRules | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastSavedFingerprint = useRef("");

  useEffect(() => {
    if (!orgQueryEnabled) return;
    void loadRules();
  }, [orgQueryEnabled]);

  const loadRules = async () => {
    try {
      setIsLoading(true);
      const suspensionRules = await suspensionRulesService.getSuspensionRules();
      setRules(suspensionRules);
      lastSavedFingerprint.current = fingerprintSuspensionRules(suspensionRules);
      setHasChanges(false);
      setSaveState("idle");
    } catch (error) {
      console.error("Error loading suspension rules:", error);
      toast({
        title: "Fout",
        description: "Kon schorsingsregels niet laden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const persistRules = async (nextRules: SuspensionRules) => {
    try {
      setSaveState("saving");
      const rulesToSave: SuspensionRules = {
        ...nextRules,
        yellow_card_rules: [...nextRules.yellow_card_rules].sort(
          (a, b) => a.card_count - b.card_count,
        ),
        red_card_rules: {
          ...nextRules.red_card_rules,
          admin_can_modify: true,
        },
      };

      const success = await suspensionRulesService.updateSuspensionRules(rulesToSave);

      if (!success) throw new Error("Update failed");

      setRules(rulesToSave);
      lastSavedFingerprint.current = fingerprintSuspensionRules(rulesToSave);
      setHasChanges(false);
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["suspensions"] });
    } catch (error) {
      console.error("Error saving suspension rules:", error);
      setSaveState("error");
      toast({
        title: "Fout",
        description: "Kon schorsingsregels niet opslaan.",
        variant: "destructive",
      });
    }
  };

  const updateRules = (updater: (current: SuspensionRules) => SuspensionRules) => {
    setRules((current) => {
      if (!current) return current;
      const next = updater(current);
      setHasChanges(true);
      setSaveState("idle");
      return next;
    });
  };

  const addYellowCardRule = () => {
    updateRules((current) => {
      const highestCardCount = Math.max(
        0,
        ...current.yellow_card_rules.map((rule) => rule.card_count || 0),
      );
      const newRule: YellowCardRule = {
        card_count: highestCardCount + 2,
        suspension_matches: 1,
      };
      return {
        ...current,
        yellow_card_rules: [...current.yellow_card_rules, newRule],
      };
    });
  };

  const updateYellowCardRule = (
    index: number,
    field: "card_count" | "suspension_matches",
    value: number,
  ) => {
    updateRules((current) => {
      const updatedRules = [...current.yellow_card_rules];
      updatedRules[index] = { ...updatedRules[index], [field]: value };
      return { ...current, yellow_card_rules: updatedRules };
    });
  };

  const removeYellowCardRule = (index: number) => {
    updateRules((current) => ({
      ...current,
      yellow_card_rules: current.yellow_card_rules.filter((_, i) => i !== index),
    }));
  };

  const currentFingerprint = useMemo(
    () => (rules ? fingerprintSuspensionRules(rules) : null),
    [rules],
  );

  const validationError = useMemo(
    () => (rules ? validateSuspensionRules(rules) : null),
    [rules],
  );

  const isValid = !validationError;

  useEffect(() => {
    if (!rules || !hasChanges || !isValid) return;
    if (!currentFingerprint || currentFingerprint === lastSavedFingerprint.current) return;

    const timeoutId = window.setTimeout(() => {
      void persistRules(rules);
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [currentFingerprint, hasChanges, isValid, rules]);

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
    ) : hasChanges && isValid ? (
      <Badge variant="secondary" className="rounded-full">
        Wordt bewaard…
      </Badge>
    ) : (
      <Badge variant="secondary" className="rounded-full">
        Automatisch bewaren
      </Badge>
    );

  if (isLoading) {
    return (
      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-md")}>
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rules) {
    return (
      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-md")}>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-brand-dark">
            <SectionIcon icon={ShieldAlert} />
            Schorsingsregels
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertDescription>
              Kon schorsingsregels niet laden. Probeer de pagina te vernieuwen.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const yellowSummary = formatYellowSummary(rules.yellow_card_rules);

  return (
    <Card className={cn(PUBLIC_CARD_CLASS, "shadow-md")}>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-brand-dark">
              <SectionIcon icon={ShieldAlert} />
              Schorsingsregels
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Drempels voor gele kaarten, standaard rood-schorsing en seizoensreset.
              Wijzigingen worden automatisch bewaard.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">{saveStatusBadge}</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-primary/15 bg-brand-50/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Gele drempels
                </p>
                <p className="mt-2 text-sm font-semibold leading-snug text-brand-dark">
                  {yellowSummary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Format: kaarten → wedstrijden schorsing
                </p>
              </div>

              <div className="rounded-xl border border-primary/15 bg-brand-50/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
                  <Ban className="h-4 w-4 text-destructive" aria-hidden />
                  Rechtstreeks rood
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="red-default" className="text-xs text-muted-foreground">
                    Wedstrijden
                  </Label>
                  <Input
                    id="red-default"
                    type="number"
                    inputMode="numeric"
                    value={rules.red_card_rules.default_suspension_matches}
                    onChange={(e) =>
                      updateRules((current) => ({
                        ...current,
                        red_card_rules: {
                          ...current.red_card_rules,
                          default_suspension_matches: parseInt(e.target.value, 10) || 1,
                        },
                      }))
                    }
                    className="min-h-[44px] max-w-[8rem]"
                    min={1}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Afwijkingen via handmatige schorsing.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/10 bg-card px-4 py-3 min-h-[44px]">
              <div className="space-y-0.5 min-w-0">
                <Label htmlFor="season-reset" className="text-sm font-medium text-brand-dark">
                  Reset aan einde seizoen
                </Label>
                <p className="text-xs text-muted-foreground">
                  Gele en rode tellers wissen bij seizoenseinde.
                </p>
              </div>
              <Switch
                id="season-reset"
                checked={rules.reset_rules.reset_at_season_end}
                onCheckedChange={(checked) =>
                  updateRules((current) => ({
                    ...current,
                    reset_rules: {
                      ...current.reset_rules,
                      reset_at_season_end: checked,
                    },
                  }))
                }
                className="shrink-0"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background p-4 sm:p-5 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                Gele kaarten
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addYellowCardRule}
                className="min-h-[44px] w-full sm:w-auto gap-1"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Drempel
              </Button>
            </div>

            {rules.yellow_card_rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-primary/15 px-3 py-2.5 text-sm text-muted-foreground">
                Nog geen drempels. Voeg een regel toe.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-3 sm:hidden">
                  {rules.yellow_card_rules.map((rule, index) => (
                    <div
                      key={`yellow-rule-mobile-${index}`}
                      className="rounded-lg border border-primary/10 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-brand-dark">
                          Drempel {index + 1}
                        </p>
                        <Button
                          type="button"
                          className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
                          onClick={() => removeYellowCardRule(index)}
                          aria-label={`Drempel bij ${rule.card_count} gele kaarten verwijderen`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label
                            htmlFor={`yellow-count-mobile-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Vanaf (geel)
                          </label>
                          <Input
                            id={`yellow-count-mobile-${index}`}
                            type="number"
                            inputMode="numeric"
                            aria-label={`Vanaf ${rule.card_count} gele kaarten`}
                            value={rule.card_count}
                            onChange={(e) =>
                              updateYellowCardRule(
                                index,
                                "card_count",
                                parseInt(e.target.value, 10) || 1,
                              )
                            }
                            className="min-h-[44px] w-full"
                            min={1}
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor={`yellow-suspension-mobile-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Schorsing
                          </label>
                          <Input
                            id={`yellow-suspension-mobile-${index}`}
                            type="number"
                            inputMode="numeric"
                            aria-label={`Schorsing ${rule.suspension_matches} wedstrijden`}
                            value={rule.suspension_matches}
                            onChange={(e) =>
                              updateYellowCardRule(
                                index,
                                "suspension_matches",
                                parseInt(e.target.value, 10) || 0,
                              )
                            }
                            className="min-h-[44px] w-full"
                            min={0}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto -mx-1 px-1 sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[8rem]">Vanaf (gele kaarten)</TableHead>
                        <TableHead className="min-w-[8rem]">Schorsing (wedstrijden)</TableHead>
                        <TableHead className="w-[72px] text-center">Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.yellow_card_rules.map((rule, index) => (
                        <TableRow key={`yellow-rule-${index}`}>
                          <TableCell className="align-middle">
                            <Input
                              id={`yellow-count-${index}`}
                              type="number"
                              inputMode="numeric"
                              aria-label={`Vanaf ${rule.card_count} gele kaarten`}
                              value={rule.card_count}
                              onChange={(e) =>
                                updateYellowCardRule(
                                  index,
                                  "card_count",
                                  parseInt(e.target.value, 10) || 1,
                                )
                              }
                              className="min-h-[44px] w-full max-w-[9rem]"
                              min={1}
                            />
                          </TableCell>
                          <TableCell className="align-middle">
                            <Input
                              id={`yellow-suspension-${index}`}
                              type="number"
                              inputMode="numeric"
                              aria-label={`Schorsing ${rule.suspension_matches} wedstrijden`}
                              value={rule.suspension_matches}
                              onChange={(e) =>
                                updateYellowCardRule(
                                  index,
                                  "suspension_matches",
                                  parseInt(e.target.value, 10) || 0,
                                )
                              }
                              className="min-h-[44px] w-full max-w-[9rem]"
                              min={0}
                            />
                          </TableCell>
                          <TableCell className="align-middle text-center">
                            <div className="flex justify-center">
                              <Button
                                type="button"
                                className="btn btn--icon btn--danger"
                                onClick={() => removeYellowCardRule(index)}
                                aria-label={`Drempel bij ${rule.card_count} gele kaarten verwijderen`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>

        {validationError && hasChanges ? (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertDescription className="text-sm">{validationError}</AlertDescription>
          </Alert>
        ) : null}

        {saveState === "saving" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Kaarttotalen worden herberekend…
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
