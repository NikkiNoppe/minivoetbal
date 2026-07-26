import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppAlertModal, InfoConfirmDescription } from "@/components/modals";
import { Loader2, AlertCircle, CheckCircle, Archive, Trophy } from "lucide-react";
import ArchiveSeasonModal from "@/components/modals/admin/ArchiveSeasonModal";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useSeasonDataScope } from "@/hooks/useSeasonDataScope";
import { ADMIN_ROUTES } from "@/config/routes";
import { competitionService, CompetitionConfig } from "@/services/match/competitionService";
import type { CompetitionFormat } from "@/services/competitionDataService";
import { normalizeCompetitionFormats } from "@/services/competitionDataService";
import { SEASON_SETUP_FORMAT_ID } from "@/lib/seasonSetup";
import { teamService } from "@/services/core/teamService";
import AdminTeamSelector from "@/components/pages/admin/common/components/AdminTeamSelector";
import {
  DivisionTeamAssigner,
  type DivisionTeamAssignment,
} from "@/components/pages/admin/competition/DivisionTeamAssigner";
import { PageHeader, PUBLIC_CARD_CLASS } from "@/components/layout";
import { cn } from "@/lib/utils";
import { countVacationWeeksInRange, uniqueMondaysFromDates } from "@/lib/competitionPlanningEstimate";
import {
  buildSlotDetailsFromSeasonData,
  estimateSeasonPlanning,
} from "@/lib/seasonCalendar";
import { filterActiveSlotUnavailability } from "@/services/slotUnavailabilityService";

const AdminCompetitionPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { organizationId, orgQueryEnabled, getSeasonData } = useSeasonDataScope();
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [formats, setFormats] = useState<CompetitionFormat[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [selectedTeams, setSelectedTeams] = useState<number[]>([]);
  const [teamDivisions, setTeamDivisions] = useState<DivisionTeamAssignment>({});
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [venues, setVenues] = useState<any[]>([]);
  const [timeslots, setTimeslots] = useState<any[]>([]);
  const [vacations, setVacations] = useState<any[]>([]);
  const [slotUnavailability, setSlotUnavailability] = useState<any[]>([]);
  const [cupMatchCount, setCupMatchCount] = useState(0);
  const [cupWeekMondays, setCupWeekMondays] = useState<string[]>([]);
  const [existingCompetition, setExistingCompetition] = useState<any[]>([]);
  const { toast } = useToast();
  const [previewPlan, setPreviewPlan] = useState<Array<{ unique_number: string; speeldag: string; home_team_id: number; away_team_id: number | null; match_date: string; match_time: string; venue: string; details: { homeScore: number; awayScore: number; combined: number; maxCombined: number } }> | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [previewTeamTotals, setPreviewTeamTotals] = useState<Record<number, number> | null>(null);
  const teamNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    teams.forEach((t: any) => map.set(t.team_id, t.team_name));
    return map;
  }, [teams]);

  // Load initial data (season_data = Instellingen → Competitie)
  useEffect(() => {
    if (!orgQueryEnabled || organizationId == null) return;
    void loadInitialData();
  }, [orgQueryEnabled, organizationId]);

  const loadInitialData = async () => {
    try {
      setInitialLoading(true);
      // Load teams
      const teamsData = await teamService.getAllTeams();
      setTeams(teamsData);

      const seasonData = await getSeasonData();
      const formatsList = normalizeCompetitionFormats(seasonData.competition_formats || []);
      setFormats(formatsList);
      setVenues(seasonData.venues || []);
      setTimeslots(seasonData.venue_timeslots || []);
      setVacations(seasonData.vacation_periods || []);
      setSlotUnavailability(seasonData.slot_unavailability || []);

      // Set default dates from season data
      if (seasonData.season_start_date && seasonData.season_end_date) {
        setStartDate(seasonData.season_start_date);
        setEndDate(seasonData.season_end_date);
      }

      // Prefill format + reeks-toewijzing vanuit Seizoensopzet indien aanwezig
      if (formatsList.some((f) => f.id === SEASON_SETUP_FORMAT_ID)) {
        setSelectedFormat(String(SEASON_SETUP_FORMAT_ID));
      }
      const setup = seasonData.season_setup;
      if (setup?.competition?.teamDivisions) {
        const assignment = setup.competition.teamDivisions as Record<number, number>;
        const assignedIds = Object.keys(assignment)
          .map(Number)
          .filter((id) => teamsData.some((t: { team_id: number }) => t.team_id === id));
        if (assignedIds.length > 0) {
          setSelectedTeams(assignedIds);
          setTeamDivisions(assignment);
        }
      }

      // Check for existing competition + beker (reserved weeks)
      const [existingMatches, cupInfo] = await Promise.all([
        competitionService.getCompetitionMatches(),
        competitionService.checkExistingCupMatches(),
      ]);
      setExistingCompetition(existingMatches);
      setCupMatchCount(cupInfo.matchCount ?? 0);
      setCupWeekMondays(uniqueMondaysFromDates(cupInfo.cupDates ?? []));
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: "Fout bij laden",
        description: "Er is een fout opgetreden bij het laden van de data.",
        variant: "destructive"
      });
    } finally {
      setInitialLoading(false);
    }
  };

  const handleCreateCompetition = async () => {
    if (!selectedFormat || selectedTeams.length === 0 || !startDate || !endDate) {
      toast({
        title: "Incomplete gegevens",
        description: "Vul alle verplichte velden in.",
        variant: "destructive"
      });
      return;
    }

    const format = formats.find(f => f.id.toString() === selectedFormat);
    if (!format) {
      toast({
        title: "Ongeldig format",
        description: "Selecteer een geldig competitieformat.",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    try {
      const config: CompetitionConfig = {
        format,
        start_date: startDate,
        end_date: endDate,
        teams: selectedTeams,
        organizationId: organizationId ?? undefined,
        teamDivisions:
          format.has_divisions && (format.divisions?.length ?? 0) >= 2
            ? teamDivisions
            : undefined,
      };

      let createResult: { success: boolean; message: string };
      if (previewPlan && previewPlan.length > 0) {
        createResult = await competitionService.createCompetitionFromPlan(previewPlan);
      } else {
        createResult = await competitionService.generateCompetition(config);
      }

      if (createResult.success) {
        toast({ title: "Competitie aangemaakt", description: createResult.message, variant: "default" });
        const existingMatches = await competitionService.getCompetitionMatches();
        setExistingCompetition(existingMatches);
        setPreviewPlan(null);
        setPreviewTotal(null);
      } else {
        toast({ title: "Fout bij aanmaken", description: createResult.message, variant: "destructive" });
      }
    } catch (error) {
      console.error('Error creating competition:', error);
      toast({
        title: "Fout bij aanmaken",
        description: "Er is een fout opgetreden bij het aanmaken van de competitie.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!selectedFormat || selectedTeams.length === 0 || !startDate || !endDate) {
      toast({ title: "Incomplete gegevens", description: "Vul alle verplichte velden in.", variant: "destructive" });
      return;
    }
    const format = formats.find(f => f.id.toString() === selectedFormat);
    if (!format) {
      toast({ title: "Ongeldig format", description: "Selecteer een geldig competitieformat.", variant: "destructive" });
      return;
    }
    // Force fresh preview each time
    setPreviewPlan(null);
    setPreviewTotal(null);
    setIsPreviewing(true);
    try {
      const config: CompetitionConfig = {
        format,
        start_date: startDate,
        end_date: endDate,
        teams: selectedTeams,
        organizationId: organizationId ?? undefined,
        teamDivisions:
          format.has_divisions && (format.divisions?.length ?? 0) >= 2
            ? teamDivisions
            : undefined,
      };
      const res = await competitionService.previewCompetition(config);
      if (!res.success || !res.plan || res.plan.length === 0) {
        toast({ title: "Preview mislukt", description: res.message || "Geen plan", variant: "destructive" });
        setPreviewPlan(null);
        setPreviewTotal(null);
        setPreviewTeamTotals(null);
        return;
      }
      setPreviewPlan(res.plan);
      setPreviewTotal(res.totalCombined ?? null);
      setPreviewTeamTotals(res.teamTotals ?? null);
      toast({ title: "Preview klaar", description: `Preview bevat ${res.plan.length} wedstrijden (totale score ${res.totalCombined ?? '-'})` });
    } catch (e) {
      toast({ title: "Preview fout", description: "Er ging iets mis bij genereren", variant: "destructive" });
      setPreviewPlan(null);
      setPreviewTotal(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleCancel = () => {
    setSelectedTeams([]);
    setSelectedFormat("");
    setTeamDivisions({});
    setPreviewPlan(null);
    setPreviewTotal(null);
  };

  const handleTeamToggle = (teamId: number) => {
    setSelectedTeams((prev) => {
      const next = prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId];
      return next;
    });
    setTeamDivisions((prev) => {
      if (!(teamId in prev)) return prev;
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setPreviewPlan(null);
    setPreviewTotal(null);
  };

  const selectedFormatObj = formats.find((f) => f.id.toString() === selectedFormat);
  const showDivisionAssigner =
    Boolean(selectedFormatObj?.has_divisions) &&
    (selectedFormatObj?.divisions?.length ?? 0) >= 2;

  const hasExistingCompetition = existingCompetition.length > 0;

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 sm:space-y-6", !embedded && "animate-slide-up")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {!embedded ? (
          <PageHeader
            className="mb-0 min-w-0 flex-1"
            title="Competitie"
            icon={Trophy}
            subtitle="Beheer de competitie — aanmaken, overzicht en seizoen archiveren"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-brand-dark">Competitie aanmaken</h2>
            <p className="text-sm text-muted-foreground">
              Automatische wedstrijdgeneratie binnen dit seizoen
            </p>
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => setShowArchiveModal(true)}
          className="w-full shrink-0 border-amber-400/70 text-amber-950 hover:bg-amber-50 hover:text-amber-950 sm:w-auto"
        >
          <Archive className="w-4 h-4 mr-2" aria-hidden />
          Seizoen archiveren
        </Button>
      </div>

      <ArchiveSeasonModal open={showArchiveModal} onOpenChange={setShowArchiveModal} />

      <section className="space-y-6">
        {/* Competitie Aanmaken */}
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe Competitie Aanmaken</CardTitle>
            <CardDescription>
              Maak een nieuwe competitie aan met automatische wedstrijdgeneratie
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Voorziene presets (alleen-lezen) */}
            <div className="space-y-2">
              <Label>Seizoensinstellingen (alleen-lezen)</Label>
              {(venues.length === 0 || timeslots.length === 0) ? (
                <Alert className="border-primary/20 bg-brand-50/40">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Locaties en tijdstippen staan in{" "}
                    <Link
                      to={ADMIN_ROUTES.settings}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Instellingen → Competitie
                    </Link>
                    . Configureer ze daar vóór je een competitie genereert.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className={cn(PUBLIC_CARD_CLASS, "border border-primary/30 shadow-sm")}>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Seizoensperiode
                    </p>
                    <p className="mt-2 text-base font-semibold text-brand-dark leading-snug">
                      {startDate && endDate ? (
                        <span>
                          {startDate} → {endDate}
                        </span>
                      ) : (
                        <span>Onbekend</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card className={cn(PUBLIC_CARD_CLASS, "border border-primary/30 shadow-sm")}>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Locaties
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-brand-dark tabular-nums">
                      {venues.length}
                    </p>
                    <p className="text-sm text-muted-foreground">locatie(s)</p>
                    {venues.length > 0 ? (
                      <ul className="mt-2 space-y-1 max-h-24 overflow-auto text-sm text-muted-foreground">
                        {venues.map((v: any, idx: number) => (
                          <li key={idx}>• {v.name || v.venue_name || `Locatie ${idx + 1}`}</li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
                <Card className={cn(PUBLIC_CARD_CLASS, "border border-primary/30 shadow-sm")}>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Tijdstippen
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-brand-dark tabular-nums">
                      {timeslots.length}
                    </p>
                    <p className="text-sm text-muted-foreground">tijdstip(pen)</p>
                    {timeslots.length > 0 ? (
                      <ul className="mt-2 space-y-1 max-h-24 overflow-auto text-sm text-muted-foreground">
                        {timeslots.map((t: any, idx: number) => (
                          <li key={idx}>
                            •{" "}
                            {t.start_time && t.end_time
                              ? `${t.start_time} - ${t.end_time}`
                              : t.label || t.timeslot_id || `Tijdslot ${idx + 1}`}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Format + Teams side-by-side layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="format">Competitie Format</Label>
                <Select
                  value={selectedFormat}
                  onValueChange={(value) => {
                    setSelectedFormat(value);
                    setTeamDivisions({});
                    setPreviewPlan(null);
                    setPreviewTotal(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer een format" />
                  </SelectTrigger>
                  <SelectContent>
                    {formats.map((format) => (
                      <SelectItem key={format.id} value={format.id.toString()}>
                        {format.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedFormat && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      {formats.find((f) => f.id.toString() === selectedFormat)?.description}
                    </p>
                    {(() => {
                      const format = formats.find((f) => f.id.toString() === selectedFormat);
                      if (!format?.has_divisions || !format.divisions?.length) return null;
                      return (
                        <div className="rounded-md border border-primary/15 bg-brand-50/40 p-3">
                          <p className="font-medium text-brand-dark mb-1">Reeksen in dit format</p>
                          <ul className="space-y-1">
                            {format.divisions.map((division) => (
                              <li key={division.id}>• {division.name}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <AdminTeamSelector
                  label={`Selecteer Teams`}
                  teams={teams}
                  selectedIds={selectedTeams}
                  onToggle={handleTeamToggle}
                  onSelectAll={() => {
                    setSelectedTeams(teams.map((t) => t.team_id));
                    setPreviewPlan(null);
                    setPreviewTotal(null);
                  }}
                  onClearAll={() => {
                    setSelectedTeams([]);
                    setTeamDivisions({});
                    setPreviewPlan(null);
                    setPreviewTotal(null);
                  }}
                  className="w-full"
                />

                {showDivisionAssigner && selectedFormatObj?.divisions ? (
                  <DivisionTeamAssigner
                    className="mt-4"
                    divisions={selectedFormatObj.divisions}
                    teams={teams}
                    selectedTeamIds={selectedTeams}
                    assignment={teamDivisions}
                    onChange={(next) => {
                      setTeamDivisions(next);
                      setPreviewPlan(null);
                      setPreviewTotal(null);
                    }}
                  />
                ) : null}

                {/* Speelmoment voorkeuren (alleen-lezen) voor geselecteerde teams */}
                <div className="mt-2">
                  <Label>Speelmoment voorkeuren</Label>
                  {selectedTeams.length === 0 ? (
                    <div className="text-sm text-muted-foreground mt-1">
                      Selecteer één of meerdere teams om hun speelmoment voorkeuren te bekijken.
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-1 gap-2 max-h-60 overflow-auto">
                      {selectedTeams.map((teamId) => {
                        const team = teams.find((t: any) => t.team_id === teamId);
                        const prefs = team?.preferred_play_moments as any | undefined;
                        const dayList: string[] = Array.isArray(prefs?.days) ? prefs!.days : [];
                        const timeslotList: string[] = Array.isArray(prefs?.timeslots) ? prefs!.timeslots : [];
                        const venueIdList: number[] = Array.isArray(prefs?.venues) ? prefs!.venues : [];
                        const venueNames = venueIdList.map((id) => {
                          const v = venues.find((vv: any) => (vv.venue_id ?? vv.id) === id);
                          return v?.name || v?.venue_name || `Locatie ${id}`;
                        });

                        return (
                          <div key={teamId} className="p-3 rounded-md border bg-white">
                            <div className="text-sm font-semibold mb-1">{team?.team_name || `Team ${teamId}`}</div>
                            {prefs ? (
                              <div className="text-sm space-y-1">
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground min-w-24">Dagen:</span>
                                  <span className="font-medium">{dayList.length ? dayList.join(', ') : '-'}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground min-w-24">Tijdstippen:</span>
                                  <span className="font-medium">{timeslotList.length ? timeslotList.join(', ') : '-'}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground min-w-24">Locaties:</span>
                                  <span className="font-medium">{venueNames.length ? venueNames.join(', ') : '-'}</span>
                                </div>
                                {prefs?.notes && (
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground min-w-24">Notities:</span>
                                    <span className="font-medium">{prefs.notes}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">Geen voorkeuren opgegeven.</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Planning Information */}
            {selectedFormat && selectedTeams.length > 0 && startDate && endDate && (
              <div className="space-y-2">
                <Label>Competitie Planning</Label>
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  {(() => {
                    const format = formats.find(f => f.id.toString() === selectedFormat);
                    if (!format) return null;

                    const rounds = format.regular_rounds || 1;
                    const useDivisions =
                      Boolean(format.has_divisions) &&
                      (format.divisions?.length ?? 0) >= 2;

                    let regularMatches = 0;
                    if (useDivisions && format.divisions) {
                      for (const division of format.divisions) {
                        const n = selectedTeams.filter(
                          (teamId) => teamDivisions[teamId] === division.id,
                        ).length;
                        if (n >= 2) regularMatches += (n * (n - 1) / 2) * rounds;
                      }
                    } else {
                      regularMatches =
                        (selectedTeams.length * (selectedTeams.length - 1) / 2) * rounds;
                    }

                    const playoffEnabled = Boolean(format.has_playoffs);

                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    const calendarWeeks = Math.max(0, Math.ceil(totalDays / 7));
                    const vacationWeeks = countVacationWeeksInRange(vacations, startDate, endDate);
                    const slotDetails = buildSlotDetailsFromSeasonData({
                      venues,
                      venue_timeslots: timeslots,
                    });
                    const seasonPlan = estimateSeasonPlanning({
                      seasonStart: startDate,
                      seasonEnd: endDate,
                      vacations,
                      timeslots,
                      slotDetails,
                      blocks: filterActiveSlotUnavailability(slotUnavailability),
                      competitionMatches: regularMatches,
                      cupTeamCount: selectedTeams.length,
                      playoffMatchdays: playoffEnabled ? 4 : 0,
                    });
                    const planning = {
                      slotsPerWeek: seasonPlan.cupBracket.slotsPerWeekUsed || timeslots.length || 7,
                      calendarWeeks,
                      vacationWeeks,
                      cupWeeksReserved: seasonPlan.cupDates.length || cupWeekMondays.length,
                      cupMatches: seasonPlan.cupBracket.firstRoundPairs || cupMatchCount,
                      cupPreferredWeeks: seasonPlan.cupBracket.requiredWeeks,
                      availableWeeks: seasonPlan.competitionWeeks.length,
                      weeksNeeded:
                        regularMatches === 0
                          ? 0
                          : Math.ceil(
                              regularMatches /
                                Math.max(1, seasonPlan.cupBracket.slotsPerWeekUsed || timeslots.length || 7),
                            ),
                      weekDeficit: Math.max(
                        0,
                        Math.ceil(
                          regularMatches /
                            Math.max(1, seasonPlan.cupBracket.slotsPerWeekUsed || timeslots.length || 7),
                        ) - seasonPlan.competitionWeeks.length,
                      ),
                      overflowMatches: 0,
                      doublePlayWeeks: 0,
                      feasibleWithDoublePlay: seasonPlan.competitionWeeks.length > 0,
                      dayPair: seasonPlan.daySeparation,
                      utilization: seasonPlan.efficiency.utilization,
                      usableWeeks: seasonPlan.efficiency.usableWeeks,
                      weekWaste: seasonPlan.efficiency.weekWaste,
                    };

                    const fitsNormally = planning.weekDeficit === 0;
                    const fitsWithDoublePlay =
                      !fitsNormally && planning.feasibleWithDoublePlay;
                    const isFeasible = fitsNormally || fitsWithDoublePlay;
                    const unassignedCount = useDivisions
                      ? selectedTeams.filter((teamId) => teamDivisions[teamId] == null).length
                      : 0;

                    const dayPairLabel = planning.dayPair.separated
                      ? `${planning.dayPair.earlyLabel} + ${planning.dayPair.lateLabel}`
                      : planning.dayPair.earlyLabel;

                    return (
                      <div className="space-y-3 text-sm">
                        <div className="space-y-2">
                          <div className="flex justify-between gap-3">
                            <span>Teams:</span>
                            <span className="font-medium">{selectedTeams.length}</span>
                          </div>
                          {useDivisions ? (
                            <div className="flex justify-between gap-3">
                              <span>Reeksen:</span>
                              <span className="font-medium text-right">
                                {format.divisions!.length}
                                {unassignedCount > 0
                                  ? ` (${unassignedCount} nog toe te wijzen)`
                                  : ""}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex justify-between gap-3">
                            <span>Reguliere competitie:</span>
                            <span className="font-medium text-right">
                              {useDivisions
                                ? `${rounds} ronde(s) per reeks`
                                : `${rounds} ronde(s) (thuis/uit)`}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>Reguliere wedstrijden:</span>
                            <span className="font-medium">{regularMatches}</span>
                          </div>
                          {playoffEnabled ? (
                            <div className="flex justify-between gap-3">
                              <span>Playoff wedstrijden:</span>
                              <span className="font-medium text-right">Later apart gegenereerd</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between gap-3">
                            <span>Bekerwedstrijden:</span>
                            <span className="font-medium text-right">
                              {planning.cupMatches > 0
                                ? `${planning.cupMatches} (gespreid over ${planning.cupWeeksReserved} week${planning.cupWeeksReserved === 1 ? "" : "en"})`
                                : "Geen beker gepland"}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>Kalenderweken:</span>
                            <span className="font-medium">{planning.calendarWeeks}</span>
                          </div>
                          {planning.vacationWeeks > 0 ? (
                            <div className="flex justify-between gap-3">
                              <span>Vakantieweken:</span>
                              <span className="font-medium">−{planning.vacationWeeks}</span>
                            </div>
                          ) : null}
                          {planning.cupWeeksReserved > 0 ? (
                            <div className="flex justify-between gap-3">
                              <span>Bekerweken (gereserveerd):</span>
                              <span className="font-medium">−{planning.cupWeeksReserved}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between gap-3">
                            <span>Slots / week:</span>
                            <span className="font-medium">{planning.slotsPerWeek}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>Seizoensbenutting:</span>
                            <span className="font-medium tabular-nums">
                              {Math.round((planning.utilization ?? 0) * 100)}%
                              {planning.weekWaste > 0
                                ? ` (${planning.weekWaste} week${planning.weekWaste === 1 ? "" : "en"} vrij)`
                                : ""}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>Weken nodig (1×/week):</span>
                            <span className="font-medium">{planning.weeksNeeded}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>Beschikbaar voor competitie:</span>
                            <span className="font-medium">{planning.availableWeeks}</span>
                          </div>
                          {fitsWithDoublePlay ? (
                            <>
                              <div className="flex justify-between gap-3">
                                <span>Dubbele speelweken:</span>
                                <span className="font-medium">~{planning.doublePlayWeeks}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span>Voorkeur dagen:</span>
                                <span className="font-medium text-right">{dayPairLabel}</span>
                              </div>
                            </>
                          ) : null}
                          <div
                            className={`flex justify-between gap-3 font-medium ${
                              fitsNormally
                                ? "text-green-700"
                                : fitsWithDoublePlay
                                  ? "text-amber-700"
                                  : "text-destructive"
                            }`}
                          >
                            <span>Status:</span>
                            <span className="text-right">
                              {fitsNormally
                                ? "Haalbaar (1× per week)"
                                : fitsWithDoublePlay
                                  ? "Haalbaar met dubbele speelweken"
                                  : "Niet haalbaar"}
                            </span>
                          </div>
                        </div>

                        {planning.cupMatches > 0 ? (
                          <div className="rounded-md border border-primary/20 bg-background px-3 py-2 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground mb-1">Beker gescheiden houden</p>
                            <p>
                              {planning.cupMatches} bekerwedstrijd
                              {planning.cupMatches === 1 ? "" : "en"} staan gepland over{" "}
                              {planning.cupWeeksReserved} week
                              {planning.cupWeeksReserved === 1 ? "" : "en"}. Die weken blijven
                              vrij van competitie zodat beker en competitie niet overlappen.
                              {cupWeekMondays.length === 0
                                ? ` Streef naar spreiding (~${planning.cupPreferredWeeks} weken) i.p.v. alles dicht op elkaar.`
                                : ""}
                            </p>
                          </div>
                        ) : null}

                        {fitsWithDoublePlay ? (
                          <div
                            role="status"
                            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                          >
                            <p className="font-medium mb-1">Melding: uitzonderlijk 2× in één week</p>
                            <p>
                              Er is een tekort van ~{planning.weekDeficit} week
                              {planning.weekDeficit === 1 ? "" : "en"} (~{planning.overflowMatches}{" "}
                              wedstrijd
                              {planning.overflowMatches === 1 ? "" : "en"}). In ~{planning.doublePlayWeeks}{" "}
                              week{planning.doublePlayWeeks === 1 ? "" : "en"} spelen sommige teams
                              uitzonderlijk twee keer — bij voorkeur gespreid op{" "}
                              <strong>{dayPairLabel}</strong>
                              {planning.dayPair.separated
                                ? " (maximale herstelperiode binnen de week)."
                                : ". Voeg een tweede speeldag toe in Instellingen voor betere spreiding."}{" "}
                              Vermijd dubbele speelweken in dezelfde week als een bekerwedstrijd van
                              dat team.
                            </p>
                          </div>
                        ) : null}

                        {!isFeasible && (
                          <div className="text-xs text-muted-foreground">
                            <p>Suggesties:</p>
                            <ul className="list-disc list-inside space-y-1 mt-1">
                              <li>Breid de einddatum uit</li>
                              <li>Verminder het aantal teams of rondes</li>
                              <li>Spreid bekerwedstrijden minder (alleen indien nodig)</li>
                              <li>Voeg extra tijdslots toe (Instellingen → Tijdslots)</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Preview & Create Controls — hiërarchie: voorbereiden → primaire actie → annuleren */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                disabled={isPreviewing || isCreating}
                className="sm:flex-1 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                onClick={handleGeneratePreview}
              >
                {isPreviewing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preview genereren...</> : 'Preview genereren'}
              </Button>
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={isCreating}
                className="sm:flex-1"
              >
                {isCreating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Aanmaken...</> : (previewPlan ? 'Bevestigen en importeren' : 'Competitie Aanmaken')}
              </Button>
              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={isCreating}
                className="sm:px-4"
              >
                Annuleren
              </Button>
            </div>

            <AppAlertModal
              open={showConfirm}
              onOpenChange={setShowConfirm}
              title="Competitie Aanmaken"
              description={
                <InfoConfirmDescription
                  message={
                    <>
                      Weet je zeker dat je de competitie wilt aanmaken met{" "}
                      <span className="font-semibold">{selectedTeams.length} teams</span>?
                    </>
                  }
                  note="Controleer de teamselectie en het gekozen format voordat je bevestigt."
                />
              }
              confirmAction={{
                label: previewPlan ? 'Bevestigen en importeren' : 'Competitie Aanmaken',
                onClick: () => {
                  setShowConfirm(false);
                  handleCreateCompetition();
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

            {previewPlan && (
              <div className="p-3 rounded-md border bg-white">
                <div className="text-sm font-medium mb-2">Preview (totale score: {previewTotal ?? '-'})</div>
                {previewTeamTotals && (
                  <div className="mb-3">
                    <div className="text-xs text-muted-foreground mb-1">Teamscores (som van voorkeur-scores per team)</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(previewTeamTotals).sort((a, b) => Number(b[1]) - Number(a[1])).map(([teamId, total]) => (
                        <div key={teamId} className="flex justify-between text-xs p-2 bg-muted rounded-lg">
                          <span className="font-medium">{teamNameById.get(Number(teamId)) || teamId}</span>
                          <span>{Number(total).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                          <td>{p.match_date ? new Date(p.match_date).toLocaleDateString('nl-NL') : ''}</td>
                          <td>{p.match_time || ''}</td>
                          <td>{p.venue || ''}</td>
                          <td>{(p.details?.homeScore ?? 0)} + {(p.details?.awayScore ?? 0)} = {(p.details?.combined ?? 0)} / {p.details?.maxCombined}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            
          </CardContent>
        </Card>

        {/* Competitie Beheren */}
        <Card>
          <CardHeader>
            <CardTitle>Competitie Beheren</CardTitle>
            <CardDescription>
              Bekijk en beheer de huidige competitie
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasExistingCompetition ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Er is een competitie actief met {existingCompetition.length} wedstrijden.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Competitie Statistieken:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Totaal wedstrijden: {existingCompetition.length}</li>
                    <li>• Reguliere wedstrijden: {existingCompetition.filter(m => !m.is_playoff_match).length}</li>
                    <li>• Playoff wedstrijden: {existingCompetition.filter(m => m.is_playoff_match).length}</li>
                  </ul>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Er is momenteel geen competitie actief. Maak een nieuwe competitie aan om te beginnen.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default AdminCompetitionPage;
