import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppAlertModal, DestructiveConfirmDescription } from "@/components/modals";
import { useToast } from "@/hooks/use-toast";
import { PUBLIC_CARD_CLASS } from "@/components/layout";
import { cn } from "@/lib/utils";
import {
  closeSeason,
  DEFAULT_CLOSE_CUTOFF_DATE,
  DEFAULT_CLOSE_SEASON_LABEL,
  DEFAULT_TARGET_CAPITAL,
  exportSeasonBackup,
  getLatestSeasonBackup,
  previewCloseSeason,
  resolveCloseSeasonDefaults,
  saveSeasonArchiveJson,
  snapshotPublicArchivesBeforeClose,
} from "@/services/season/seasonCloseService";
import { invalidateFinancialTransactionQueries } from "@/services/financial";
import { ARCHIVES_KEY } from "@/hooks/useArchives";

type Props = {
  organizationId: number;
  organizationName: string;
  enabled: boolean;
  /** Binnen editor-tab: geen extra Card-wrapper. */
  embedded?: boolean;
};

export function CloseSeasonCard({
  organizationId,
  organizationName,
  enabled,
  embedded = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [redownloading, setRedownloading] = useState(false);
  const [seasonLabel, setSeasonLabel] = useState(DEFAULT_CLOSE_SEASON_LABEL);
  const [cutoffDate, setCutoffDate] = useState(DEFAULT_CLOSE_CUTOFF_DATE);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const defaults = await resolveCloseSeasonDefaults(organizationId);
      if (cancelled) return;
      setSeasonLabel(defaults.seasonLabel);
      setCutoffDate(defaults.cutoffDate);
      setDefaultsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId]);

  const previewQuery = useQuery({
    queryKey: ["close-season-preview", organizationId, cutoffDate],
    queryFn: () => previewCloseSeason(cutoffDate),
    enabled: enabled && defaultsLoaded && !!cutoffDate,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const preview = previewQuery.data;
  const previewOk = preview?.success === true;
  const matchesRemaining = preview?.matches_remaining_after_cutoff ?? 0;
  const costsRemaining = preview?.costs_remaining_after_cutoff ?? 0;
  const canClose =
    previewOk &&
    ((preview.matches_to_tag ?? 0) > 0 || (preview.costs_to_tag ?? 0) > 0);

  const handleInterimBackup = async () => {
    setBackingUp(true);
    try {
      const result = await exportSeasonBackup({
        seasonLabel,
        targetCapital: DEFAULT_TARGET_CAPITAL,
      });

      if (!result.success) {
        toast({
          title: "Backup mislukt",
          description: result.error || "Onbekende fout",
          variant: "destructive",
        });
        return;
      }

      let archiveHint = "JSON gedownload.";
      if (result.full_export) {
        const saved = await saveSeasonArchiveJson(
          result.download_filename || `seizoen-${seasonLabel}-backup.json`,
          result.full_export,
        );
        archiveHint = saved.savedToDisk
          ? `Bewaard in ${saved.relativePath ?? "archief/"}.`
          : "JSON gedownload (herstart `npm run dev` om ook naar archief/ te schrijven).";
      }

      toast({
        title: "Tussentijdse backup bewaard",
        description: `${result.match_count ?? 0} wedstrijden en ${result.cost_count ?? 0} kosten. ${archiveHint} Seizoen blijft open.`,
      });
    } catch (e) {
      toast({
        title: "Backup mislukt",
        description: e instanceof Error ? e.message : "Onbekende fout",
        variant: "destructive",
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRedownloadLatest = async () => {
    setRedownloading(true);
    try {
      const result = await getLatestSeasonBackup(seasonLabel);
      if (!result.success || !result.full_export) {
        toast({
          title: "Geen backup gevonden",
          description: result.error || "Maak eerst een tussentijdse backup.",
          variant: "destructive",
        });
        return;
      }
      const saved = await saveSeasonArchiveJson(
        result.download_filename || `seizoen-${seasonLabel}-backup-latest.json`,
        result.full_export,
      );
      toast({
        title: "Backup gedownload",
        description: saved.savedToDisk
          ? `Bewaard in ${saved.relativePath ?? "archief/"}.`
          : result.exported_at
            ? `Server-snapshot van ${new Date(result.exported_at).toLocaleString("nl-BE")} gedownload.`
            : "Laatste tussentijdse backup gedownload.",
      });
    } catch (e) {
      toast({
        title: "Download mislukt",
        description: e instanceof Error ? e.message : "Onbekende fout",
        variant: "destructive",
      });
    } finally {
      setRedownloading(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await snapshotPublicArchivesBeforeClose(seasonLabel.trim(), organizationId);

      const result = await closeSeason({
        seasonLabel: seasonLabel.trim(),
        cutoffDate,
        targetCapital: DEFAULT_TARGET_CAPITAL,
      });

      if (!result.success) {
        toast({
          title: "Afsluiten mislukt",
          description: result.error || "Onbekende fout",
          variant: "destructive",
        });
        return;
      }

      let archiveHint = "JSON gedownload.";
      if (result.full_export) {
        const saved = await saveSeasonArchiveJson(
          result.download_filename || `seizoen-${seasonLabel.trim()}.json`,
          result.full_export,
        );
        archiveHint = saved.savedToDisk
          ? `Bewaard in ${saved.relativePath ?? "archief/"}.`
          : "JSON gedownload (herstart `npm run dev` om ook naar archief/ te schrijven).";
      }

      const remainingNote =
        matchesRemaining > 0
          ? ` Let op: ${matchesRemaining} wedstrijd(en) na cutoff blijven actief.`
          : "";

      toast({
        title: "Seizoen afgesloten",
        description: `${result.matches_tagged ?? 0} wedstrijden en ${result.costs_tagged ?? 0} kosten gearchiveerd. ${archiveHint}${remainingNote}`,
      });

      await Promise.all([
        invalidateFinancialTransactionQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ARCHIVES_KEY }),
        queryClient.invalidateQueries({ queryKey: ["close-season-preview"] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["matches"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
      ]);
      setConfirmOpen(false);
    } catch (e) {
      toast({
        title: "Afsluiten mislukt",
        description: e instanceof Error ? e.message : "Onbekende fout",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  };

  if (!enabled) return null;

  const description = (
    <>
      Soft-archive voor {organizationName}: wedstrijden en kosten vóór de cutoff krijgen het
      seizoenlabel. Saldi blijven staan; categorieën starten opnieuw op €0. Geen hard delete.
      Daarna kun je een nieuw seizoen aanmaken.
    </>
  );

  const fields = (
    <div className="space-y-4">
      {embedded ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="close-season-label">Seizoenlabel</Label>
              <Input
                id="close-season-label"
                value={seasonLabel}
                onChange={(e) => setSeasonLabel(e.target.value)}
                placeholder="bv. 2025-2026"
                className="min-h-[44px]"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-season-cutoff">Cutoff-datum</Label>
              <Input
                id="close-season-cutoff"
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>

          {previewQuery.isLoading || !defaultsLoaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Preview laden…
            </div>
          ) : previewQuery.isError || !previewOk ? (
            <Alert variant="destructive">
              <AlertTitle>Preview niet beschikbaar</AlertTitle>
              <AlertDescription>
                {preview?.error ||
                  (previewQuery.error instanceof Error
                    ? previewQuery.error.message
                    : "Kon preview niet laden. Activeer deze organisatie eerst.")}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border border-primary/20 bg-background px-3 py-2 text-sm space-y-1">
              <p>
                Wedstrijden te archiveren:{" "}
                <strong>{preview.matches_to_tag ?? 0}</strong>
              </p>
              <p>
                Kostenrijen te archiveren:{" "}
                <strong>{preview.costs_to_tag ?? 0}</strong>
              </p>
              {(matchesRemaining > 0 || costsRemaining > 0) && (
                <Alert className="mt-2 border-amber-400/60">
                  <AlertTitle className="text-sm">Blijven actief na cutoff</AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <p>
                      {matchesRemaining} wedstrijd(en) en {costsRemaining} kostenrij(en) met
                      datum ≥ {cutoffDate} blijven in het huidige seizoen.
                    </p>
                    <p>
                      Die blokkeren een nieuwe competitie/beker zolang ze actief zijn — pas de
                      cutoff aan of verplaats/tag ze apart.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-muted-foreground text-xs pt-1">
                Doelkapitaal €{DEFAULT_TARGET_CAPITAL} — na close toont Financiën “Nog te
                storten”.
              </p>
            </div>
          )}

          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
            <li>
              JSON gaat naar map <code className="text-xs">archief/</code> (bij lokale{" "}
              <code className="text-xs">npm run dev</code>) én als download
            </li>
            <li>Bij afsluiten: klassement/beker/playoff-snapshot + soft-tag matches/kosten</li>
            <li>Gele kaarten → 0; rood blijft bij open schorsing</li>
            <li>
              Sportzalen, tijdslots, teams en seizoensconfig blijven ongemoeid (niet
              seizoensgebonden archief)
            </li>
          </ul>

          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={backingUp || closing || redownloading || !seasonLabel.trim()}
              onClick={handleInterimBackup}
              aria-label="Tussentijdse seizoensbackup bewaren en downloaden"
            >
              {backingUp ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4 mr-2" aria-hidden />
              )}
              Tussentijds bewaren
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={backingUp || closing || redownloading || !seasonLabel.trim()}
              onClick={handleRedownloadLatest}
              aria-label="Laatste tussentijdse backup opnieuw downloaden"
            >
              {redownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4 mr-2" aria-hidden />
              )}
              Laatste backup downloaden
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={
                !canClose ||
                closing ||
                backingUp ||
                redownloading ||
                !seasonLabel.trim() ||
                !cutoffDate
              }
              onClick={() => setConfirmOpen(true)}
            >
              <Archive className="h-4 w-4 mr-2" aria-hidden />
              Seizoen {seasonLabel.trim() || "…"} afsluiten
            </Button>
          </div>
    </div>
  );

  return (
    <>
      {embedded ? (
        <div className="rounded-lg border border-amber-400/50 bg-background p-4 sm:p-5">
          {fields}
        </div>
      ) : (
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm border-amber-400/50")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="h-5 w-5" aria-hidden />
              Seizoen afsluiten
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">{fields}</CardContent>
        </Card>
      )}

      <AppAlertModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Seizoen afsluiten?"
        description={
          <DestructiveConfirmDescription
            message={`Je staat op het punt seizoen ${seasonLabel.trim()} af te sluiten voor ${organizationName} (cutoff ${cutoffDate}).`}
            warning={
              matchesRemaining > 0
                ? `Wedstrijden en kosten vóór de cutoff worden getagd (geen delete). ${matchesRemaining} wedstrijd(en) na cutoff blijven actief en kunnen een nieuw seizoen blokkeren. JSON wordt bewaard in archief/ en gedownload.`
                : "Wedstrijden en kosten worden getagd als archief (geen delete). De complete JSON wordt bewaard in archief/ (lokaal) en gedownload. Deze actie kan niet zomaar ongedaan worden gemaakt."
            }
          />
        }
        confirmAction={{
          label: closing ? "Bezig…" : "Afsluiten + JSON downloaden",
          onClick: handleClose,
          variant: "destructive",
          disabled: closing,
          loading: closing,
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: () => setConfirmOpen(false),
          disabled: closing,
        }}
        size="sm"
      />
    </>
  );
}
