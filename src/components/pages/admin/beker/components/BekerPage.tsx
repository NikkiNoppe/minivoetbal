import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppAlertModal, InfoConfirmDescription } from "@/components/modals";
import { Loader2, Trophy, AlertCircle, CheckCircle, Archive, Award } from "lucide-react";
import { PageHeader } from "@/components/layout";
import ArchiveCupModal from "@/components/modals/admin/ArchiveCupModal";

import BekerDateSelector from "./BekerDateSelector";
import { teamService, Team } from "@/services/core";
import { bekerService } from "@/services/match/cupService";
import AdminTeamSelector from "@/components/pages/admin/common/components/AdminTeamSelector";
import { supabase } from "@/integrations/supabase/client";
import { seasonService } from "@/services";
import { describeCupPlan, getCupBracketPlan } from "@/lib/cupBracketPlan";
import {
  buildSeasonSlotGrids,
  buildSlotDetailsFromSeasonData,
  listSeasonPlayableWeeks,
  resolveEffectiveSlotsPerWeek,
} from "@/lib/seasonCalendar";
import { filterActiveSlotUnavailability } from "@/services/slotUnavailabilityService";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { cn } from "@/lib/utils";

const BekerPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { toast } = useToast();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const [showDateSelector, setShowDateSelector] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<number[]>([]);
  const [tournamentDates, setTournamentDates] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [existingCup, setExistingCup] = useState<null | {
    voorronde: any[];
    achtste_finales: any[];
    kwartfinales: any[];
    halve_finales: any[];
    finale: any | null;
  }>(null);
  const [byeTeamId, setByeTeamId] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dateRationale, setDateRationale] = useState<string[]>([]);
  const [previewPlan, setPreviewPlan] = useState<Array<{
    unique_number: string;
    speeldag: string;
    home_team_id: number | null;
    away_team_id: number | null;
    match_date: string;
    match_time: string;
    venue: string;
    slot_index: number;
    details: { homeScore?: number; awayScore?: number; combined?: number; maxCombined: number; priority?: number; day_of_week?: number }
  }> | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [slotsPerWeek, setSlotsPerWeek] = useState(7);
  const teamNameById = useMemo(() => {
    const map = new Map<number, string>();
    teams.forEach(t => map.set(t.team_id, t.team_name));
    return map;
  }, [teams]);

  const cupPlan = useMemo(
    () => getCupBracketPlan(selectedTeams.length, slotsPerWeek),
    [selectedTeams.length, slotsPerWeek],
  );

  // Load teams + cup for de actieve organisatie
  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;

    const loadInitial = async () => {
      try {
        setLoading(true);
        setExistingCup(null);
        setSelectedTeams([]);
        setTournamentDates([]);
        setPreviewPlan(null);
        setPreviewTotal(null);
        setByeTeamId(null);
        setDateRationale([]);

        const [teamsData, cupData, seasonData] = await Promise.all([
          teamService.getAllTeams(),
          bekerService.getCupMatches(organizationId).catch(() => null),
          seasonService.getSeasonData(organizationId).catch(() => null),
        ]);
        setTeams(teamsData);
        if (cupData) setExistingCup(cupData);

        // Prefill teams vanuit Seizoensopzet (alle teams)
        const setup = seasonData?.season_setup;
        if (!cupData && setup?.systems?.cup && setup.cup?.useAllTeams && teamsData.length > 0) {
          setSelectedTeams(teamsData.map((t: { team_id: number }) => t.team_id));
        }

        const nominal = seasonData?.venue_timeslots?.length || 7;
        if (seasonData?.season_start_date && seasonData?.season_end_date) {
          const slotDetails = buildSlotDetailsFromSeasonData(seasonData);
          const playable = listSeasonPlayableWeeks(
            seasonData.season_start_date,
            seasonData.season_end_date,
            seasonData.vacation_periods || [],
          );
          const grids = buildSeasonSlotGrids({
            weekMondays: playable,
            slotDetails,
            blocks: filterActiveSlotUnavailability(seasonData.slot_unavailability),
            vacations: seasonData.vacation_periods || [],
          });
          const effective = resolveEffectiveSlotsPerWeek(grids, nominal);
          setSlotsPerWeek(Math.max(1, effective || nominal));
        } else {
          setSlotsPerWeek(Math.max(1, nominal));
        }

        // Defensive fallback: ensure all winners are advanced to their next round.
        // Catches edge cases where matches were updated outside the normal flow.
        try {
          const reconcileResult = await bekerService.reconcileAdvancements();
          if (reconcileResult.success && reconcileResult.advancedCount > 0) {
            console.log(`[BekerPage] Reconciled bracket: ${reconcileResult.message}`);
            const refreshed = await bekerService.getCupMatches(organizationId).catch(() => null);
            if (refreshed) setExistingCup(refreshed);
            toast({
              title: "Bracket gesynchroniseerd",
              description: reconcileResult.message,
            });
          }
        } catch (reconcileErr) {
          console.warn('[BekerPage] Reconciliation skipped:', reconcileErr);
        }
      } catch (error) {
        console.error('Error loading initial beker data:', error);
        toast({
          title: "Fout bij laden",
          description:
            error instanceof Error ? error.message : "Kon data niet laden",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadInitial();
  }, [toast, orgQueryEnabled, organizationId]);

  const reloadExistingCup = useCallback(async () => {
    if (organizationId == null) {
      setExistingCup(null);
      return;
    }
    try {
      const cupData = await bekerService.getCupMatches(organizationId);
      setExistingCup(cupData);
    } catch (e) {
      setExistingCup(null);
    }
  }, [organizationId]);

  // Realtime: alleen cup-matches van de actieve organisatie
  useEffect(() => {
    if (organizationId == null) return;

    const channel = supabase
      .channel(`cup-matches-live-${organizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `is_cup_match=eq.true,organization_id=eq.${organizationId}`,
      }, () => {
        reloadExistingCup();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.debug('Realtime connection unavailable, continuing without live updates');
        }
      });
    return () => {
      try { supabase.removeChannel(channel); } catch (_) {}
    };
  }, [reloadExistingCup, organizationId]);

  // Reset speeldata wanneer het benodigde aantal weken wijzigt
  useEffect(() => {
    if (tournamentDates.length > 0 && tournamentDates.length !== cupPlan.requiredWeeks) {
      setTournamentDates([]);
      setDateRationale([]);
      setPreviewPlan(null);
      setPreviewTotal(null);
    }
  }, [cupPlan.requiredWeeks, tournamentDates.length]);

  const handleCancelTournament = useCallback(() => {
    setSelectedTeams([]);
    setTournamentDates([]);
    setDateRationale([]);
    setByeTeamId(null);
    setPreviewPlan(null);
    setPreviewTotal(null);
    toast({ title: "Geannuleerd", description: "Teams en speeldata gewist." });
  }, [toast]);

  // Memoize team selection handler
  const handleTeamSelection = useCallback((teamId: number) => {
    setSelectedTeams(prev => {
      if (prev.includes(teamId)) {
        return prev.filter(id => id !== teamId);
      } else {
        return [...prev, teamId];
      }
    });
  }, []);

  const handleResolvedCupPlan = useCallback(
    (plan: {
      requiredWeeks: number;
      firstRoundWeeks: number;
      effectiveSlotsPerWeek: number;
    }) => {
      if (plan.effectiveSlotsPerWeek > 0) {
        setSlotsPerWeek(plan.effectiveSlotsPerWeek);
      }
    },
    [],
  );

  const handleDatesSelected = useCallback((dates: string[], rationale?: string[]) => {
    setTournamentDates(dates);
    setDateRationale(rationale ?? []);
    setPreviewPlan(null);
    setPreviewTotal(null);
    setShowDateSelector(false);
    toast({
      title: "Data geselecteerd",
      description: `${dates.length} speeldata zijn geselecteerd voor de beker`,
    });
  }, [toast]);

  // Memoize cancel handler
  const handleCancelDateSelection = useCallback(() => {
    setShowDateSelector(false);
    setByeTeamId(null);
  }, []);

  // Memoize tournament creation handler
  const handleCreateTournament = useCallback(async () => {
    const requiredWeeks = cupPlan.requiredWeeks;
    if (selectedTeams.length < 2) {
      toast({ title: "Onvoldoende teams", description: "Selecteer minstens 2 teams", variant: "destructive" });
      return;
    }
    if (tournamentDates.length !== requiredWeeks) {
      toast({ title: "Onvoldoende data", description: `Selecteer exact ${requiredWeeks} speeldata`, variant: "destructive" });
      return;
    }
    if (selectedTeams.length % 2 === 1 && !byeTeamId) {
      toast({ title: "Selecteer bye team", description: "Bij oneven aantal teams moet één team vrijgesteld worden.", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      // If a preview exists, confirm importing that exact plan for determinisme
      let createResult: { success: boolean; message: string };
      if (previewPlan && previewPlan.length > 0) {
        createResult = await bekerService.createCupFromPlan(previewPlan);
      } else {
        createResult = await bekerService.createCupTournament(selectedTeams, tournamentDates, byeTeamId, organizationId ?? undefined);
      }
      if (createResult.success) {
        toast({ title: "Beker aangemaakt", description: createResult.message });
        // Assign bye team to QF-1 if applicable
        if (selectedTeams.length % 2 === 1 && byeTeamId) {
          const assign = await bekerService.assignTeamToMatch('QF-1', true, byeTeamId);
          if (!assign.success) {
            toast({ title: "Bye toewijzing mislukt", description: assign.message, variant: "destructive" });
          }
        }
        setSelectedTeams([]);
        setTournamentDates([]);
        setDateRationale([]);
        setByeTeamId(null);
        setPreviewPlan(null);
        setPreviewTotal(null);
        await reloadExistingCup();
      } else {
        toast({ title: "Fout bij aanmaken", description: createResult.message, variant: "destructive" });
      }
    } catch (error) {
      console.error('Error creating tournament:', error);
      toast({
        title: "Fout",
        description: "Kan beker niet aanmaken",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  }, [selectedTeams, tournamentDates, toast, reloadExistingCup, cupPlan.requiredWeeks, previewPlan, byeTeamId, organizationId]);

  const handleGeneratePreview = useCallback(async () => {
    const requiredWeeks = cupPlan.requiredWeeks;
    if (selectedTeams.length < 2) {
      toast({ title: "Onvoldoende teams", description: "Selecteer minstens 2 teams", variant: "destructive" });
      return;
    }
    if (tournamentDates.length !== requiredWeeks) {
      toast({ title: "Onvoldoende data", description: `Selecteer exact ${requiredWeeks} speeldata`, variant: "destructive" });
      return;
    }
    if (selectedTeams.length % 2 === 1 && !byeTeamId) {
      toast({
        title: "Selecteer bye-team",
        description: "Bij oneven aantal teams moet je eerst een bye-team kiezen bij de speeldata.",
        variant: "destructive",
      });
      return;
    }
    setIsPreviewing(true);
    try {
      const res = await bekerService.previewCupTournament(
        selectedTeams,
        tournamentDates,
        12,
        byeTeamId || null,
        organizationId ?? undefined,
      );
      if (!res.success || !res.plan || res.plan.length === 0) {
        toast({
          title: "Preview mislukt",
          description: res.message || "Geen plan gegenereerd",
          variant: "destructive",
        });
        setPreviewPlan(null);
        setPreviewTotal(null);
        return;
      }
      setPreviewPlan(res.plan);
      setPreviewTotal(res.totalCombined ?? null);
      toast({
        title: "Preview klaar",
        description: `Preview bevat ${res.plan.length} wedstrijden (totale score ${res.totalCombined ?? "-"}).`,
      });
    } catch (e) {
      toast({
        title: "Preview fout",
        description: e instanceof Error ? e.message : "Er ging iets mis bij genereren",
        variant: "destructive",
      });
      setPreviewPlan(null);
      setPreviewTotal(null);
    } finally {
      setIsPreviewing(false);
    }
  }, [selectedTeams, tournamentDates, toast, byeTeamId, cupPlan.requiredWeeks, organizationId]);

  // Memoize validation states
  const canCreateTournament = useMemo(() => {
    const requiredWeeks = cupPlan.requiredWeeks;
    const hasBasics = selectedTeams.length >= 2 && tournamentDates.length === requiredWeeks;
    const needsBye = selectedTeams.length % 2 === 1;
    return hasBasics && (!needsBye || !!byeTeamId);
  }, [selectedTeams.length, tournamentDates.length, byeTeamId, cupPlan.requiredWeeks]);

  const canSelectDates = useMemo(() => selectedTeams.length >= 2, [selectedTeams.length]);

  const hasExistingCup = useMemo(() => {
    if (!existingCup) return false;
    const total =
      (existingCup.voorronde?.length || 0) +
      (existingCup.achtste_finales?.length || 0) +
      (existingCup.kwartfinales?.length || 0) +
      (existingCup.halve_finales?.length || 0) +
      (existingCup.finale ? 1 : 0);
    return total > 0;
  }, [existingCup]);

  const cupCounts = useMemo(() => {
    return {
      total:
        (existingCup?.voorronde?.length || 0) +
        (existingCup?.achtste_finales?.length || 0) +
        (existingCup?.kwartfinales?.length || 0) +
        (existingCup?.halve_finales?.length || 0) +
        (existingCup?.finale ? 1 : 0),
      voorronde: existingCup?.voorronde?.length || 0,
      achtste: existingCup?.achtste_finales?.length || 0,
      kwart: existingCup?.kwartfinales?.length || 0,
      halve: existingCup?.halve_finales?.length || 0,
      finale: existingCup?.finale ? 1 : 0,
    };
  }, [existingCup]);

  if (!orgQueryEnabled || organizationId == null || loading) {
    return (
      <div className="flex justify-center items-center py-8" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Laden…</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", !embedded && "animate-slide-up")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {!embedded ? (
          <PageHeader
            className="mb-0 min-w-0 flex-1"
            title="Beker"
            subtitle="Beheer het bekertoernooi — aanmaken, verwijderen en overzicht"
            icon={Award}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-brand-dark">Beker aanmaken</h2>
            <p className="text-sm text-muted-foreground">
              Teams, speeldata en preview binnen dit seizoen
            </p>
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => setShowArchiveModal(true)}
          className="w-full shrink-0 border-amber-400/70 text-amber-950 hover:bg-amber-50 hover:text-amber-950 sm:w-auto"
        >
          <Archive className="w-4 h-4 mr-2" />
          Beker archiveren
        </Button>
      </div>

      <ArchiveCupModal open={showArchiveModal} onOpenChange={setShowArchiveModal} organizationId={organizationId} />

      <section className="space-y-6 mt-6">
        {/* Nieuwe Beker Aanmaken */}
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe Beker Aanmaken</CardTitle>
            <CardDescription>
              {selectedTeams.length >= 2
                ? `Maak een bekertoernooi aan: ${describeCupPlan(cupPlan)}`
                : "Selecteer teams om het aantal speelweken automatisch te bepalen"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-base">Teams Selecteren</CardTitle>
                  <Button onClick={() => setShowDateSelector(true)} disabled={!canSelectDates} className="btn btn--primary">
                    <Trophy className="mr-2 h-4 w-4" /> Speeldata Selecteren
                  </Button>
                </div>
                <AdminTeamSelector
                  teams={teams}
                  selectedIds={selectedTeams}
                  onToggle={handleTeamSelection}
                  onSelectAll={() => setSelectedTeams(teams.map(t => t.team_id))}
                  onClearAll={() => setSelectedTeams([])}
                />
                <div className="mt-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{selectedTeams.length} / {teams.length} geselecteerd</Badge>
                  <span className="ml-2">
                    Minstens 2 teams.{" "}
                    {selectedTeams.length >= 2
                      ? `${cupPlan.requiredWeeks} speelweken nodig: ${cupPlan.rounds
                          .map((r) =>
                            r.byeCount > 0
                              ? `${r.name} (${r.matchCount}w/${r.byeCount} bye)`
                              : `${r.name} (${r.matchCount})`,
                          )
                          .join(" → ")}.`
                      : "Speelweken worden berekend op basis van teams en tijdslots."}
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <CardTitle className="mb-2 text-base">Speeldata</CardTitle>
                  {tournamentDates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nog geen speeldata geselecteerd</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        {tournamentDates.map((date, index) => {
                          const label =
                            cupPlan.roundLabels.flatMap((r) =>
                              r.type === "group"
                                ? r.subRounds.map((s) => `${r.name} — ${s.name}`)
                                : [r.name],
                            )[index] ?? `Speelweek ${index + 1}`;
                          return (
                            <div key={index} className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded min-h-[44px]">
                              <span className="text-sm">{label}</span>
                              <span className="text-sm font-medium shrink-0 tabular-nums">
                                {new Date(`${date}T12:00:00`).toLocaleDateString("nl-BE")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {dateRationale.length > 0 ? (
                        <div className="rounded-lg border border-primary/20 bg-brand-50/50 p-3 space-y-1.5">
                          <p className="text-sm font-medium text-brand-dark">
                            Waarom deze data
                          </p>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                            {dateRationale.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    disabled={isPreviewing || !canCreateTournament}
                    className="sm:flex-1"
                    onClick={handleGeneratePreview}
                  >
                    {isPreviewing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preview genereren...</> : "Preview genereren"}
                  </Button>
                  <Button
                    disabled={!canCreateTournament || isCreating}
                    className="sm:flex-1"
                    onClick={() => setShowConfirm(true)}
                  >
                    {isCreating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Beker aanmaken...</> : (previewPlan ? "Bevestigen en importeren" : "Beker Aanmaken")}
                  </Button>
                  <Button variant="secondary" onClick={handleCancelTournament} disabled={isCreating}>
                    Annuleren
                  </Button>
                </div>

                <AppAlertModal
                  open={showConfirm}
                  onOpenChange={setShowConfirm}
                  title="Beker Aanmaken"
                  description={
                    <InfoConfirmDescription
                      message={
                        <>
                          Weet je zeker dat je de beker wilt aanmaken met{" "}
                          <span className="font-semibold">{selectedTeams.length} teams</span> en{" "}
                          <span className="font-semibold">{tournamentDates.length} speeldata</span>?
                        </>
                      }
                      note="Controleer teams en speeldata voordat je bevestigt."
                    />
                  }
                  confirmAction={{
                    label: previewPlan ? "Bevestigen en importeren" : "Beker Aanmaken",
                    onClick: () => {
                      setShowConfirm(false);
                      handleCreateTournament();
                    },
                    variant: "primary",
                    disabled: isCreating,
                    loading: isCreating,
                  }}
                  cancelAction={{
                    label: "Annuleren",
                    onClick: () => setShowConfirm(false),
                    disabled: isCreating,
                  }}
                  size="sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {previewPlan && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Beker (scores per match)</CardTitle>
              <CardDescription>
                Geplande wedstrijden met gecombineerde voorkeur-score (max 6). Totale score: {previewTotal ?? '-'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="w-full overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead className="tableHead">
                    <tr>
                      <th className="text-left">Speeldag</th>
                      <th className="text-left">Home</th>
                      <th className="text-left">Away</th>
                      <th className="text-left">Datum</th>
                      <th className="text-left">Tijd</th>
                      <th className="text-left">Venue</th>
                      <th className="text-left">Score (home+away/max)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPlan.map((p, idx) => (
                      <tr key={idx}>
                        <td>{p.speeldag}</td>
                        <td>{p.home_team_id ? (teamNameById.get(p.home_team_id) || p.home_team_id) : '-'}</td>
                        <td>{p.away_team_id ? (teamNameById.get(p.away_team_id) || p.away_team_id) : '-'}</td>
                        <td>{new Date(p.match_date).toLocaleDateString('nl-NL')}</td>
                        <td>{p.match_time}</td>
                        <td>{p.venue}</td>
                        <td>{(p.details?.homeScore ?? 0)} + {(p.details?.awayScore ?? 0)} = {(p.details?.combined ?? 0)} / {p.details?.maxCombined}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Beker Beheren */}
        <Card>
          <CardHeader>
            <CardTitle>Beker Beheren</CardTitle>
            <CardDescription>Bekijk en beheer het huidige bekertoernooi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasExistingCup ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Er is een bekertoernooi actief met {cupCounts.total} wedstrijden.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {cupCounts.voorronde > 0 ? (
                    <div>• Voorronde: {cupCounts.voorronde}</div>
                  ) : null}
                  <div>• Achtste finales: {cupCounts.achtste}</div>
                  <div>• Kwartfinales: {cupCounts.kwart}</div>
                  <div>• Halve finales: {cupCounts.halve}</div>
                  <div>• Finale: {cupCounts.finale}</div>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Er is momenteel geen bekertoernooi actief. Maak een nieuwe beker aan om te beginnen.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </section>

      <BekerDateSelector
        open={showDateSelector}
        onOpenChange={(open) => {
          if (!open) handleCancelDateSelection();
          else setShowDateSelector(true);
        }}
        onDatesSelected={handleDatesSelected}
        isLoading={isCreating}
        weeks={cupPlan.requiredWeeks}
        firstRoundWeeks={cupPlan.firstRoundWeeks}
        organizationId={organizationId}
        cupTeamCount={selectedTeams.length}
        allowByeSelection={selectedTeams.length % 2 === 1}
        teamsForBye={teams
          .filter((t) => selectedTeams.includes(t.team_id))
          .map((t) => ({ team_id: t.team_id, team_name: t.team_name }))}
        onByeSelected={setByeTeamId}
        onResolvedPlan={handleResolvedCupPlan}
      />
    </div>
  );
};

export default React.memo(BekerPage); 