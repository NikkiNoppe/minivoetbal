import { getCupBracketPlan, type CupBracketPlan } from "@/lib/cupBracketPlan";
import type { SeasonDemand } from "@/lib/seasonCalendar";
import type { SeasonSetup } from "./types";

/** Enkelvoudige reeks: rondes × n×(n−1)/2 (één richting per ronde). */
export function estimateRoundRobinMatches(teamCount: number, rounds: number): number {
  const n = Math.max(0, Math.floor(teamCount));
  const r = Math.max(0, Math.floor(rounds));
  if (n < 2 || r < 1) return 0;
  return Math.round((r * n * (n - 1)) / 2);
}

export function estimateCompetitionMatches(setup: SeasonSetup): number {
  if (!setup.systems.competition) return 0;
  const rounds = setup.competition.regularRounds;
  if (setup.competition.hasDivisions) {
    const td = setup.competition.teamDivisions ?? {};
    const assignedCount = Object.keys(td).length;
    if (assignedCount >= 4) {
      return setup.competition.divisions.reduce((sum, div) => {
        const n = Object.values(td).filter((id) => id === div.id).length;
        return sum + estimateRoundRobinMatches(n, rounds);
      }, 0);
    }
    return setup.competition.divisions.reduce((sum, _div, i) => {
      const n = setup.competition.divisionTeamCounts[i] ?? 0;
      return sum + estimateRoundRobinMatches(n, rounds);
    }, 0);
  }
  return estimateRoundRobinMatches(setup.competition.estimatedTeamCount, rounds);
}

/** Speeldagen per ronde: even = n−1; oneven = n (één bye per speeldag). */
export function matchdaysPerRound(teamCount: number): number {
  const n = Math.max(0, Math.floor(teamCount));
  if (n < 2) return 0;
  return n % 2 === 0 ? n - 1 : n;
}

/** Speeldagen per pool (round-robin); bij reeksen = max over reeksen (parallel). */
export function estimateCompetitionMatchdays(setup: SeasonSetup): number {
  if (!setup.systems.competition) return 0;
  const rounds = Math.max(0, setup.competition.regularRounds);
  if (rounds < 1) return 0;

  const matchdaysFor = (n: number) => rounds * matchdaysPerRound(n);

  if (setup.competition.hasDivisions) {
    return setup.competition.divisions.reduce((max, _div, i) => {
      const n = setup.competition.divisionTeamCounts[i] ?? 0;
      return Math.max(max, matchdaysFor(n));
    }, 0);
  }
  return matchdaysFor(setup.competition.estimatedTeamCount);
}

/**
 * Korte uitleg bij oneven reeks: n speeldagen/ronde i.p.v. n−1,
 * omdat één ploeg per speeldag bye heeft (niet “tegen zichzelf”).
 */
export function describeCompetitionMatchdayMath(setup: SeasonSetup): string | null {
  if (!setup.systems.competition) return null;
  const rounds = setup.competition.regularRounds;
  const sizes = setup.competition.hasDivisions
    ? setup.competition.divisionTeamCounts.filter((n) => n >= 2)
    : [setup.competition.estimatedTeamCount];
  const odd = sizes.find((n) => n % 2 === 1);
  if (odd == null) return null;
  const per = matchdaysPerRound(odd);
  return (
    `${odd} ploegen (oneven): ${per} speeldagen/ronde (incl. 1 bye), niet ${odd - 1}. ` +
    `Bij ${rounds} rondes = ${rounds * per} speeldagen. ` +
    `Elke ploeg speelt ${odd - 1}× per ronde; de bye is rust, geen wedstrijd tegen jezelf.`
  );
}

/**
 * Speeldagen-schatting: top & bottom parallel → ~2 weken per ronde
 * (halve finale / finale-achtig), min. 2.
 */
export function estimatePlayoffMatchdays(setup: SeasonSetup): number {
  if (!setup.systems.playoffs) return 0;
  return Math.max(2, setup.playoffs.rounds * 2);
}

export function resolveCupTeamCount(setup: SeasonSetup, liveTeamCount: number): number {
  if (!setup.systems.cup) return 0;
  if (setup.cup.useAllTeams) return Math.max(2, liveTeamCount);
  return Math.max(2, setup.cup.teamCount);
}

export function seasonSetupToDemand(
  setup: SeasonSetup,
  liveTeamCount: number,
): SeasonDemand {
  return {
    competitionMatches: estimateCompetitionMatches(setup),
    competitionMatchdays: estimateCompetitionMatchdays(setup),
    cupTeamCount: resolveCupTeamCount(setup, liveTeamCount),
    playoffMatchdays: estimatePlayoffMatchdays(setup),
    cupWeekMode: setup.cup.weekMode ?? "auto",
    cupPreferredWeeks: setup.cup.preferredWeeks ?? [],
  };
}

export function describeCupRounds(
  setup: SeasonSetup,
  liveTeamCount: number,
  slotsPerWeek = 7,
): CupBracketPlan | null {
  if (!setup.systems.cup) return null;
  return getCupBracketPlan(resolveCupTeamCount(setup, liveTeamCount), slotsPerWeek);
}

export function summarizeSeasonSetup(setup: SeasonSetup, liveTeamCount: number): string[] {
  const lines: string[] = [];
  if (setup.systems.competition) {
    const matches = estimateCompetitionMatches(setup);
    const matchdays = estimateCompetitionMatchdays(setup);
    if (setup.competition.hasDivisions) {
      lines.push(
        `Competitie in ${setup.competition.divisions.length} reeksen · ${setup.competition.regularRounds} ronde(s) · ~${matches} wedstrijden · ${matchdays} speeldagen`,
      );
    } else {
      lines.push(
        `Competitie · ${setup.competition.estimatedTeamCount} teams · ${setup.competition.regularRounds} ronde(s) · ~${matches} wedstrijden · ${matchdays} speeldagen`,
      );
    }
    const byeNote = describeCompetitionMatchdayMath(setup);
    if (byeNote) lines.push(byeNote);
  }
  if (setup.systems.cup) {
    const n = resolveCupTeamCount(setup, liveTeamCount);
    const plan = getCupBracketPlan(n);
    const roundNames = plan.roundLabels
      .map((r) => (r.type === "group" ? r.name : r.name))
      .join(" → ");
    lines.push(
      `Beker · ${n} teams${setup.cup.useAllTeams ? " (alle)" : ""} · ${plan.requiredWeeks} speelweken (${roundNames})`,
    );
  }
  if (setup.systems.playoffs) {
    lines.push(
      `Play-offs · top ${setup.playoffs.topTeams} + bottom ${setup.playoffs.bottomTeams} · ${setup.playoffs.rounds} ronde(s) · ~${estimatePlayoffMatchdays(setup)} speeldagen`,
    );
  }
  if (lines.length === 0) {
    lines.push("Geen speelsysteem geselecteerd");
  }
  return lines;
}
