import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Award, Plus, Target, Trophy, Trash2 } from "lucide-react";
import { SectionCollapsibleCard } from "@/components/layout";
import { cn } from "@/lib/utils";
import {
  addDivisionToSetup,
  describeCupRounds,
  estimateCompetitionMatchdays,
  estimateCompetitionMatches,
  estimatePlayoffMatchdays,
  estimatePlayoffMatches,

  removeDivisionFromSetup,
  resolveCupTeamCount,
  syncDivisionCountsFromAssignments,
  type SeasonSetup,
} from "@/lib/seasonSetup";
import DivisionTeamAssigner, {
  type DivisionTeamAssignment,
} from "@/components/pages/admin/competition/DivisionTeamAssigner";

type SystemKey = keyof SeasonSetup["systems"];

const SYSTEM_CARDS: Array<{
  key: SystemKey;
  title: string;
  description: string;
  icon: typeof Trophy;
}> = [
  {
    key: "competition",
    title: "Competitie",
    description: "Reeksen of één poule, met zelf gekozen aantal rondes",
    icon: Trophy,
  },
  {
    key: "cup",
    title: "Beker",
    description: "Knock-out met alle of geselecteerde teams; rondes volgen uit het veld",
    icon: Award,
  },
  {
    key: "playoffs",
    title: "Play-offs",
    description: "Top & bottom na de competitie; 1 of 2 rondes",
    icon: Target,
  },
];

export interface SeasonSetupPanelProps {
  setup: SeasonSetup;
  liveTeamCount: number;
  /** Effectieve slots/week (uit kalenderplan of timeslots). */
  slotsPerWeek?: number;
  /** Teams voor reeks-toewijzing (bewaard in opzet). */
  teams?: Array<{ team_id: number; team_name: string }>;
  disabled?: boolean;
  onChange: (next: SeasonSetup) => void;
  /** Welke systemen mogen getoond worden (visibility). */
  allowedSystems?: Partial<Record<SystemKey, boolean>>;
  /** Beschikbare speelmomenten uit de kalender (M-slots / configAvailable). */
  availableMoments?: number;
}

