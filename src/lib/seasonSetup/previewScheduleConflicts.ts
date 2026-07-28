/**
 * Preview-conflicten: harde 2× per week (oranje) vs
 * potentieel bij bekerdoorstroming (groen).
 */

import { toMondayIso } from "@/lib/competitionPlanningEstimate";
import {
  hasMinimumDaySeparation,
  hasSufficientDayGapBetweenDates,
  MIN_DUAL_WEEK_DAY_GAP,
  MIN_SAME_WEEK_DAY_GAP,
} from "@/lib/competitionWeekPacking";
import type { UnifiedPreviewRow } from "./buildUnifiedPreview";

export type PreviewConflictKind = "double" | "advance_risk" | "shared_week";

export type PreviewTeamConflict = {
  cellKey: string;
  teamId: number;
  kind: PreviewConflictKind;
  reason: string;
};

function isRealMatch(row: UnifiedPreviewRow): boolean {
  if (!row.match_date) return false;
  if (row.phase === "free" || row.phase === "vacation" || row.phase === "blocked") {
    return false;
  }
  if (row.venue === "BYE" || row.match_time === "00:00") return false;
  return true;
}

function teamIdOn(row: UnifiedPreviewRow, side: "home" | "away"): number | null {
  const id = side === "home" ? row.homeTeamId : row.awayTeamId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/** Stabiele cel-sleutel (filter-ongevoelig). */
export function previewConflictCellKey(
  row: UnifiedPreviewRow,
  side: "home" | "away",
  teamId: number,
): string {
  return [
    row.phase,
    row.speeldag,
    row.match_date.slice(0, 10),
    row.match_time ?? "",
    side,
    String(teamId),
  ].join("|");
}

/**
 * Twee wedstrijden in één week: min. 2 dagen ertussen (max. 2 / ploeg / week).
 * Zelfde dag of opeenvolgende dagen = conflict.
 */
function isAllowedDualWeekGap(
  apps: Array<{ phase: string; date: string }>,
): boolean {
  if (apps.length !== 2) return false;
  return hasMinimumDaySeparation(
    apps[0].date,
    apps[1].date,
    MIN_DUAL_WEEK_DAY_GAP,
  );
}

/**
 * Beker + competitie in dezelfde week met ≥3 dagen ertussen (klassieke uitzondering),
 * of ≥2 dagen bij dual/force-spreiding.
 */
function isAllowedSharedWeekGap(
  apps: Array<{ phase: string; date: string }>,
): boolean {
  if (apps.length !== 2) return false;
  const phases = new Set(apps.map((a) => a.phase));
  if (!(phases.has("cup") && phases.has("competition"))) return false;
  const cup = apps.find((a) => a.phase === "cup")!;
  const competition = apps.find((a) => a.phase === "competition")!;
  if (hasSufficientDayGapBetweenDates(cup.date, competition.date, MIN_SAME_WEEK_DAY_GAP)) {
    return true;
  }
  // Dual/doorstroming: min. 2 dagen (ma→wo) telt ook als gedeelde week
  return hasMinimumDaySeparation(
    cup.date,
    competition.date,
    MIN_DUAL_WEEK_DAY_GAP,
  );
}

/**
 * Analyseer preview-rijen op:
 * - double: zelfde ploeg ≥2× in dezelfde ISO-week zonder geldige dagspreiding
 * - shared_week: 2× in één week op verschillende dagen (toegestaan, max. 2)
 * - advance_risk: bekerploeg kan doorstromen naar latere bekerweek waar ze al competitie hebben
 */
export function analyzePreviewTeamConflicts(
  rows: UnifiedPreviewRow[],
): PreviewTeamConflict[] {
  const results: PreviewTeamConflict[] = [];
  const doubleKeys = new Set<string>();

  type App = {
    cellKey: string;
    teamId: number;
    monday: string;
    phase: string;
    date: string;
  };
  const appearances: App[] = [];

  for (const row of rows) {
    if (!isRealMatch(row)) continue;
    const monday = toMondayIso(row.match_date);
    for (const side of ["home", "away"] as const) {
      const id = teamIdOn(row, side);
      if (id == null) continue;
      appearances.push({
        cellKey: previewConflictCellKey(row, side, id),
        teamId: id,
        monday,
        phase: row.phase,
        date: row.match_date.slice(0, 10),
      });
    }
  }

  const byTeamWeek = new Map<string, App[]>();
  for (const a of appearances) {
    const key = `${a.teamId}|${a.monday}`;
    const arr = byTeamWeek.get(key) ?? [];
    arr.push(a);
    byTeamWeek.set(key, arr);
  }
  for (const [, apps] of byTeamWeek) {
    if (apps.length < 2) continue;
    const phases = [...new Set(apps.map((x) => x.phase))].join(" + ");
    if (isAllowedSharedWeekGap(apps) || isAllowedDualWeekGap(apps)) {
      const d1 = apps[0].date;
      const d2 = apps[1].date;
      const classicGap = isAllowedSharedWeekGap(apps) &&
        apps.some((a) => a.phase === "cup") &&
        apps.some((a) => a.phase === "competition") &&
        hasSufficientDayGapBetweenDates(
          apps.find((a) => a.phase === "cup")!.date,
          apps.find((a) => a.phase === "competition")!.date,
          MIN_SAME_WEEK_DAY_GAP,
        );
      for (const a of apps) {
        results.push({
          cellKey: a.cellKey,
          teamId: a.teamId,
          kind: "shared_week",
          reason: classicGap
            ? `Gedeelde week: beker + competitie op ${d1} / ${d2} — ≥${MIN_SAME_WEEK_DAY_GAP} dagen ertussen`
            : `2× deze week op ${d1} / ${d2} — min. ${MIN_DUAL_WEEK_DAY_GAP} dagen ertussen (toegestaan, max. 2)`,
        });
      }
      continue;
    }
    for (const a of apps) {
      doubleKeys.add(a.cellKey);
      results.push({
        cellKey: a.cellKey,
        teamId: a.teamId,
        kind: "double",
        reason: `Speelt ${apps.length}× in week van ${a.monday} (${phases})`,
      });
    }
  }

  const cupWeeks = [
    ...new Set(
      rows
        .filter((r) => r.phase === "cup" && isRealMatch(r))
        .map((r) => toMondayIso(r.match_date)),
    ),
  ].sort();

  const competitionWeeksByTeam = new Map<number, Set<string>>();
  for (const a of appearances) {
    if (a.phase !== "competition") continue;
    const set = competitionWeeksByTeam.get(a.teamId) ?? new Set();
    set.add(a.monday);
    competitionWeeksByTeam.set(a.teamId, set);
  }

  const cupApps = appearances.filter((a) => a.phase === "cup");
  const advanceKeys = new Set<string>();

  // Groen alleen op de week mét overlap (competitie), niet op vroege beker (VR/1/8/…).
  for (const cup of cupApps) {
    const laterWeeks = cupWeeks.filter((w) => w > cup.monday);
    if (laterWeeks.length === 0) continue;
    const compWeeks = competitionWeeksByTeam.get(cup.teamId);
    if (!compWeeks) continue;

    for (const later of laterWeeks) {
      if (!compWeeks.has(later)) continue;
      const alreadyInLaterCup = cupApps.some(
        (x) => x.teamId === cup.teamId && x.monday === later,
      );
      if (alreadyInLaterCup) continue;

      for (const a of appearances) {
        if (a.phase !== "competition" || a.teamId !== cup.teamId || a.monday !== later) {
          continue;
        }
        if (doubleKeys.has(a.cellKey) || advanceKeys.has(a.cellKey)) continue;
        advanceKeys.add(a.cellKey);
        results.push({
          cellKey: a.cellKey,
          teamId: a.teamId,
          kind: "advance_risk",
          reason: `Risico: bij bekerdoorstroming speelt deze ploeg die week ook beker`,
        });
      }
    }
  }

  return results;
}

/** Ernst per soort: een harde dubbele boeking wint van een waarschuwing of info. */
const CONFLICT_SEVERITY: Record<PreviewConflictKind, number> = {
  double: 3,
  advance_risk: 2,
  shared_week: 1,
};

export function conflictLookup(
  conflicts: PreviewTeamConflict[],
): Map<string, PreviewTeamConflict> {
  const map = new Map<string, PreviewTeamConflict>();
  for (const c of conflicts) {
    const prev = map.get(c.cellKey);
    if (!prev || CONFLICT_SEVERITY[c.kind] > CONFLICT_SEVERITY[prev.kind]) {
      map.set(c.cellKey, c);
    }
  }
  return map;
}
