import {
  createDefaultDivisions,
  createDivision,
  normalizeCompetitionFormat,
  type CompetitionFormat,
} from "@/services/competitionDataService";
import {
  SEASON_SETUP_FORMAT_ID,
  SEASON_SETUP_FORMAT_NAME,
  type SeasonSetup,
  type SeasonSetupCompetition,
  type SeasonSetupCup,
  type SeasonSetupPlayoffs,
  type SeasonSetupSystems,
  type SeasonSetupWeekPhase,
} from "./types";

const WEEK_PHASES: SeasonSetupWeekPhase[] = ["competition", "cup", "playoff", "free"];

function normalizeWeekAssignments(raw: unknown): Record<string, SeasonSetupWeekPhase> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, SeasonSetupWeekPhase> = {};
  for (const [monday, phase] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) continue;
    if (typeof phase !== "string") continue;
    if (!WEEK_PHASES.includes(phase as SeasonSetupWeekPhase)) continue;
    out[monday] = phase as SeasonSetupWeekPhase;
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function asPlayoffTeamCount(value: unknown, fallback: 6 | 7 | 8): 6 | 7 | 8 {
  const n = clampInt(value, 6, 8, fallback);
  return (n === 6 || n === 7 || n === 8 ? n : fallback) as 6 | 7 | 8;
}

export function createDefaultSeasonSetup(teamCount = 14): SeasonSetup {
  const divisions = createDefaultDivisions();
  const perDiv = Math.max(2, Math.floor(teamCount / divisions.length) || 4);
  return {
    systems: {
      competition: true,
      cup: true,
      playoffs: false,
    },
    competition: {
      regularRounds: 1,
      hasDivisions: false,
      divisions,
      estimatedTeamCount: Math.max(2, teamCount),
      divisionTeamCounts: divisions.map(() => perDiv),
      teamDivisions: {},
    },
    cup: {
      useAllTeams: true,
      teamCount: Math.max(2, teamCount),
      weekMode: "auto",
      preferredWeeks: [],
    },
    playoffs: {
      topTeams: 8,
      bottomTeams: 8,
      rounds: 2,
    },
    playableVacationWeeks: [],
    phaseStrategy: "balanced",
    weekAssignments: {},
  };
}

function normalizeSystems(raw: Partial<SeasonSetupSystems> | undefined): SeasonSetupSystems {
  return {
    competition: Boolean(raw?.competition),
    cup: Boolean(raw?.cup),
    playoffs: Boolean(raw?.playoffs),
  };
}

function normalizeCompetition(
  raw: Partial<SeasonSetupCompetition> | undefined,
  teamCount: number,
): SeasonSetupCompetition {
  const hasDivisions = Boolean(raw?.hasDivisions);
  const divisions =
    Array.isArray(raw?.divisions) && raw.divisions.length >= 2
      ? raw.divisions.map((d, i) => ({
          id: typeof d.id === "number" ? d.id : Date.now() + i,
          name: String(d.name || `Reeks ${i + 1}`).trim() || `Reeks ${i + 1}`,
          sort_order: i + 1,
        }))
      : createDefaultDivisions();

  const counts = Array.isArray(raw?.divisionTeamCounts)
    ? raw.divisionTeamCounts.map((c) => clampInt(c, 2, 64, 4))
    : divisions.map(() => Math.max(2, Math.floor(teamCount / divisions.length) || 4));

  while (counts.length < divisions.length) counts.push(4);
  const trimmedCounts = counts.slice(0, divisions.length);

  const divisionIds = new Set(divisions.map((d) => d.id));
  const teamDivisions: Record<number, number> = {};
  if (raw?.teamDivisions && typeof raw.teamDivisions === "object") {
    for (const [teamKey, divId] of Object.entries(raw.teamDivisions)) {
      const teamId = Number(teamKey);
      const divisionId = Number(divId);
      if (!Number.isFinite(teamId) || !Number.isFinite(divisionId)) continue;
      if (!divisionIds.has(divisionId)) continue;
      teamDivisions[teamId] = divisionId;
    }
  }

  // Als er echte toewijzingen zijn: counts syncen met de realiteit
  const hasAssignments = Object.keys(teamDivisions).length > 0;
  const assignedCounts = divisions.map(
    (d) => Object.values(teamDivisions).filter((id) => id === d.id).length,
  );

  return {
    regularRounds: clampInt(raw?.regularRounds, 1, 8, 1),
    hasDivisions,
    divisions: hasDivisions ? divisions : createDefaultDivisions(),
    estimatedTeamCount: clampInt(raw?.estimatedTeamCount, 2, 128, teamCount),
    divisionTeamCounts:
      hasDivisions && hasAssignments ? assignedCounts : trimmedCounts,
    teamDivisions: hasDivisions ? teamDivisions : {},
  };
}

function normalizeIsoMondays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter(
        (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
      ),
    ),
  ].sort();
}