const SeasonSetupPanel: React.FC<SeasonSetupPanelProps> = ({
  setup,
  liveTeamCount,
  slotsPerWeek,
  teams = [],
  disabled = false,
  onChange,
  allowedSystems,
  availableMoments,
}) => {
  const visibleSystems = useMemo(
    () =>
      SYSTEM_CARDS.filter((c) =>
        allowedSystems ? allowedSystems[c.key] !== false : true,
      ),
    [allowedSystems],
  );

  const cupPlan = useMemo(
    () => describeCupRounds(setup, liveTeamCount, slotsPerWeek),
    [setup, liveTeamCount, slotsPerWeek],
  );

  const toggleSystem = (key: SystemKey, checked: boolean) => {
    const nextSystems = { ...setup.systems, [key]: checked };
    onChange({ ...setup, systems: nextSystems });
  };

  const patchCompetition = (patch: Partial<SeasonSetup["competition"]>) => {
    onChange({
      ...setup,
      competition: { ...setup.competition, ...patch },
    });
  };

  const patchCup = (patch: Partial<SeasonSetup["cup"]>) => {
    onChange({
      ...setup,
      cup: { ...setup.cup, ...patch },
    });
  };

  const patchPlayoffs = (patch: Partial<SeasonSetup["playoffs"]>) => {
    onChange({
      ...setup,
      playoffs: { ...setup.playoffs, ...patch },
    });
  };

  const selectedTeamIds = useMemo(() => teams.map((t) => t.team_id), [teams]);
  const teamAssignment: DivisionTeamAssignment = setup.competition.teamDivisions ?? {};

  const handleTeamAssignment = (next: DivisionTeamAssignment) => {
    onChange(
      syncDivisionCountsFromAssignments({
        ...setup,
        competition: {
          ...setup.competition,
          hasDivisions: true,
          teamDivisions: next,
        },
      }),
    );
  };

  const cupMatchCount = cupPlan
    ? cupPlan.rounds.reduce((sum, r) => sum + r.matchCount, 0)
    : 0;
  const competitionMatchCount = setup.systems.competition
    ? estimateCompetitionMatches(setup)
    : 0;
  const demandMatches =
    (setup.systems.competition ? competitionMatchCount : 0) +
    (setup.systems.cup ? cupMatchCount : 0);
  const spareMoments =
    availableMoments != null ? availableMoments - demandMatches : null;
  const hasDetailSections =
    setup.systems.competition || setup.systems.cup || setup.systems.playoffs;

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="season-setup-systems-heading">
        <div className="space-y-1 border-b border-primary/15 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stap 1
          </p>
          <h3
            id="season-setup-systems-heading"
            className="text-base font-semibold text-brand-dark"
          >
            Speelsystemen
          </h3>
          <p className="text-sm text-muted-foreground">
            Kies welke onderdelen dit seizoen meedoen. Details per systeem klap je apart open.
          </p>
          {availableMoments != null && availableMoments > 0 ? (
            <p className="text-sm text-brand-dark">
              {availableMoments} speelmomenten in de kalender
              {setup.systems.competition
                ? ` · ${competitionMatchCount} competitiewedstrijden`
                : ""}
              {setup.systems.cup ? ` · ${cupMatchCount} bekerwedstrijden` : ""}
              {spareMoments != null
                ? spareMoments >= 0
                  ? ` · ${spareMoments} vrij`
                  : ` · ${Math.abs(spareMoments)} tekort`
                : ""}
            </p>
          ) : null}
        </div>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selectie</CardTitle>
            <CardDescription>
              Meerdere systemen tegelijk mogelijk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="list">
              {visibleSystems.map((sys) => {
                const Icon = sys.icon;
                const checked = setup.systems[sys.key];
                const id = `season-system-${sys.key}`;
                return (
                  <li key={sys.key}>
                    <label
                      htmlFor={id}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border p-3 min-h-[44px] cursor-pointer transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-primary/15 bg-card hover:bg-muted/40",
                        disabled && "opacity-60 pointer-events-none",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(v) => toggleSystem(sys.key, v === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
                            <span className="font-medium text-sm text-brand-dark">
                              {sys.title}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {sys.description}
                          </p>
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      {hasDetailSections ? (
        <section className="space-y-3" aria-labelledby="season-setup-details-heading">
          <div className="space-y-1 border-b border-primary/15 pb-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stap 2
            </p>
            <h3
              id="season-setup-details-heading"
              className="text-base font-semibold text-brand-dark"
            >
              Details per systeem
            </h3>
          </div>

          <div className="space-y-3">
            {setup.systems.competition ? (
              <SectionCollapsibleCard
                title="Competitie"
                icon={Trophy}
                defaultOpen={false}
                badge={
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    ~{estimateCompetitionMatches(setup)} wedstrijden ·{" "}
                    {estimateCompetitionMatchdays(setup)} speeldagen
                  </Badge>
                }
                contentClassName="space-y-4"
              >
                <p className="text-sm text-muted-foreground -mt-1 mb-2">
                  Rondes, poule of reeksen — apart van beker en play-offs.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-rounds">Aantal rondes</Label>
                    <Select
                      value={String(setup.competition.regularRounds)}
                      disabled={disabled}
                      onValueChange={(v) =>
                        patchCompetition({ regularRounds: Math.max(1, Number(v) || 1) })
                      }
                    >
                      <SelectTrigger id="setup-rounds" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "ronde" : "rondes"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      1 = enkelvoudig · 2 = heen én terug · 3 = drie rondes.
                      Oneven aantal ploegen: +1 speeldag/ronde (bye).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="setup-div-toggle">Indeling</Label>
                    <Select
                      value={setup.competition.hasDivisions ? "divisions" : "single"}
                      disabled={disabled}
                      onValueChange={(v) =>
                        patchCompetition({
                          hasDivisions: v === "divisions",
                          teamDivisions:
                            v === "divisions" ? setup.competition.teamDivisions ?? {} : {},
                        })
                      }
                    >
                      <SelectTrigger id="setup-div-toggle" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Eén poule / reeks</SelectItem>
                        <SelectItem value="divisions">Meerdere reeksen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!setup.competition.hasDivisions ? (
                  <div className="space-y-1.5 max-w-xs">
                    <Label htmlFor="setup-comp-teams">Aantal teams (schatting)</Label>
                    <Input
                      id="setup-comp-teams"
                      type="number"
                      min={2}
                      className="min-h-[44px]"
                      disabled={disabled}
                      value={setup.competition.estimatedTeamCount}
                      onChange={(e) =>
                        patchCompetition({
                          estimatedTeamCount: Math.max(2, Number(e.target.value) || 2),
                        })
                      }
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-brand-dark">Reeksen</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        disabled={disabled}
                        onClick={() => onChange(addDivisionToSetup(setup))}
                      >
                        <Plus className="h-4 w-4 mr-1" aria-hidden />
                        Reeks toevoegen
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {setup.competition.divisions.map((div, index) => {
                        const assigned =
                          setup.competition.divisionTeamCounts[index] ??
                          Object.values(setup.competition.teamDivisions ?? {}).filter(
                            (id) => id === div.id,
                          ).length;
                        return (
                          <li
                            key={div.id}
                            className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-lg border border-primary/15 p-3"
                          >
                            <div className="flex-1 space-y-1.5 min-w-0">
                              <Label htmlFor={`div-name-${div.id}`}>Naam</Label>
                              <Input
                                id={`div-name-${div.id}`}
                                className="min-h-[44px]"
                                disabled={disabled}
                                value={div.name}
                                onChange={(e) => {
                                  const divisions = setup.competition.divisions.map((d) =>
                                    d.id === div.id ? { ...d, name: e.target.value } : d,
                                  );
                                  patchCompetition({ divisions });
                                }}
                              />
                            </div>
                            <div className="w-full sm:w-28 space-y-1.5">
                              <Label>Teams</Label>
                              <p className="min-h-[44px] flex items-center text-sm font-medium tabular-nums text-brand-dark px-1">
                                {assigned}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-[44px] min-w-[44px] text-destructive"
                              disabled={disabled || setup.competition.divisions.length <= 2}
                              aria-label={`Verwijder ${div.name}`}
                              onClick={() => onChange(removeDivisionFromSetup(setup, div.id))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>

                    <DivisionTeamAssigner
                      divisions={setup.competition.divisions}
                      teams={teams}
                      selectedTeamIds={selectedTeamIds}
                      assignment={teamAssignment}
                      onChange={handleTeamAssignment}
                      className={cn(disabled && "pointer-events-none opacity-60")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Toewijzingen worden automatisch bewaard in de seizoensopzet.
                    </p>
                  </div>
                )}
              </SectionCollapsibleCard>
            ) : null}

            {setup.systems.cup ? (
              <SectionCollapsibleCard
                title="Beker"
                icon={Award}
                defaultOpen={false}
                badge={
                  cupPlan ? (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {cupPlan.rounds.reduce((sum, r) => sum + r.matchCount, 0)} wedstrijden ·{" "}
                      {cupPlan.requiredWeeks} speelweken
                    </Badge>
                  ) : undefined
                }
                contentClassName="space-y-4"
              >
                <p className="text-sm text-muted-foreground -mt-1 mb-2">
                  Knock-out apart van de competitie. Bekerweken kies je later in de kalender.
                </p>
                <label
                  htmlFor="setup-cup-all"
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-primary/15 p-3 cursor-pointer",
                    disabled && "opacity-60 pointer-events-none",
                  )}
                >
                  <Checkbox
                    id="setup-cup-all"
                    checked={setup.cup.useAllTeams}
                    disabled={disabled}
                    onCheckedChange={(v) => {
                      const useAllTeams = v === true;
                      patchCup({
                        useAllTeams,
                        teamCount: useAllTeams
                          ? Math.max(2, liveTeamCount)
                          : setup.cup.teamCount,
                      });
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Alle teams</p>
                    <p className="text-xs text-muted-foreground">
                      Nu {liveTeamCount} actieve teams in deze organisatie
                    </p>
                  </div>
                </label>

                {!setup.cup.useAllTeams ? (
                  <div className="space-y-1.5 max-w-xs">
                    <Label htmlFor="setup-cup-teams">Aantal bekerteams</Label>
                    <Input
                      id="setup-cup-teams"
                      type="number"
                      min={2}
                      className="min-h-[44px]"
                      disabled={disabled}
                      value={setup.cup.teamCount}
                      onChange={(e) =>
                        patchCup({ teamCount: Math.max(2, Number(e.target.value) || 2) })
                      }
                    />
                  </div>
                ) : null}

                {cupPlan ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-brand-dark">
                      Rondes ({resolveCupTeamCount(setup, liveTeamCount)} teams ·{" "}
                      {cupPlan.requiredWeeks} speelweken)
                    </p>
                    <ol className="flex flex-wrap gap-2">
                      {cupPlan.roundLabels.map((round) =>
                        round.type === "group" ? (
                          <li
                            key={round.name}
                            className="flex flex-wrap gap-1.5 items-center"
                          >
                            <Badge variant="secondary">{round.name}</Badge>
                            {round.subRounds.map((sub) => (
                              <Badge key={sub.index} variant="outline" className="text-xs">
                                {sub.name}
                              </Badge>
                            ))}
                          </li>
                        ) : (
                          <li key={`${round.name}-${round.index}`}>
                            <Badge variant="secondary">{round.name}</Badge>
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                ) : null}
              </SectionCollapsibleCard>
            ) : null}

            {setup.systems.playoffs ? (
              <SectionCollapsibleCard
                title="Play-offs"
                icon={Target}
                defaultOpen={false}
                badge={
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    ~{estimatePlayoffMatches(setup)} wedstrijden ·{" "}
                    {estimatePlayoffMatchdays(setup)} speeldagen

                  </Badge>
                }
                contentClassName="space-y-4"
              >
                <p className="text-sm text-muted-foreground -mt-1 mb-2">
                  Top &amp; bottom na de competitie — apart blok, eigen rondes.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-po-top">Top-teams</Label>
                    <Select
                      value={String(setup.playoffs.topTeams)}
                      disabled={disabled}
                      onValueChange={(v) =>
                        patchPlayoffs({ topTeams: Number(v) as 6 | 7 | 8 })
                      }
                    >
                      <SelectTrigger id="setup-po-top" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[6, 7, 8].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            Top {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-po-bottom">Bottom-teams</Label>
                    <Select
                      value={String(setup.playoffs.bottomTeams)}
                      disabled={disabled}
                      onValueChange={(v) =>
                        patchPlayoffs({ bottomTeams: Number(v) as 6 | 7 | 8 })
                      }
                    >
                      <SelectTrigger id="setup-po-bottom" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[6, 7, 8].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            Bottom {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-po-rounds">Rondes</Label>
                    <Select
                      value={String(setup.playoffs.rounds)}
                      disabled={disabled}
                      onValueChange={(v) =>
                        patchPlayoffs({ rounds: Number(v) === 1 ? 1 : 2 })
                      }
                    >
                      <SelectTrigger id="setup-po-rounds" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 ronde</SelectItem>
                        <SelectItem value="2">2 rondes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </SectionCollapsibleCard>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default React.memo(SeasonSetupPanel);
