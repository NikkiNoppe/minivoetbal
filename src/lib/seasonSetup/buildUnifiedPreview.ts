/** Gecombineerde seizoenspreview: competitie + beker + play-offs (read-only). */

import { competitionService } from "@/services/match/competitionService";
import { bekerService } from "@/services/match/cupService";
import { playoffService } from "@/services/match/playoffService";
import { loadSlotPlanningContext } from "@/services/match/slotPlanningContext";
import { buildSeasonSetupFormat } from "./normalize";
import { resolveCupTeamCount } from "./estimates";
import type { SeasonSetup } from "./types";
import {
  buildSeasonSlotGrids,
  type OccupancyMatchLike,
  type SeasonPlan,
  type SlotDetailLike,
} from "@/lib/seasonCalendar";
import { DAY_OF_WEEK_NAMES, toMondayIso, type VacationLike } from "@/lib/competitionPlanningEstimate";
import { hasSufficientSameWeekDayGap } from "@/lib/competitionWeekPacking";
import { comparePreviewChronological } from "@/lib/slotPriorityPacking";
import {
  compareUnifiedPreviewRows,
  lastPlayableFriday,
  pinCupFinalToDate,
  relocateCupFinalToStandaloneDay,
} from "./placeCupFinalOnQuietDay";
import {
  buildCupTeamRankMap,
  divisionRankBySortOrder,
} from "@/lib/cupTeamSeeding";
import type { SlotUnavailability } from "@/types/slotUnavailability";

export type UnifiedPreviewPhase =
  | "competition"
  | "cup"
  | "playoff"
  | "free"
  | "vacation"
  | "blocked";

export type UnifiedPreviewRow = {
  phase: UnifiedPreviewPhase;
  speeldag: string;
  homeLabel: string;
  awayLabel: string;
  match_date: string;
  match_time?: string;
  venue?: string;
  note?: string;
  /** Competitieronde 1–3 (voor sortering/kolom). */
  round?: number | null;
  /** Voor conflict-highlighting in de preview-tabel */
  homeTeamId?: number | null;
  awayTeamId?: number | null;
};

export type UnifiedPreviewSection = {
  phase: UnifiedPreviewPhase;
  label: string;
  success: boolean;
  message: string;
  rows: UnifiedPreviewRow[];
  /** Gerichte tips bij packing-falen (competitie) */
  suggestions?: Array<{ id: string; title: string; detail: string }>;
};

export type UnifiedSeasonPreview = {
  sections: UnifiedPreviewSection[];
  rows: UnifiedPreviewRow[];
  warnings: string[];
  /** Exacte plannen om te bevestigen naar DB (null als niets bevestigbaar). */
  commit: import("./commitTypes").UnifiedSeasonCommitPayload | null;
};

type TeamLike = { team_id: number; team_name: string };

function teamLabel(teams: TeamLike[], id: number | null | undefined): string {
  if (id == null) return "—";
  return teams.find((t) => t.team_id === id)?.team_name ?? `Team ${id}`;
}

/** Verdeel teams over reeksen volgens geschatte counts (of gelijkmatig). */
export function assignTeamsToDivisions(
  teamIds: number[],
  divisionIds: number[],
  divisionTeamCounts: number[],
): Record<number, number> {
  const assignment: Record<number, number> = {};
  if (divisionIds.length === 0 || teamIds.length === 0) return assignment;

  const targets = divisionIds.map((_, i) =>
    Math.max(0, Math.floor(divisionTeamCounts[i] ?? 0)),
  );
  let targetSum = targets.reduce((a, b) => a + b, 0);

  // Geen geldige targets → gelijkmatig over reeksen, max. alle teams
  let counts =
    targetSum > 0
      ? [...targets]
      : divisionIds.map((_, i) =>
          i < divisionIds.length - 1
            ? Math.floor(teamIds.length / divisionIds.length)
            : teamIds.length -
              Math.floor(teamIds.length / divisionIds.length) * (divisionIds.length - 1),
        );

  // Cap: gebruik hoogstens targetSum teams als targets gezet zijn
  const pool =
    targetSum > 0 && targetSum < teamIds.length ? teamIds.slice(0, targetSum) : [...teamIds];

  // Herverdeel rest gelijkmatig i.p.v. alles in de laatste reeks te dumpen
  if (targetSum > 0 && pool.length > targetSum) {
    // unreachable due to slice — keep for safety
  }
  if (targetSum > 0 && pool.length < targetSum) {
    // Te weinig teams: schaal counts naar pool.length
    let left = pool.length;
    counts = counts.map((c, i) => {
      if (i === counts.length - 1) return left;
      const take = Math.min(c, left);
      left -= take;
      return take;
    });
  }

  let cursor = 0;
  for (let i = 0; i < divisionIds.length; i++) {
    const take = Math.min(counts[i] || 0, pool.length - cursor);
    for (let j = 0; j < take; j++) {
      const tid = pool[cursor++];
      if (tid != null) assignment[tid] = divisionIds[i];
    }
  }
  // Geen extra teams meer over de reeksen verdelen — dat blies 11+11 op naar 11+13/12+12
  return assignment;
}

