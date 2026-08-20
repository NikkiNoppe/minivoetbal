import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Eye, Info, AlertCircle, CheckCircle2, Database, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppAlertModal, InfoConfirmDescription } from "@/components/modals";
import { getSuperAdminTenantById } from "@/config/superAdminTenants";
import {
  analyzePreviewTeamConflicts,
  conflictLookup,
  previewConflictCellKey,
  type PreviewConflictKind,
  type SeasonPreviewProgress,
  type UnifiedPreviewPhase,
  type UnifiedPreviewRow,
  type UnifiedSeasonPreview,
} from "@/lib/seasonSetup";
import { compareUnifiedPreviewRows } from "@/lib/seasonSetup/placeCupFinalOnQuietDay";
import { Progress } from "@/components/ui/progress";

const PHASE_BADGE: Record<
  UnifiedPreviewPhase,
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
  free: {
    label: "Vrij",
    className: "bg-muted text-muted-foreground border-border",
  },
  vacation: {
    label: "Vakantie",
    className: "bg-slate-100 text-slate-700 border-slate-300/70",
  },
  blocked: {
    label: "Gesloten",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const CONFLICT_STYLE: Record<
  PreviewConflictKind,
  { className: string; label: string }
> = {
  double: {
    className:
      "rounded px-1 py-0.5 bg-orange-200 text-orange-950 font-semibold ring-1 ring-orange-400/80",
    label: "2× dezelfde week",
  },
  advance_risk: {
    className:
      "rounded px-1 py-0.5 bg-emerald-200 text-emerald-950 font-semibold ring-1 ring-emerald-500/70",
    label: "Risico doorstroming (deze week)",
  },
  shared_week: {
    className:
      "rounded px-1 py-0.5 bg-sky-100 text-sky-950 ring-1 ring-sky-400/60",
    label: "Beker + competitie (andere dag)",
  },
  dual_week: {
    className:
      "rounded px-1 py-0.5 bg-sky-50 text-sky-900 ring-1 ring-sky-300/50",
    label: "2× competitie deze week",
  },
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("nl-BE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function previewRoundLabel(row: UnifiedPreviewRow): string {
  if (row.phase === "competition" && row.round) return `Ronde ${row.round}`;
  if (row.phase === "cup") {
    const s = (row.speeldag || "").toLowerCase();
    if (s.includes("voorronde")) return "Voorronde";
    if (s.includes("1/8")) return "1/8";
    if (s.includes("kwart")) return "Kwart";
    if (s.includes("halve")) return "Halve";
    if (s.includes("finale")) return "Finale";
  }
  if (row.phase === "playoff") return "Play-off";
  return "—";
}

function isByePreviewRow(row: UnifiedPreviewRow): boolean {
  return (
    row.venue === "BYE" ||
    row.match_time === "00:00" ||
    row.awayLabel === "BYE" ||
    row.homeLabel === "BYE"
  );
}

function TeamCell({
  row,
  side,
  lookup,
}: {
  row: UnifiedPreviewRow;
  side: "home" | "away";
  lookup: ReturnType<typeof conflictLookup>;
}) {
  const label = side === "home" ? row.homeLabel : row.awayLabel;
  const teamId = side === "home" ? row.homeTeamId : row.awayTeamId;
  if (typeof teamId !== "number") {
    return <span>{label}</span>;
  }
  const conflict = lookup.get(previewConflictCellKey(row, side, teamId));
  if (!conflict) return <span>{label}</span>;
  const style = CONFLICT_STYLE[conflict.kind];
  return (
    <span className={style.className} title={conflict.reason}>
      {label}
    </span>
  );
}

export interface SeasonUnifiedPreviewPanelProps {
  preview: UnifiedSeasonPreview | null;
  loading?: boolean;
  /** Voortgang tijdens genereren (percentage + label). */
  progress?: SeasonPreviewProgress | null;
  error?: string | null;
  onGenerate: (opts?: { allowDualMatchWeek?: boolean }) => void;
  onConfirm?: () => void | Promise<void>;
  confirming?: boolean;
  disabled?: boolean;
}

const SeasonUnifiedPreviewPanel: React.FC<SeasonUnifiedPreviewPanelProps> = ({
  preview,
  loading = false,
  progress = null,
  error = null,
  onGenerate,
  onConfirm,
  confirming = false,
  disabled = false,
}) => {
  const [filter, setFilter] = useState<UnifiedPreviewPhase | "all">("all");
  const [showByes, setShowByes] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const commitSummary = useMemo(() => {
    const c = preview?.commit;
    if (!c) return null;
    const parts: string[] = [];
    if (c.cupPlan?.length) parts.push(`Beker: ${c.cupPlan.length} wedstrijden`);
    if (c.competitionPlan?.length) {
      const real = c.competitionPlan.filter((p) => p.away_team_id != null).length;
      parts.push(`Competitie: ${real} wedstrijden`);
    }
    if (c.playoffIntent) {
      parts.push(
        `Play-offs: top ${c.playoffIntent.topPositions.length} + bottom ${c.playoffIntent.bottomPositions.length} (concept)`,
      );
    }
    const tenant = getSuperAdminTenantById(c.organizationId);
    return {
      parts,
      organizationId: c.organizationId,
      orgLabel: tenant?.name ?? `Organisatie ${c.organizationId}`,
      canConfirm: parts.length > 0,
    };
  }, [preview?.commit]);

  const conflictMap = useMemo(() => {
    if (!preview?.rows.length) return new Map();
    return conflictLookup(analyzePreviewTeamConflicts(preview.rows));
  }, [preview]);

  const conflictCounts = useMemo(() => {
    let double = 0;
    let advance = 0;
    let shared = 0;
    let dual = 0;
    for (const c of conflictMap.values()) {
      if (c.kind === "double") double += 1;
      else if (c.kind === "advance_risk") advance += 1;
      else if (c.kind === "dual_week") dual += 1;
      else shared += 1;
    }
    return { double, advance, shared, dual };
  }, [conflictMap]);

  const byeCount = useMemo(() => {
    if (!preview) return 0;
    return preview.rows.filter(isByePreviewRow).length;
  }, [preview]);

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    const phaseFilter = filter === "vacation" ? "all" : filter;
    let rows = preview.rows.filter((r) => r.phase !== "vacation");
    if (phaseFilter !== "all") {
      rows = rows.filter((r) => r.phase === phaseFilter);
    }
    if (!showByes) {
      rows = rows.filter((r) => !isByePreviewRow(r));
    }
    return [...rows].sort(compareUnifiedPreviewRows);
  }, [preview, filter, showByes]);

  useEffect(() => {
    if (filter === "vacation") setFilter("all");
  }, [filter]);

  useEffect(() => {
    if (!preview && !error) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [preview, error]);

  return (
    <Card className="border-primary/20 shadow-lg">
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
          <Button
            type="button"
            className="w-full sm:w-auto min-h-[44px]"
            onClick={() => {
              void onGenerate();
            }}
            disabled={disabled || loading || confirming}
            loading={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Preview genereren…
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" aria-hidden />
                Preview genereren
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto min-h-[44px] border-sky-400/70 text-sky-950 hover:bg-sky-50"
            onClick={() => {
              void onGenerate({ allowDualMatchWeek: true });
            }}
            disabled={disabled || loading || confirming}
            aria-label="Schema forceren met max twee wedstrijden per week per ploeg, minstens twee dagen ertussen"
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            Schema forceren (max. 2×/week)
          </Button>

          {commitSummary?.canConfirm && onConfirm ? (
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setShowConfirm(true)}
              disabled={disabled || loading || confirming || !!error}
              loading={confirming}
            >
              {confirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Opslaan in database…
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" aria-hidden />
                  Bevestigen en opslaan
                </>
              )}
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Past de normale preview niet? Die probeert automatisch opnieuw met max.
          2 wedstrijden per ploeg per week en minstens 2 dagen ertussen (ook t.o.v.
          beker / doorstroming). “Schema forceren” doet dat meteen.
        </p>

        {commitSummary?.canConfirm ? (
          <Alert className="border-emerald-300/60 bg-emerald-50/80">
            <CheckCircle2 className="h-4 w-4 text-emerald-800" aria-hidden />
            <AlertTitle className="text-emerald-950">Klaar om op te slaan</AlertTitle>
            <AlertDescription className="text-sm text-emerald-950/90 space-y-1">
              <p>
                Organisatie: <span className="font-medium">{commitSummary.orgLabel}</span>{" "}
                (id {commitSummary.organizationId})
              </p>
              <ul className="list-disc pl-5">
                {commitSummary.parts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Dit schrijft de preview naar de database. Bestaande wedstrijden van hetzelfde type
                blokkeren de import (eerst seizoen afsluiten).
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <AppAlertModal
          open={showConfirm}
          onOpenChange={setShowConfirm}
          title="Seizoensplanning opslaan"
          description={
            <InfoConfirmDescription
              message={
                <>
                  Wedstrijden opslaan voor{" "}
                  <span className="font-semibold">
                    {commitSummary?.orgLabel ?? "deze organisatie"}
                  </span>
                  {commitSummary ? ` (id ${commitSummary.organizationId})` : ""}?
                  {commitSummary?.parts.length ? (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {commitSummary.parts.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              }
              note="Volgorde: beker → competitie → play-offs. organization_id komt uit je sessie (Kuurne = 2). Bestaande wedstrijden worden niet overschreven."
            />
          }
          confirmAction={{
            label: "Bevestigen en opslaan",
            onClick: () => {
              setShowConfirm(false);
              void onConfirm?.();
            },
            variant: "primary",
            disabled: confirming,
            loading: confirming,
          }}
          cancelAction={{
            label: "Annuleren",
            onClick: () => setShowConfirm(false),
            disabled: confirming,
          }}
          size="sm"
        />

        {disabled && !loading ? (
          <p className="text-sm text-muted-foreground">
            Preview is beschikbaar zodra seizoensperiode en teams geladen zijn.
          </p>
        ) : null}

        {loading ? (
          <div
            className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-muted/40 px-4 py-6 sm:py-8"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-start gap-3">
              <Loader2
                className="h-8 w-8 shrink-0 animate-spin text-primary mt-0.5"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-brand-dark">
                  Preview wordt gegenereerd…
                  {typeof progress?.percent === "number"
                    ? ` ${Math.round(progress.percent)}%`
                    : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {progress?.label ??
                    "Beker, competitie en play-offs worden ingepland. Je mag van pagina wisselen — de preview blijft bewaard."}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Progress
                value={Math.max(0, Math.min(100, progress?.percent ?? 8))}
                className="h-2.5"
                aria-label={`Voortgang ${Math.round(progress?.percent ?? 0)} procent`}
              />
              <p className="text-xs text-muted-foreground text-center sm:text-left">
                De rest van de site blijft bruikbaar tijdens het genereren.
              </p>
            </div>
          </div>
        ) : null}

        <div ref={resultsRef} className="space-y-4" aria-live="polite">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Preview mislukt</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {preview?.warnings.length ? (
            <Alert className="border-primary/20">
              <Info className="h-4 w-4" aria-hidden />
              <AlertDescription className="text-sm space-y-1">
                {preview.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          {preview ? (
            <>
              <ul className="flex flex-wrap gap-2" aria-label="Preview per systeem">
                {preview.sections.map((s) => (
                  <li key={s.phase}>
                    <Badge
                      variant={s.success ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {s.success
                        ? `${s.label}: ${s.message}`
                        : s.message.startsWith("Bijna:")
                          ? `${s.label}: bijna`
                          : `${s.label}: mislukt`}
                    </Badge>
                  </li>
                ))}
              </ul>

              {preview.sections.some((s) => !s.success) ? (
                <Alert className="border-destructive/30 bg-destructive/5">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <AlertTitle className="text-destructive">
                    {preview.sections.some(
                      (s) => !s.success && s.message.startsWith("Bijna:"),
                    )
                      ? "Bijna gelukt"
                      : "Preview deels mislukt"}
                  </AlertTitle>
                  <AlertDescription className="text-sm space-y-4">
                    {preview.sections
                      .filter((s) => !s.success)
                      .map((s) => (
                        <div key={s.phase} className="space-y-3">
                          <p>{s.message}</p>
                          {s.suggestions?.length ? (
                            <div className="space-y-2 rounded-md border border-primary/20 bg-background/80 p-3">
                              <p className="font-medium text-brand-dark">
                                Wat kun je doen?
                              </p>
                              <ol className="list-decimal space-y-2 pl-5">
                                {s.suggestions.map((tip) => (
                                  <li key={tip.id} className="space-y-0.5">
                                    <span className="font-medium text-foreground">
                                      {tip.title}
                                    </span>
                                    <span className="block text-muted-foreground">
                                      {tip.detail}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                              {s.suggestions.some((t) => t.id === "regenerate") ? (
                                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="min-h-[44px]"
                                    disabled={loading}
                                    onClick={() => {
                                      void onGenerate();
                                    }}
                                  >
                                    Opnieuw genereren
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="min-h-[44px] border-sky-400/70 text-sky-950"
                                    disabled={loading}
                                    onClick={() => {
                                      void onGenerate({ allowDualMatchWeek: true });
                                    }}
                                  >
                                    Schema forceren (max. 2×/week)
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filter preview"
              >
                {(
                  [
                    ["all", "Alles"],
                    ["competition", "Competitie"],
                    ["cup", "Beker"],
                    ["playoff", "Play-off"],
                    ["free", "Vrij"],
                    ["blocked", "Gesloten"],
                  ] as const
                ).map(([key, label]) => {
                  const visible = preview.rows.filter(
                    (r) => r.phase !== "vacation" && (showByes || !isByePreviewRow(r)),
                  );
                  const count =
                    key === "all"
                      ? visible.length
                      : visible.filter((r) => r.phase === key).length;
                  if (key !== "all" && count === 0) return null;
                  return (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={filter === key ? "default" : "outline"}
                      className="min-h-[44px]"
                      onClick={() => setFilter(key)}
                    >
                      {label} ({count})
                    </Button>
                  );
                })}
                {byeCount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={showByes ? "default" : "outline"}
                    className="min-h-[44px]"
                    onClick={() => setShowByes((v) => !v)}
                    aria-pressed={showByes}
                  >
                    {showByes ? "BYE verbergen" : `BYE tonen (${byeCount})`}
                  </Button>
                ) : null}
              </div>

              {filteredRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen speelmomenten in deze preview. Pas de opzet aan of vernieuw de kalender
                  (bekerweken) en probeer opnieuw.
                </p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-medium text-brand-dark">
                      {filteredRows.length} rijen
                      {filter === "all"
                        ? [
                            preview.rows.some((r) => r.phase === "free")
                              ? `${preview.rows.filter((r) => r.phase === "free").length} leeg`
                              : null,
                            preview.rows.some((r) => r.phase === "blocked")
                              ? `${preview.rows.filter((r) => r.phase === "blocked").length} gesloten`
                              : null,
                          ]
                            .filter(Boolean)
                            .map((s) => ` · ${s}`)
                            .join("")
                        : ""}
                    </p>
                    <ul
                      className="flex flex-wrap gap-3 text-xs text-muted-foreground"
                      aria-label="Legende conflicten"
                    >
                      <li className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
                        <span
                          className={CONFLICT_STYLE.double.className}
                          aria-hidden
                        >
                          Ploeg
                        </span>
                        <span>
                          2× dezelfde week
                          {conflictCounts.double > 0
                            ? ` (${conflictCounts.double})`
                            : ""}
                        </span>
                      </li>
                      <li className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
                        <span
                          className={CONFLICT_STYLE.advance_risk.className}
                          aria-hidden
                        >
                          Ploeg
                        </span>
                        <span>
                          Risico doorstroming (deze week)
                          {conflictCounts.advance > 0
                            ? ` (${conflictCounts.advance})`
                            : ""}
                        </span>
                      </li>
                      <li className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
                        <span
                          className={CONFLICT_STYLE.shared_week.className}
                          aria-hidden
                        >
                          Ploeg
                        </span>
                        <span>
                          Beker + competitie, ≥3 dagen ertussen (toegestaan)
                          {conflictCounts.shared > 0
                            ? ` (${conflictCounts.shared})`
                            : ""}
                        </span>
                      </li>
                      <li className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
                        <span
                          className={CONFLICT_STYLE.dual_week.className}
                          aria-hidden
                        >
                          Ploeg
                        </span>
                        <span>
                          2× competitie deze week (toegestaan)
                          {conflictCounts.dual > 0
                            ? ` (${conflictCounts.dual})`
                            : ""}
                        </span>
                      </li>
                    </ul>
                  </div>

                  <ul className="space-y-2 md:hidden">
                    {filteredRows.map((row, idx) => {
                      const badge = PHASE_BADGE[row.phase];
                      const isFree = row.phase === "free";
                      const isMarker =
                        row.phase === "vacation" || row.phase === "blocked";
                      return (
                        <li
                          key={`${row.phase}-${row.match_date}-${row.match_time ?? ""}-${idx}`}
                          className={cn(
                            "rounded-lg border p-3 space-y-1",
                            isFree
                              ? "border-dashed border-primary/20 bg-muted/20"
                              : isMarker
                                ? "border-dashed border-muted-foreground/30 bg-muted/30"
                                : "border-primary/15",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", badge.className)}
                            >
                              {badge.label}
                            </Badge>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatDate(row.match_date)}
                              {row.match_time ? ` · ${row.match_time}` : ""}
                            </span>
                          </div>
                          {isFree || isMarker ? (
                            <p className="text-sm text-muted-foreground">
                              {row.note || (isFree ? "Leeg speelmoment" : badge.label)}
                            </p>
                          ) : (
                            <p className="text-sm font-medium text-brand-dark">
                              <TeamCell row={row} side="home" lookup={conflictMap} />{" "}
                              <span className="text-muted-foreground font-normal">vs</span>{" "}
                              <TeamCell row={row} side="away" lookup={conflictMap} />
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {previewRoundLabel(row) !== "—"
                              ? `${previewRoundLabel(row)} · ${row.speeldag}`
                              : row.speeldag}
                          </p>
                          {row.note && !isFree && !isMarker ? (
                            <p className="text-xs text-muted-foreground italic">{row.note}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="hidden md:block w-full overflow-x-auto rounded-md border border-primary/15 max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium">Fase</th>
                          <th className="text-left p-2 font-medium">Ronde</th>
                          <th className="text-left p-2 font-medium">Speeldag</th>
                          <th className="text-left p-2 font-medium">Thuis</th>
                          <th className="text-left p-2 font-medium">Uit</th>
                          <th className="text-left p-2 font-medium">Datum</th>
                          <th className="text-left p-2 font-medium">Tijd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, idx) => {
                          const badge = PHASE_BADGE[row.phase];
                          const isFree = row.phase === "free";
                          const isMarker =
                            row.phase === "vacation" || row.phase === "blocked";
                          return (
                            <tr
                              key={`${row.phase}-${row.match_date}-${row.match_time ?? ""}-${idx}`}
                              className={cn(
                                "border-t border-primary/10",
                                (isFree || isMarker) && "bg-muted/20 text-muted-foreground",
                              )}
                            >
                              <td className="p-2">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px]", badge.className)}
                                >
                                  {badge.label}
                                </Badge>
                              </td>
                              <td className="p-2 whitespace-nowrap">
                                {previewRoundLabel(row)}
                              </td>
                              <td className="p-2 whitespace-nowrap">{row.speeldag}</td>
                              <td className="p-2">
                                {isFree ? (
                                  <span className="italic">Leeg</span>
                                ) : isMarker ? (
                                  <span className="italic">{row.note || badge.label}</span>
                                ) : (
                                  <TeamCell row={row} side="home" lookup={conflictMap} />
                                )}
                              </td>
                              <td className="p-2">
                                {isFree || isMarker ? (
                                  <span aria-hidden>—</span>
                                ) : (
                                  <TeamCell row={row} side="away" lookup={conflictMap} />
                                )}
                              </td>
                              <td className="p-2 tabular-nums whitespace-nowrap">
                                {formatDate(row.match_date)}
                              </td>
                              <td className="p-2 tabular-nums">{row.match_time || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(SeasonUnifiedPreviewPanel);
