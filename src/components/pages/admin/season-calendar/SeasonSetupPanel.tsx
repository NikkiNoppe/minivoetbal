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
import SeasonStepSection from "./SeasonStepSection";
import {
  addDivisionToSetup,
  describeCupRounds,
  estimateCompetitionMatchdays,
  estimateCompetitionMatches,
  estimatePlayoffMatchdays,
  estimatePlayoffMatches,
  matchdaysPerRound,
  removeDivisionFromSetup,
  resolveCupTeamCount,
  splitPlayoffGroups,
  syncDivisionCountsFromAssignments,
  type CompetitionByePin,
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
    description: "Alle ploegen: top & bottom (oneven extra in de top); 1 of 2 rondes",
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
  /** Auto-save status, getoond in stap 2. */
  statusFooter?: React.ReactNode;
}

const SeasonSetupPanel: React.FC<SeasonSetupPanelProps> = ({
  setup,
  liveTeamCount,
  slotsPerWeek,
  teams = [],
  disabled = false,
  onChange,
  allowedSystems,
  statusFooter,
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

  const playoffSplit = useMemo(
    () => splitPlayoffGroups(liveTeamCount),
    [liveTeamCount],
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

  const byePins = setup.competition.byePins ?? [];

  const poolSizeForTeam = (teamId: number): number => {
    if (!setup.competition.hasDivisions) {
      return teams.length > 0
        ? teams.length
        : setup.competition.estimatedTeamCount;
    }
    const divId = teamAssignment[teamId];
    if (divId == null) return 0;
    const assigned = teams.filter((t) => teamAssignment[t.team_id] === divId).length;
    if (assigned > 0) return assigned;
    const idx = setup.competition.divisions.findIndex((d) => d.id === divId);
    return idx >= 0 ? (setup.competition.divisionTeamCounts[idx] ?? 0) : 0;
  };

  const showCompetitionByePins = useMemo(() => {
    if (!setup.systems.competition) return false;
    if (!setup.competition.hasDivisions) {
      const n =
        teams.length > 0 ? teams.length : setup.competition.estimatedTeamCount;
      return n % 2 === 1;
    }
    return setup.competition.divisions.some((div, index) => {
      const assigned = teams.filter(
        (t) => teamAssignment[t.team_id] === div.id,
      ).length;
      const count =
        assigned > 0
          ? assigned
          : (setup.competition.divisionTeamCounts[index] ?? 0);
      return count % 2 === 1;
    });
  }, [setup, teams, teamAssignment]);

  const updateByePin = (index: number, patch: Partial<CompetitionByePin>) => {
    const next = byePins.map((pin, i) =>
      i === index ? { ...pin, ...patch } : pin,
    );
    patchCompetition({ byePins: next });
  };

  const removeByePin = (index: number) => {
    patchCompetition({ byePins: byePins.filter((_, i) => i !== index) });
  };

  const addByePin = () => {
    const pinnedTeams = new Set(byePins.map((p) => p.teamId));
    const usedMatchdays = new Set(byePins.map((p) => p.roundMatchday));
    const candidate = teams.find((t) => !pinnedTeams.has(t.team_id));
    if (!candidate) return;
    const poolSize = poolSizeForTeam(candidate.team_id);
    if (poolSize % 2 === 0) return;
    const maxMd = matchdaysPerRound(poolSize);
    let roundMatchday = 1;
    while (roundMatchday <= maxMd && usedMatchdays.has(roundMatchday)) {
      roundMatchday += 1;
    }
    patchCompetition({
      byePins: [
        ...byePins,
        {
          teamId: candidate.team_id,
          roundMatchday: Math.min(roundMatchday, maxMd),
        },
      ],
    });
  };

  const hasDetailSections =
    setup.systems.competition || setup.systems.cup || setup.systems.playoffs;

  return (
    <div className="space-y-6">
      <SeasonStepSection
        step={1}
        title="Speelsystemen"
        headingId="season-setup-systems-heading"
      >
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selectie</CardTitle>
            <CardDescription>
              Meerdere systemen tegelijk mogelijk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch" role="list">
              {visibleSystems.map((sys) => {
                const Icon = sys.icon;
                const checked = setup.systems[sys.key];
                const id = `season-system-${sys.key}`;
                return (
                  <li key={sys.key} className="h-full min-h-0">
                    <label
                      htmlFor={id}
                      className={cn(
                        "flex flex-col h-full gap-2 rounded-lg border p-3 min-h-[44px] cursor-pointer transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-primary/15 bg-card hover:bg-muted/40",
                        disabled && "opacity-60 pointer-events-none",
                      )}
                    >
                      <div className="flex items-start gap-3 flex-1">
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
      </SeasonStepSection>

      {hasDetailSections ? (
        <SeasonStepSection
          step={2}
          title="Details per systeem"
          headingId="season-setup-details-heading"
        >
          <div className="space-y-3">
            {setup.systems.competition ? (
              <SectionCollapsibleCard
                title="Competitie"
                icon={Trophy}
                defaultOpen={false}
                badge={
                  <Badge variant="secondary" className="text-[10px] font-normal whitespace-normal leading-tight max-w-full">
                    ~{estimateCompetitionMatches(setup)} wedstrijden ·{" "}
                    {estimateCompetitionMatchdays(setup)} speeldagen
                  </Badge>
                }
                contentClassName="space-y-3 sm:space-y-4 px-3 sm:px-5 py-3 sm:py-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      1 = enkelvoudig, 2 = heen én terug.
                      Oneven ploegen: +1 speeldag per ronde (bye).
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-sm font-medium text-brand-dark">Reeksen</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] w-full sm:w-auto"
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

                {showCompetitionByePins && teams.length > 0 ? (
                  <div className="space-y-2 border-t border-primary/10 pt-3">
                    <p className="text-sm font-medium text-brand-dark">
                      Bye vastzetten (oneven poule)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kies welke ploeg rust op welke speeldag. Per speeldag is
                      maximaal één bye mogelijk.
                    </p>
                    {byePins.length > 0 ? (
                      <ul className="space-y-2">
                        {byePins.map((pin, index) => {
                          const maxMd = matchdaysPerRound(poolSizeForTeam(pin.teamId));
                          const usedMatchdays = new Set(
                            byePins
                              .filter((_, i) => i !== index)
                              .map((p) => p.roundMatchday),
                          );
                          return (
                            <li
                              key={`${pin.teamId}-${index}`}
                              className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-lg border border-primary/15 p-3"
                            >
                              <div className="flex-1 space-y-1.5 min-w-0">
                                <Label htmlFor={`bye-team-${index}`}>Ploeg</Label>
                                <Select
                                  value={String(pin.teamId)}
                                  disabled={disabled}
                                  onValueChange={(v) =>
                                    updateByePin(index, { teamId: Number(v) })
                                  }
                                >
                                  <SelectTrigger
                                    id={`bye-team-${index}`}
                                    className="min-h-[44px]"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teams.map((t) => (
                                      <SelectItem
                                        key={t.team_id}
                                        value={String(t.team_id)}
                                        disabled={
                                          byePins.some(
                                            (p, i) =>
                                              i !== index && p.teamId === t.team_id,
                                          )
                                        }
                                      >
                                        {t.team_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="w-full sm:w-36 space-y-1.5">
                                <Label htmlFor={`bye-md-${index}`}>Speeldag</Label>
                                <Select
                                  value={String(pin.roundMatchday)}
                                  disabled={disabled}
                                  onValueChange={(v) =>
                                    updateByePin(index, {
                                      roundMatchday: Number(v) || 1,
                                    })
                                  }
                                >
                                  <SelectTrigger
                                    id={`bye-md-${index}`}
                                    className="min-h-[44px]"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: maxMd }, (_, i) => i + 1).map(
                                      (md) => (
                                        <SelectItem
                                          key={md}
                                          value={String(md)}
                                          disabled={usedMatchdays.has(md)}
                                        >
                                          Speeldag {md}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-[44px] min-w-[44px] text-destructive"
                                disabled={disabled}
                                aria-label="Bye-pin verwijderen"
                                onClick={() => removeByePin(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nog geen bye vastgezet — de loting kiest automatisch.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] w-full sm:w-auto"
                      disabled={
                        disabled ||
                        teams.length <= byePins.length ||
                        !teams.some((t) => !byePins.some((p) => p.teamId === t.team_id))
                      }
                      onClick={addByePin}
                    >
                      <Plus className="h-4 w-4 mr-1" aria-hidden />
                      Bye toevoegen
                    </Button>
                  </div>
                ) : null}
              </SectionCollapsibleCard>
            ) : null}

            {setup.systems.cup ? (
              <SectionCollapsibleCard
                title="Beker"
                icon={Award}
                defaultOpen={cupPlan?.rounds[0]?.kind === "voorronde"}
                badge={
                  cupPlan ? (
                    <Badge variant="secondary" className="text-[10px] font-normal whitespace-normal leading-tight max-w-full">
                      {cupPlan.rounds.reduce((sum, r) => sum + r.matchCount, 0)} wedstrijden ·{" "}
                      {cupPlan.requiredWeeks} speelweken
                      {(setup.cup.voorrondeTeamIds?.length ?? 0) > 0
                        ? ` · VR ${setup.cup.voorrondeTeamIds!.length}`
                        : ""}
                    </Badge>
                  ) : undefined
                }
                contentClassName="space-y-3 sm:space-y-4 px-3 sm:px-5 py-3 sm:py-4"
              >
                <label
                  htmlFor="setup-cup-all"
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-primary/15 p-3 min-h-[44px] cursor-pointer",
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
                    <ol className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
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

                {cupPlan?.rounds[0]?.kind === "voorronde" && teams.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-brand-dark">
                      Voorronde-ploegen (nieuwe ploegen)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kies exact {cupPlan.rounds[0].matchCount * 2} ploegen die de voorronde
                      spelen. De rest krijgt bye naar de volgende ronde.
                    </p>
                    {(setup.cup.voorrondeTeamIds?.length ?? 0) > 0 ? (
                      <p className="text-sm font-medium text-brand-dark rounded-lg border border-primary/20 bg-muted/40 px-3 py-2">
                        Gekozen:{" "}
                        {(setup.cup.voorrondeTeamIds ?? [])
                          .map(
                            (id) =>
                              teams.find((t) => t.team_id === id)?.team_name ??
                              `Team ${id}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : (
                      <p className="text-sm text-destructive">
                        Nog geen voorronde-ploegen gekozen — anders kiest de loting zelf.
                      </p>
                    )}
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                      {teams.map((t) => {
                        const selected = (setup.cup.voorrondeTeamIds ?? []).includes(
                          t.team_id,
                        );
                        const need = cupPlan.rounds[0].matchCount * 2;
                        const count = (setup.cup.voorrondeTeamIds ?? []).length;
                        const atLimit = !selected && count >= need;
                        return (
                          <li key={t.team_id}>
                            <label
                              htmlFor={`setup-cup-vr-${t.team_id}`}
                              className={cn(
                                "flex items-center gap-2 rounded-lg border border-primary/15 px-3 py-2 min-h-[44px] cursor-pointer",
                                selected && "border-primary/40 bg-muted/40",
                                (disabled || atLimit) && "opacity-60",
                                atLimit && "pointer-events-none",
                              )}
                            >
                              <Checkbox
                                id={`setup-cup-vr-${t.team_id}`}
                                checked={selected}
                                disabled={disabled || atLimit}
                                onCheckedChange={(v) => {
                                  const cur = setup.cup.voorrondeTeamIds ?? [];
                                  const next =
                                    v === true
                                      ? [...cur, t.team_id].slice(0, need)
                                      : cur.filter((id) => id !== t.team_id);
                                  patchCup({ voorrondeTeamIds: next });
                                }}
                              />
                              <span className="text-sm truncate">{t.team_name}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </SectionCollapsibleCard>
            ) : null}

            {setup.systems.playoffs ? (
              <SectionCollapsibleCard
                title="Play-offs"
                icon={Target}
                defaultOpen
                badge={
                  <Badge variant="secondary" className="text-[10px] font-normal whitespace-normal leading-tight max-w-full">
                    ~{estimatePlayoffMatches({ ...setup, playoffs: { ...setup.playoffs, ...playoffSplit } })} wedstrijden ·{" "}
                    {estimatePlayoffMatchdays({ ...setup, playoffs: { ...setup.playoffs, ...playoffSplit } })} speeldagen
                  </Badge>
                }
                contentClassName="space-y-3 sm:space-y-4 px-3 sm:px-5 py-3 sm:py-4"
              >
                <p className="text-sm text-muted-foreground">
                  Alle {liveTeamCount} ploegen doen mee: top {playoffSplit.topTeams} +
                  bottom {playoffSplit.bottomTeams}
                  {liveTeamCount % 2 === 1
                    ? ". Oneven aantal → extra ploeg in de top."
                    : "."}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium leading-none">Top-ploegen</p>
                    <div className="flex min-h-[44px] items-center rounded-lg border border-primary/20 bg-muted/40 px-3 py-2 text-sm font-medium text-brand-dark">
                      Top {playoffSplit.topTeams} (pos. 1–{playoffSplit.topTeams})
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium leading-none">Bottom-ploegen</p>
                    <div className="flex min-h-[44px] items-center rounded-lg border border-primary/20 bg-muted/40 px-3 py-2 text-sm font-medium text-brand-dark">
                      Bottom {playoffSplit.bottomTeams} (pos.{" "}
                      {playoffSplit.topTeams + 1}–{liveTeamCount})
                    </div>
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
            {statusFooter}
          </div>
        </SeasonStepSection>
      ) : statusFooter ? (
        statusFooter
      ) : null}
    </div>
  );
};

export default React.memo(SeasonSetupPanel);