function pickCompetitionTeams(setup: SeasonSetup, allTeams: TeamLike[]): number[] {
  const ids = allTeams.map((t) => t.team_id);
  const assigned = Object.keys(setup.competition.teamDivisions ?? {})
    .map(Number)
    .filter((id) => ids.includes(id));
  if (setup.competition.hasDivisions && assigned.length >= 4) {
    return assigned;
  }
  if (setup.competition.hasDivisions) {
    const needed = setup.competition.divisionTeamCounts.reduce(
      (s, n) => s + Math.max(0, n),
      0,
    );
    if (needed > 0) return ids.slice(0, Math.min(needed, ids.length));
    return ids;
  }
  const n = Math.max(2, setup.competition.estimatedTeamCount || ids.length);
  return ids.slice(0, Math.min(n, ids.length));
}

function pickCupTeams(setup: SeasonSetup, allTeams: TeamLike[]): number[] {
  const ids = allTeams.map((t) => t.team_id);
  if (setup.cup.useAllTeams) return ids;
  const n = resolveCupTeamCount(setup, ids.length);
  return ids.slice(0, Math.min(n, ids.length));
}

/** Teams met een geplande bekerwedstrijd die week (ook eenzijdig: 1/8 met bye-prefill). */
export function cupBusyTeamsByMondayFromPlan(
  plan: Array<{
    home_team_id: number | null;
    away_team_id: number | null;
    match_date: string;
    match_time?: string;
    venue?: string;
  }>,
  toMonday: (date: string) => string,
): Record<string, number[]> {
  const map = new Map<string, Set<number>>();
  for (const p of plan) {
    if (!p.match_date) continue;
    // Competitie-BYE markers of lege TBD zonder team
    if (p.venue === "BYE" || p.match_time === "00:00") continue;
    if (p.home_team_id == null && p.away_team_id == null) continue;
    const monday = toMonday(p.match_date);
    let set = map.get(monday);
    if (!set) {
      set = new Set();
      map.set(monday, set);
    }
    if (p.home_team_id != null) set.add(p.home_team_id);
    if (p.away_team_id != null) set.add(p.away_team_id);
  }
  const out: Record<string, number[]> = {};
  for (const [monday, set] of map) {
    out[monday] = Array.from(set);
  }
  return out;
}

/**
 * Echte bekerdatums per ploeg, per ISO-maandag.
 * De ≥3-dagen-uitzondering moet op de werkelijke wedstrijddag rekenen: een beker
 * op donderdag laat geen competitie op vrijdag toe, ook al is maandag de bekerdag.
 */
export function cupTeamDatesByMondayFromPlan(
  plan: Array<{
    home_team_id: number | null;
    away_team_id: number | null;
    match_date: string;
    match_time?: string;
    venue?: string;
  }>,
  toMonday: (date: string) => string,
): Record<string, Record<number, string[]>> {
  const out: Record<string, Record<number, string[]>> = {};
  for (const p of plan) {
    if (!p.match_date) continue;
    if (p.venue === "BYE" || p.match_time === "00:00") continue;
    const monday = toMonday(p.match_date);
    const date = p.match_date.slice(0, 10);
    const byTeam = (out[monday] ??= {});
    for (const teamId of [p.home_team_id, p.away_team_id]) {
      if (teamId == null) continue;
      const dates = (byTeam[teamId] ??= []);
      if (!dates.includes(date)) dates.push(date);
    }
  }
  return out;
}

/**
 * Alle bekerwedstrijddagen per ISO-maandag, ook TBD (HF/finale zonder ploegen).
 * Competitie mag nooit op dezelfde kalenderdag.
 */
export function cupDatesByMondayFromPlan(
  plan: Array<{
    match_date: string;
    match_time?: string;
    venue?: string;
  }>,
  toMonday: (date: string) => string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of plan) {
    if (!p.match_date) continue;
    if (p.venue === "BYE" || p.match_time === "00:00") continue;
    const monday = toMonday(p.match_date);
    const date = p.match_date.slice(0, 10);
    const arr = (out[monday] ??= []);
    if (!arr.includes(date)) arr.push(date);
  }
  return out;
}

/**
 * Week waarin minstens één bekerduel nog geen (volledige) ploegen heeft.
 * Dan kan eender welke ploeg nog spelen → competitie ≥3 dagen van de bekerdag.
 */
export function cupUnassignedByMondayFromPlan(
  plan: Array<{
    home_team_id: number | null;
    away_team_id: number | null;
    match_date: string;
    match_time?: string;
    venue?: string;
  }>,
  toMonday: (date: string) => string,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of plan) {
    if (!p.match_date) continue;
    if (p.venue === "BYE" || p.match_time === "00:00") continue;
    const monday = toMonday(p.match_date);
    const incomplete = p.home_team_id == null || p.away_team_id == null;
    out[monday] = Boolean(out[monday]) || incomplete;
  }
  return out;
}