function normalizeCup(raw: Partial<SeasonSetupCup> | undefined, teamCount: number): SeasonSetupCup {
  const useAllTeams = raw?.useAllTeams !== false;
  const weekMode = raw?.weekMode === "manual" ? "manual" : "auto";
  const preferredWeeks = normalizeIsoMondays(raw?.preferredWeeks);
  return {
    useAllTeams,
    teamCount: clampInt(raw?.teamCount, 2, 128, teamCount),
    weekMode,
    preferredWeeks,
  };
}

function normalizePlayoffs(raw: Partial<SeasonSetupPlayoffs> | undefined): SeasonSetupPlayoffs {
  return {
    topTeams: asPlayoffTeamCount(raw?.topTeams, 8),
    bottomTeams: asPlayoffTeamCount(raw?.bottomTeams, 8),
    rounds: clampInt(raw?.rounds, 1, 2, 2) === 1 ? 1 : 2,
  };
}

export function normalizeSeasonSetup(
  raw: Partial<SeasonSetup> | null | undefined,
  teamCount = 14,
): SeasonSetup {
  if (!raw || typeof raw !== "object") {
    return createDefaultSeasonSetup(teamCount);
  }
  return {
    systems: normalizeSystems(raw.systems),
    competition: normalizeCompetition(raw.competition, teamCount),
    cup: normalizeCup(raw.cup, teamCount),
    playoffs: normalizePlayoffs(raw.playoffs),
    playableVacationWeeks: normalizeIsoMondays(raw.playableVacationWeeks),
    phaseStrategy:
      raw.phaseStrategy === "competition-first" ? "competition-first" : "balanced",
    weekAssignments: normalizeWeekAssignments(raw.weekAssignments),

    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

/** Zorgt dat er minstens één systeem aan staat. */
export function ensureAtLeastOneSystem(setup: SeasonSetup): SeasonSetup {
  const { systems } = setup;
  if (systems.competition || systems.cup || systems.playoffs) return setup;
  return {
    ...setup,
    systems: { ...systems, competition: true },
  };
}

export function addDivisionToSetup(setup: SeasonSetup, name?: string): SeasonSetup {
  const divisions = [
    ...setup.competition.divisions,
    createDivision(name || `Reeks ${setup.competition.divisions.length + 1}`, setup.competition.divisions.length + 1),
  ].map((d, i) => ({ ...d, sort_order: i + 1 }));
  const counts = [...setup.competition.divisionTeamCounts, 4];
  return {
    ...setup,
    competition: {
      ...setup.competition,
      hasDivisions: true,
      divisions,
      divisionTeamCounts: counts.slice(0, divisions.length),
    },
  };
}

export function removeDivisionFromSetup(setup: SeasonSetup, divisionId: number): SeasonSetup {
  if (setup.competition.divisions.length <= 2) return setup;
  const idx = setup.competition.divisions.findIndex((d) => d.id === divisionId);
  if (idx < 0) return setup;
  const divisions = setup.competition.divisions
    .filter((d) => d.id !== divisionId)
    .map((d, i) => ({ ...d, sort_order: i + 1 }));
  const counts = setup.competition.divisionTeamCounts.filter((_, i) => i !== idx);
  const teamDivisions = { ...(setup.competition.teamDivisions ?? {}) };
  for (const [teamId, divId] of Object.entries(teamDivisions)) {
    if (divId === divisionId) delete teamDivisions[Number(teamId)];
  }
  return {
    ...setup,
    competition: {
      ...setup.competition,
      divisions,
      divisionTeamCounts: counts,
      teamDivisions,
    },
  };
}

/** Sync divisionTeamCounts met actuele teamDivisions-toewijzing. */
export function syncDivisionCountsFromAssignments(setup: SeasonSetup): SeasonSetup {
  if (!setup.competition.hasDivisions) return setup;
  const teamDivisions = setup.competition.teamDivisions ?? {};
  const divisionTeamCounts = setup.competition.divisions.map(
    (d) => Object.values(teamDivisions).filter((id) => id === d.id).length,
  );
  return {
    ...setup,
    competition: {
      ...setup.competition,
      divisionTeamCounts,
      teamDivisions,
    },
  };
}

/** Bouw/update het competition_formats-item vanuit de opzet. */
export function buildSeasonSetupFormat(setup: SeasonSetup): CompetitionFormat {
  return normalizeCompetitionFormat({
    id: SEASON_SETUP_FORMAT_ID,
    name: SEASON_SETUP_FORMAT_NAME,
    description: "Automatisch vanuit Seizoensopzet",
    has_playoffs: setup.systems.playoffs && setup.systems.competition,
    regular_rounds: setup.competition.regularRounds,
    has_divisions: setup.competition.hasDivisions,
    divisions: setup.competition.hasDivisions ? setup.competition.divisions : [],
  });
}

export function mergeSeasonSetupIntoFormats(
  formats: CompetitionFormat[],
  setup: SeasonSetup,
): CompetitionFormat[] {
  const next = buildSeasonSetupFormat(setup);
  const without = (formats || []).filter((f) => f.id !== SEASON_SETUP_FORMAT_ID);
  if (!setup.systems.competition) {
    return without;
  }
  return [next, ...without];
}