/** Slot-indices die de bekerpreview al claimt (per ISO-maandag). */
export function cupOccupiedSlotsByMondayFromPlan(
  plan: Array<{
    match_date: string;
    match_time?: string;
    venue?: string;
    slot_index?: number;
  }>,
  toMonday: (date: string) => string,
): Record<string, number[]> {
  const map = new Map<string, Set<number>>();
  for (const p of plan) {
    if (!p.match_date) continue;
    if (p.venue === "BYE" || p.match_time === "00:00") continue;
    if (typeof p.slot_index !== "number" || p.slot_index < 0) continue;
    const monday = toMonday(p.match_date);
    let set = map.get(monday);
    if (!set) {
      set = new Set();
      map.set(monday, set);
    }
    set.add(p.slot_index);
  }
  const out: Record<string, number[]> = {};
  for (const [monday, set] of map) {
    out[monday] = Array.from(set);
  }
  return out;
}

function normalizePreviewTime(value: string | null | undefined): string {
  if (!value) return "";
  const raw = value.includes("T") ? value.split("T")[1] ?? value : value;
  return raw.slice(0, 5);
}

/**
 * Lege beschikbare speelmomenten.
 * Standaard op weken met preview-wedstrijden; optioneel ook extra weekmaandagen
 * (bv. alle speelbare kalenderweken) zodat lege weken zichtbaar blijven.
 */
export function buildEmptyFreePreviewRows(input: {
  occupiedRows: UnifiedPreviewRow[];
  slotDetails: SlotDetailLike[];
  blocks?: SlotUnavailability[];
  vacations?: VacationLike[];
  /** Extra ISO-maandagen om mee te nemen (ook zonder wedstrijden). */
  extraWeekMondays?: string[];
}): UnifiedPreviewRow[] {
  const weekMondays = new Set<string>();
  const occupancy: OccupancyMatchLike[] = [];

  for (const row of input.occupiedRows) {
    if (row.phase === "free" || row.phase === "vacation" || row.phase === "blocked") {
      continue;
    }
    if (!row.match_date) continue;
    if (row.venue === "BYE" || row.match_time === "00:00") continue;
    const monday = toMondayIso(row.match_date);
    weekMondays.add(monday);
    // Conceptrijen zonder tijd of locatie (bv. play-offs) claimen nog geen slot;
    // ze meetellen zou greedy een écht vrij speelmoment opeten.
    if (!row.match_time || !row.venue) continue;
    occupancy.push({
      match_date: row.match_date.slice(0, 10),
      location: row.venue,
      match_time: row.match_time,
      is_cup_match: row.phase === "cup",
      is_playoff_match: row.phase === "playoff",
    });
  }

  for (const m of input.extraWeekMondays ?? []) {
    if (m) weekMondays.add(toMondayIso(m));
  }

  if (weekMondays.size === 0 || input.slotDetails.length === 0) return [];

  const grids = buildSeasonSlotGrids({
    weekMondays: Array.from(weekMondays).sort(),
    slotDetails: input.slotDetails,
    blocks: input.blocks ?? [],
    vacations: input.vacations ?? [],
    matches: occupancy,
  });

  const freeRows: UnifiedPreviewRow[] = [];
  for (const monday of Array.from(weekMondays).sort()) {
    const grid = grids.get(monday);
    if (!grid) continue;
    for (const slot of grid.slots) {
      if (slot.status !== "available") continue;
      if (!slot.matchDate) continue;
      const dayName =
        typeof slot.dayOfWeek === "number"
          ? DAY_OF_WEEK_NAMES[slot.dayOfWeek] ?? "Speeldag"
          : "Speeldag";
      freeRows.push({
        phase: "free",
        speeldag: `Vrij · ${dayName}`,
        homeLabel: "—",
        awayLabel: "—",
        match_date: slot.matchDate,
        match_time: normalizePreviewTime(slot.startTime) || undefined,
        venue: slot.venue,
        note: "Leeg speelmoment",
      });
    }
  }

  return freeRows.sort(comparePreviewChronological);
}

/** Vakantie- en gesloten weken als chronologische markers in de preview. */
export function buildClosedCalendarPreviewRows(
  plan: SeasonPlan | null | undefined,
): UnifiedPreviewRow[] {
  if (!plan?.weeks?.length) return [];
  const rows: UnifiedPreviewRow[] = [];

  for (const week of plan.weeks) {
    const monday = week.weekMonday.slice(0, 10);
    if (week.phases.includes("vacation")) {
      rows.push({
        phase: "vacation",
        speeldag: "Vakantie",
        homeLabel: "—",
        awayLabel: "—",
        match_date: monday,
        match_time: undefined,
        venue: "—",
        note: week.label?.trim() || "Vakantieweek — geen wedstrijden",
      });
      continue;
    }
    if (
      week.phases.includes("blocked") ||
      (week.configAvailableCount <= 0 && week.freeCount <= 0)
    ) {
      rows.push({
        phase: "blocked",
        speeldag: "Gesloten",
        homeLabel: "—",
        awayLabel: "—",
        match_date: monday,
        match_time: undefined,
        venue: "—",
        note: week.label?.trim() || "Geen speelcapaciteit deze week",
      });
    }
  }

  return rows.sort(comparePreviewChronological);
}

async function previewCupSection(input: {
  setup: SeasonSetup;
  organizationId: number;
  teams: TeamLike[];
  plan: SeasonPlan | null;
}): Promise<{
  section: UnifiedPreviewSection;
  warnings: string[];
  busyByMonday: Record<string, number[]>;
  teamDatesByMonday: Record<string, Record<number, string[]>>;
  occupiedSlotsByMonday: Record<string, number[]>;
  cupDatesByMonday: Record<string, string[]>;
  cupUnassignedByMonday: Record<string, boolean>;
  commitPlan: import("./commitTypes").UnifiedCommitMatchPlan[] | null;
}> {
  const { setup, organizationId, teams, plan } = input;
  const warnings: string[] = [];
  const cupTeams = pickCupTeams(setup, teams);
  let dates = [...(plan?.cupDates ?? [])].sort();
  const requiredFromPlan = plan?.cupBracket.requiredWeeks ?? 0;

  if (cupTeams.length < 2) {
    return {
      section: {
        phase: "cup",
        label: "Beker",
        success: false,
        message: "Minstens 2 teams nodig voor de beker.",
        rows: [],
      },
      warnings,
      busyByMonday: {},
      teamDatesByMonday: {},
      occupiedSlotsByMonday: {},
      cupDatesByMonday: {},
      cupUnassignedByMonday: {},
      commitPlan: null,
    };
  }
  if (dates.length < 3) {
    return {
      section: {
        phase: "cup",
        label: "Beker",
        success: false,
        message:
          "Onvoldoende bekerweken in de kalender. Vernieuw de kalender of markeer bekerweken handmatig.",
        rows: [],
      },
      warnings,
      busyByMonday: {},
      teamDatesByMonday: {},
      occupiedSlotsByMonday: {},
      cupDatesByMonday: {},
      cupUnassignedByMonday: {},
      commitPlan: null,
    };
  }

  if (requiredFromPlan > 0 && dates.length !== requiredFromPlan) {
    if (dates.length > requiredFromPlan) {
      dates = dates.slice(0, requiredFromPlan);
    }
    warnings.push(
      `Beker: kalender had ${plan?.cupDates?.length ?? 0} weken, bracket verwacht ${requiredFromPlan}. Preview gebruikt ${dates.length} weken.`,
    );
  }
  if (dates.length < 3) {
    return {
      section: {
        phase: "cup",
        label: "Beker",
        success: false,
        message: `Nog ${3 - dates.length} bekerweek(en) te weinig na afstemming op de kalender.`,
        rows: [],
      },
      warnings,
      busyByMonday: {},
      teamDatesByMonday: {},
      occupiedSlotsByMonday: {},
      cupDatesByMonday: {},
      cupUnassignedByMonday: {},
      commitPlan: null,
    };
  }

  const byeTeamId = cupTeams.length % 2 === 1 ? cupTeams[0] : null;
  if (byeTeamId != null) {
    warnings.push(
      `Beker: oneven veld — ${teamLabel(teams, byeTeamId)} krijgt automatisch bye in de preview.`,
    );
  }

  try {
    const divisions = setup.competition.divisions ?? [];
    let teamDivisions = setup.competition.teamDivisions ?? {};
    if (
      divisions.length >= 2 &&
      Object.keys(teamDivisions).length < cupTeams.length &&
      setup.competition.hasDivisions
    ) {
      teamDivisions = {
        ...assignTeamsToDivisions(
          cupTeams,
          divisions.map((d) => d.id),
          setup.competition.divisionTeamCounts,
        ),
        ...teamDivisions,
      };
    }
    const teamRank = buildCupTeamRankMap(
      cupTeams,
      teamDivisions,
      divisionRankBySortOrder(divisions),
    );
    const hasRanks = Object.values(teamRank).some((r) => r < 99);
    if (hasRanks) {
      warnings.push(
        "Beker-loting: voorronde bij voorkeur Tweede klasse; Eerste klasse zo veel mogelijk bye en gespreid in de volgende ronde.",
      );
    }

    let res = await bekerService.previewCupTournament(
      cupTeams,
      dates,
      8,
      byeTeamId,
      organizationId,
      { teamRank },
    );
    if (!res.success && /exact (\d+) speelweken/i.test(res.message || "")) {
      const m = res.message.match(/exact (\d+) speelweken/i);
      const need = m ? Number(m[1]) : 0;
      if (need >= 3) {
        let adjusted = [...(plan?.cupDates ?? [])].sort();
        if (adjusted.length > need) adjusted = adjusted.slice(0, need);
        if (adjusted.length < need && setup.cup.preferredWeeks?.length) {
          const extra = setup.cup.preferredWeeks
            .filter((d) => !adjusted.includes(d))
            .sort();
          adjusted = [...adjusted, ...extra].slice(0, need);
        }
        if (adjusted.length === need) {
          warnings.push(`Bekerweken bijgestuurd naar ${need} (vereiste van de bracket).`);
          res = await bekerService.previewCupTournament(
            cupTeams,
            adjusted,
            8,
            byeTeamId,
            organizationId,
            { teamRank },
          );
        }
      }
    }
    if (!res.success || !res.plan?.length) {
      return {
        section: {
          phase: "cup",
          label: "Beker",
          success: false,
          message: res.message || "Geen bekerplan.",
          rows: [],
        },
        warnings,
        busyByMonday: {},
        teamDatesByMonday: {},
        occupiedSlotsByMonday: {},
        cupDatesByMonday: {},
        cupUnassignedByMonday: {},
        commitPlan: null,
      };
    }

    const { toMondayIso } = await import("@/lib/competitionPlanningEstimate");
    const lastFriday = lastPlayableFriday(
      (plan?.weeks ?? []).map((w) => w.weekMonday),
    );
    if (lastFriday) {
      pinCupFinalToDate(res.plan, lastFriday, "21:00");
    }
    const busyByMonday = cupBusyTeamsByMondayFromPlan(res.plan, toMondayIso);
    const teamDatesByMonday = cupTeamDatesByMondayFromPlan(res.plan, toMondayIso);
    const occupiedSlotsByMonday = cupOccupiedSlotsByMondayFromPlan(res.plan, toMondayIso);
    const cupDatesByMonday = cupDatesByMondayFromPlan(res.plan, toMondayIso);
    const cupUnassignedByMonday = cupUnassignedByMondayFromPlan(res.plan, toMondayIso);
    const commitPlan = res.plan.map((p) => ({
      unique_number: p.unique_number,
      speeldag: p.speeldag,
      home_team_id: p.home_team_id,
      away_team_id: p.away_team_id,
      match_date: p.match_date,
      match_time: p.match_time,
      venue: p.venue,
    }));
    return {
      section: {
        phase: "cup",
        label: "Beker",
        success: true,
        message: `${res.plan.length} wedstrijden`,
        rows: res.plan.map((p) => ({
          phase: "cup" as const,
          speeldag: p.speeldag,
          homeLabel: teamLabel(teams, p.home_team_id),
          awayLabel: teamLabel(teams, p.away_team_id),
          match_date: p.match_date,
          match_time: p.match_time,
          venue: p.venue,
          homeTeamId: p.home_team_id,
          awayTeamId: p.away_team_id,
        })),
      },
      warnings,
      busyByMonday,
      teamDatesByMonday,
      occupiedSlotsByMonday,
      cupDatesByMonday,
      cupUnassignedByMonday,
      commitPlan,
    };
  } catch (e) {
    return {
      section: {
        phase: "cup",
        label: "Beker",
        success: false,
        message: e instanceof Error ? e.message : "Beker-preview mislukt",
        rows: [],
      },
      warnings,
      busyByMonday: {},
      teamDatesByMonday: {},
      occupiedSlotsByMonday: {},
      cupDatesByMonday: {},
      cupUnassignedByMonday: {},
      commitPlan: null,
    };
  }
}

export async function buildUnifiedSeasonPreview(input: {
  setup: SeasonSetup;
  seasonStart: string;
  seasonEnd: string;
  organizationId: number;
  teams: TeamLike[];
  plan: SeasonPlan | null;
  /** Laatste redmiddel: max. 2×/week/ploeg, nooit dezelfde dag. */
  allowDualMatchWeek?: boolean;
  onProgress?: (progress: { percent: number; label: string }) => void;
}): Promise<UnifiedSeasonPreview> {
  const { setup, seasonStart, seasonEnd, organizationId, teams, plan } = input;
  const allowDualMatchWeek = Boolean(input.allowDualMatchWeek);
  const onProgress = input.onProgress;
  const sections: UnifiedPreviewSection[] = [];
  const warnings: string[] = [];

  onProgress?.({ percent: 5, label: "Start preview…" });

  if (!seasonStart || !seasonEnd) {
    return {
      sections: [],
      rows: [],
      warnings: ["Stel eerst seizoensstart en -eind in via Instellingen."],
      commit: null,
    };
  }

  if (teams.length === 0) {
    return {
      sections: [],
      rows: [],
      warnings: ["Geen teams gevonden voor deze organisatie."],
      commit: null,
    };
  }

  if (plan?.cupDates?.length && plan.daySeparation?.separated) {
    const exceptionPossible = hasSufficientSameWeekDayGap(
      plan.daySeparation.early,
      plan.daySeparation.late,
    );
    warnings.push(
      `Op bekerweken: beker op ${plan.daySeparation.earlyLabel}, competitie op de resterende speelmomenten (${plan.daySeparation.lateLabel}). ` +
        (allowDualMatchWeek
          ? "Geforceerd schema: max. 2 wedstrijden per ploeg per week, minstens 2 dagen ertussen (ook t.o.v. beker)."
          : exceptionPossible
            ? "Een ploeg speelt bij voorkeur 1× per week; restslots mogen 2×/week met ≥2 dagen ertussen. Beker + competitie dezelfde week: ≥3 dagen. Past het niet: automatisch opnieuw met beker-gap 2 dagen."
            : `Een ploeg speelt bij voorkeur 1× per week; restslots mogen 2×/week met ≥2 dagen ertussen. Met ${plan.daySeparation.earlyLabel} en ${plan.daySeparation.lateLabel} is beker + competitie dezelfde week te krap voor ≥3 dagen. Past het niet: automatisch opnieuw met beker-gap 2 dagen.`),
    );
  }
  if (allowDualMatchWeek) {
    warnings.push(
      "Schema forceren actief: max. 2 wedstrijden/ploeg/week toegestaan (beker + competitie of 2× competitie), altijd met minstens 2 dagen ertussen (ook bij bekerdoorstroming).",
    );
  }
  if (plan?.sharedCupMondays?.length) {
    warnings.push(
      `${plan.sharedCupMondays.length} bekerweek(en) delen speelmomenten met de competitie (ploegen zonder beker die week).`,
    );
  }

  // Beker eerst (indien aan): bezette teams + slots doorgeven aan competitie
  let cupSection: UnifiedPreviewSection | null = null;
  let cupBusyTeamsByMonday: Record<string, number[]> = {};
  let cupTeamDatesByMonday: Record<string, Record<number, string[]>> = {};
  let cupOccupiedSlotsByMonday: Record<string, number[]> = {};
  let cupDatesByMonday: Record<string, string[]> = {};
  let cupUnassignedByMonday: Record<string, boolean> = {};
  let cupCommitPlan: import("./commitTypes").UnifiedCommitMatchPlan[] | null = null;
  let competitionCommitPlan: import("./commitTypes").UnifiedCommitMatchPlan[] | null =
    null;
  let playoffIntent: import("./commitTypes").UnifiedPlayoffCommitIntent | null = null;

  if (setup.systems.cup) {
    onProgress?.({ percent: 12, label: "Beker inplannen…" });
    const cup = await previewCupSection({ setup, organizationId, teams, plan });
    warnings.push(...cup.warnings);
    cupSection = cup.section;
    cupBusyTeamsByMonday = cup.busyByMonday;
    cupTeamDatesByMonday = cup.teamDatesByMonday;
    cupOccupiedSlotsByMonday = cup.occupiedSlotsByMonday;
    cupDatesByMonday = cup.cupDatesByMonday;
    cupUnassignedByMonday = cup.cupUnassignedByMonday;
    cupCommitPlan = cup.commitPlan;
  }

  // —— Competitie ——
  if (setup.systems.competition) {
    onProgress?.({ percent: 18, label: "Competitie voorbereiden…" });
    const format = buildSeasonSetupFormat(setup);
    const teamIds = pickCompetitionTeams(setup, teams);
    if (teamIds.length < 4) {
      sections.push({
        phase: "competition",
        label: "Competitie",
        success: false,
        message: `Minstens 4 teams nodig (nu ${teamIds.length}).`,
        rows: [],
      });
    } else {
      const teamDivisions =
        format.has_divisions && (format.divisions?.length ?? 0) >= 2
          ? (() => {
              const saved = setup.competition.teamDivisions ?? {};
              const savedIds = Object.keys(saved).map(Number);
              const usable = savedIds.filter((id) => teamIds.includes(id));
              if (usable.length >= 4) {
                const filtered: Record<number, number> = {};
                for (const id of usable) filtered[id] = saved[id];
                return filtered;
              }
              return assignTeamsToDivisions(
                teamIds,
                format.divisions!.map((d) => d.id),
                setup.competition.divisionTeamCounts,
              );
            })()
          : undefined;

      if (teamDivisions) {
        const fromSaved =
          Object.keys(setup.competition.teamDivisions ?? {}).length > 0 &&
          Object.keys(teamDivisions).every(
            (id) => setup.competition.teamDivisions?.[Number(id)] === teamDivisions[Number(id)],
          );
        warnings.push(
          fromSaved
            ? "Competitie-reeksen: opgeslagen teamtoewijzing uit Seizoensopzet."
            : "Competitie-reeksen: teams automatisch verdeeld voor preview (wijzig in Opzet → Competitie).",
        );
      }

      try {
        const runCompetition = (dual: boolean) =>
          competitionService.previewCompetition({
            format,
            start_date: seasonStart,
            end_date: seasonEnd,
            teams: teamIds,
            organizationId,
            teamDivisions,
            reservedCupMondays: plan?.cupDates ?? [],
            reservedPlayoffMondays: plan?.playoffWeeks ?? [],
            shareCupWeeks:
              Boolean(plan?.daySeparation?.separated) || dual || allowDualMatchWeek,
            sharedCupMondays: plan?.sharedCupMondays ?? [],
            competitionPreferredDayOfWeek: plan?.daySeparation?.separated
              ? plan.daySeparation.late
              : undefined,
            cupPreferredDayOfWeek: plan?.daySeparation?.separated
              ? plan.daySeparation.early
              : undefined,
            cupBusyTeamsByMonday,
            cupTeamDatesByMonday,
            cupOccupiedSlotsByMonday,
            cupDatesByMonday,
            cupUnassignedByMonday,
            allowDualMatchWeek: dual,
            onProgress: (p) => {
              onProgress?.({
                percent: Math.min(92, Math.max(18, p.percent)),
                label: p.label,
              });
            },
          });

        let res = await runCompetition(allowDualMatchWeek);
        let usedDualFallback = false;
        // Near-miss: automatisch opnieuw met max. 2×/week en ≥2 dagen ertussen
        // (incl. beker + competitie / doorstromingsrisico).
        if (
          !allowDualMatchWeek &&
          (!res.success || !res.plan?.length) &&
          (Boolean(res.message?.startsWith("Bijna:")) ||
            Boolean(res.message?.includes("vrije competitie-slots")))
        ) {
          onProgress?.({
            percent: 45,
            label:
              "Bijna gelukt — opnieuw met max. 2×/week (≥2 dagen ertussen)…",
          });
          const retry = await runCompetition(true);
          if (retry.success && retry.plan?.length) {
            res = retry;
            usedDualFallback = true;
            warnings.push(
              "Automatisch versoepeld: sommige ploegen spelen 2× in één week, altijd met minstens 2 dagen ertussen (ook t.o.v. beker / doorstroming).",
            );
          } else if (
            (retry.plan?.length ?? 0) > (res.plan?.length ?? 0) ||
            (retry.message?.startsWith("Bijna:") &&
              (retry.message?.length ?? 0) > 0)
          ) {
            // Houd het beste resultaat voor de foutmelding
            res = retry;
            usedDualFallback = true;
          }
        }

        if (!res.success || !res.plan?.length) {
          sections.push({
            phase: "competition",
            label: "Competitie",
            success: false,
            message: res.message || "Geen competitieplan.",
            suggestions: res.suggestions,
            rows: [],
          });
        } else {
          competitionCommitPlan = res.plan.map((p) => ({
            unique_number: p.unique_number,
            speeldag: p.speeldag,
            home_team_id: p.home_team_id,
            away_team_id: p.away_team_id,
            match_date: p.match_date,
            match_time: p.match_time,
            venue: p.venue,
          }));
          sections.push({
            phase: "competition",
            label: "Competitie",
            success: true,
            message: usedDualFallback
              ? `${res.plan.length} wedstrijden (deels 2×/week, ≥2d gap)`
              : `${res.plan.length} wedstrijden`,
            rows: res.plan.map((p) => ({
              phase: "competition" as const,
              speeldag: p.speeldag,
              homeLabel: teamLabel(teams, p.home_team_id),
              awayLabel: teamLabel(teams, p.away_team_id),
              match_date: p.match_date,
              match_time: p.match_time,
              venue: p.venue,
              round: p.round ?? null,
              homeTeamId: p.home_team_id,
              awayTeamId: p.away_team_id,
              note:
                p.details?.combined != null
                  ? `score ${p.details.combined}/${p.details.maxCombined}`
                  : undefined,
            })),
          });
        }
      } catch (e) {
        sections.push({
          phase: "competition",
          label: "Competitie",
          success: false,
          message: e instanceof Error ? e.message : "Competitie-preview mislukt",
          rows: [],
        });
      }
    }
  }

  if (cupSection) {
    sections.push(cupSection);
  }

  // —— Play-offs (in-memory, geen DB-write) ——
  if (setup.systems.playoffs) {
    onProgress?.({ percent: 95, label: "Play-offs toevoegen…" });
    const topN = setup.playoffs.topTeams;
    const bottomN = setup.playoffs.bottomTeams;
    const rounds = setup.playoffs.rounds;
    const topPositions = Array.from({ length: topN }, (_, i) => i + 1);
    const bottomPositions = Array.from({ length: bottomN }, (_, i) => topN + i + 1);
    const playoffWeeks = plan?.playoffWeeks ?? [];

    const topPairs = playoffService.generatePlayoffRoundRobinMatches(
      topPositions,
      "top",
      rounds,
    );
    const bottomPairs = playoffService.generatePlayoffRoundRobinMatches(
      bottomPositions,
      "bottom",
      rounds,
    );

    const mapPairs = (
      pairs: Array<{
        home_position: number;
        away_position: number;
        round: string;
        matchday: number;
      }>,
      kind: "Top" | "Bottom",
    ): UnifiedPreviewRow[] =>
      pairs.map((p) => {
        const week = playoffWeeks[Math.max(0, p.matchday - 1)] ?? "";
        return {
          phase: "playoff" as const,
          speeldag: `${kind} · ${p.round} · speeldag ${p.matchday}`,
          homeLabel: `Positie ${p.home_position}`,
          awayLabel: `Positie ${p.away_position}`,
          match_date: week,
          note: week
            ? "Datum = gereserveerde play-offweek (teams na eindrangschikking)"
            : "Nog geen play-offweek gereserveerd in kalender",
        };
      });

    const playoffRows = [...mapPairs(topPairs, "Top"), ...mapPairs(bottomPairs, "Bottom")];
    if (playoffRows.length === 0) {
      sections.push({
        phase: "playoff",
        label: "Play-offs",
        success: false,
        message: "Geen play-offparen gegenereerd.",
        rows: [],
      });
    } else {
      if (playoffWeeks.length === 0) {
        warnings.push(
          "Play-offs: concept-paren zonder kalenderdata — vernieuw de kalender of reserveer speeldagen.",
        );
      }
      sections.push({
        phase: "playoff",
        label: "Play-offs",
        success: true,
        message: `${playoffRows.length} concept-wedstrijden (posities, nog geen teams)`,
        rows: playoffRows,
      });
      playoffIntent = {
        topPositions,
        bottomPositions,
        rounds,
        startDate: seasonStart,
        endDate: seasonEnd,
      };
    }
  }

  onProgress?.({ percent: 98, label: "Preview afronden…" });

  const scheduledRows = sections.flatMap((s) => s.rows);
  const closedRows = buildClosedCalendarPreviewRows(plan);

  const extraWeekMondays =
    plan?.weeks
      .filter(
        (w) =>
          !w.phases.includes("vacation") &&
          !w.phases.includes("blocked") &&
          w.configAvailableCount > 0,
      )
      .map((w) => w.weekMonday) ?? [];

  let freeRows: UnifiedPreviewRow[] = [];
  if (scheduledRows.length > 0 || extraWeekMondays.length > 0) {
    try {
      const slotCtx = await loadSlotPlanningContext(organizationId);
      freeRows = buildEmptyFreePreviewRows({
        occupiedRows: scheduledRows,
        slotDetails: slotCtx.slotDetails,
        blocks: slotCtx.blocks,
        vacations: slotCtx.vacations,
        extraWeekMondays,
      });
      if (freeRows.length > 0) {
        warnings.push(
          `${freeRows.length} leeg speelmoment${freeRows.length === 1 ? "" : "en"} op speelbare weken (filter “Vrij”).`,
        );
      }
    } catch (e) {
      console.warn("Could not compute empty free preview slots:", e);
    }
  }

  if (closedRows.length > 0) {
    const blockedCount = closedRows.filter((r) => r.phase === "blocked").length;
    if (blockedCount > 0) {
      warnings.push(
        `${blockedCount} gesloten week${blockedCount === 1 ? "" : "en"} in de preview (filter “Gesloten”).`,
      );
    }
  }

  const assembled = [
    ...scheduledRows,
    ...freeRows,
    ...closedRows.filter((r) => r.phase !== "vacation"),
  ];
  const relocated = relocateCupFinalToStandaloneDay(assembled);
  if (relocated.warning) warnings.push(relocated.warning);
  if (relocated.moved) {
    const finale = relocated.rows.find(
      (r) => r.phase === "cup" && r.speeldag.trim().toLowerCase() === "finale",
    );
    if (finale && cupCommitPlan) {
      const idx = cupCommitPlan.findIndex(
        (p) => p.unique_number === "FINAL" || p.speeldag === "Finale",
      );
      if (idx >= 0) {
        cupCommitPlan[idx] = {
          ...cupCommitPlan[idx],
          match_date: finale.match_date,
          match_time: finale.match_time ?? cupCommitPlan[idx].match_time,
          venue: finale.venue ?? cupCommitPlan[idx].venue,
        };
      }
    }
    const cupSec = sections.find((s) => s.phase === "cup");
    if (cupSec && finale) {
      cupSec.rows = cupSec.rows.map((r) =>
        r.speeldag.trim().toLowerCase() === "finale" ? { ...r, ...finale, phase: "cup" } : r,
      );
    }
  }

  const rows = [...relocated.rows].sort(compareUnifiedPreviewRows);

  if (sections.length === 0) {
    warnings.push("Geen speelsysteem geselecteerd in de opzet.");
  }

  const hasCommit =
    (cupCommitPlan?.length ?? 0) > 0 ||
    (competitionCommitPlan?.length ?? 0) > 0 ||
    playoffIntent != null;

  const commit = hasCommit
    ? {
        organizationId,
        competitionPlan: competitionCommitPlan,
        cupPlan: cupCommitPlan,
        playoffIntent,
      }
    : null;

  if (commit && playoffIntent) {
    warnings.push(
      "Play-offs bij bevestigen: conceptwedstrijden worden opnieuw ingepland op vrije slots ná beker/competitie (tijden kunnen licht verschillen van de preview-tabel).",
    );
  }

  return { sections, rows, warnings, commit };
}
