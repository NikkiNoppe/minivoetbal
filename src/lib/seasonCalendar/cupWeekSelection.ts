/** Interactieve bekerweek-keuze: wat mag, wat is krap, wat is een voorstel. */

import type { DaySeparation, SeasonWeekPlan } from "./types";

export type CupWeekSelectability =
  | "selected"
  | "suggested"
  | "available"
  | "tight"
  | "blocked";

export type CupWeekSelectionStatus = {
  weekMonday: string;
  selectability: CupWeekSelectability;
  /** Mag toevoegen of verwijderen als bekerkeuze. */
  canToggle: boolean;
  /** Hard blok — klik toont fout. */
  blockReason: string | null;
  /** Soft waarschuwing bij toevoegen (toast, toggle mag). */
  warningOnSelect: string | null;
  /** Soft waarschuwing als deze week al gekozen is. */
  warningWhileSelected: string | null;
};

export type CupWeekSelectionSummary = {
  required: number;
  selectedCount: number;
  remaining: number;
  overSelected: number;
  /** Top-suggesties (nog niet gekozen), chronologisch. */
  suggestionMondays: string[];
  /** Korte statusregel voor de UI. */
  statusLine: string;
  byWeek: Map<string, CupWeekSelectionStatus>;
};

export type CupWeekSelectionInput = {
  weeks: SeasonWeekPlan[];
  preferredMondays: string[];
  /** Automatisch plan / voorstel (plan.cupDates). */
  suggestedMondays: string[];
  requiredWeeks: number;
  /** Min. vrije slots voor een “comfortabele” bekerweek (1e ronde). */
  minComfortableSlots: number;
  daySeparation?: DaySeparation | null;
};

function formatWeekShort(isoMonday: string): string {
  const d = new Date(`${isoMonday}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoMonday;
  return d.toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
}

/**
 * Beoordeel elke kalenderweek voor handmatige bekerselectie.
 * Suggesties = auto-voorstel dat nog niet gekozen is; krappe weken mogen wél
 * maar geven een waarschuwing.
 */
export function evaluateCupWeekSelection(
  input: CupWeekSelectionInput,
): CupWeekSelectionSummary {
  const preferred = new Set(input.preferredMondays.map((d) => d.slice(0, 10)));
  const suggested = new Set(input.suggestedMondays.map((d) => d.slice(0, 10)));
  const required = Math.max(0, Math.floor(input.requiredWeeks));
  const minSlots = Math.max(1, Math.floor(input.minComfortableSlots));
  const canShareByDay = Boolean(input.daySeparation?.separated);

  const byWeek = new Map<string, CupWeekSelectionStatus>();
  const suggestionMondays: string[] = [];

  for (const week of input.weeks) {
    const monday = week.weekMonday.slice(0, 10);
    const isSelected = preferred.has(monday);
    const isAutoSuggested = suggested.has(monday);
    const isPlayoff = week.phases.includes("playoff");
    const isVacation = week.phases.includes("vacation");
    const isBlockedPhase = week.phases.includes("blocked");
    const noCapacity =
      week.configAvailableCount <= 0 || week.freeCount <= 0;
    const isCompetition = week.phases.includes("competition");

    let blockReason: string | null = null;
    if (isVacation) {
      blockReason = "Vakantieweek — geen bekerwedstrijden.";
    } else if (isBlockedPhase || noCapacity) {
      blockReason = "Geen vrije slots (geblokkeerd of buiten speelperiode).";
    } else if (isPlayoff) {
      blockReason = "Play-offweek — beker hier niet mogelijk.";
    }

    let warningOnSelect: string | null = null;
    let warningWhileSelected: string | null = null;

    if (!blockReason && week.freeCount > 0 && week.freeCount < minSlots) {
      const msg = `Slechts ${week.freeCount} vrije slot(s); beker vraagt idealiter ≥${minSlots}.`;
      warningOnSelect = msg;
      warningWhileSelected = msg;
    }

    if (!blockReason && isCompetition) {
      const shareMsg = canShareByDay
        ? `Competitieweek: beker alleen realistisch met dagscheiding (${input.daySeparation!.earlyLabel} beker / ${input.daySeparation!.lateLabel} competitie).`
        : "Competitieweek zonder aparte speeldagen — teams riskeren 2× die week te spelen.";
      warningOnSelect = warningOnSelect ? `${warningOnSelect} ${shareMsg}` : shareMsg;
      warningWhileSelected = warningWhileSelected
        ? `${warningWhileSelected} ${shareMsg}`
        : shareMsg;
    }

    let selectability: CupWeekSelectability;
    if (blockReason) {
      selectability = "blocked";
    } else if (isSelected) {
      selectability =
        warningWhileSelected && (week.freeCount < minSlots || isCompetition)
          ? "tight"
          : "selected";
    } else if (isAutoSuggested) {
      selectability = "suggested";
      suggestionMondays.push(monday);
    } else if (warningOnSelect) {
      selectability = "tight";
    } else {
      selectability = "available";
    }

    // Ook niet-auto weken met goede capaciteit als fallback-suggestie
    if (
      !blockReason &&
      !isSelected &&
      !isAutoSuggested &&
      week.freeCount >= minSlots &&
      !isCompetition
    ) {
      // later sorteren / cap
    }

    byWeek.set(monday, {
      weekMonday: monday,
      selectability,
      canToggle: blockReason == null || isSelected,
      blockReason,
      warningOnSelect,
      warningWhileSelected,
    });
  }

  // Extra suggesties: vrije, comfortabele, niet-competitie weken als auto-lijst tekortschiet
  if (suggestionMondays.length < required) {
    const extras = input.weeks
      .filter((w) => {
        const st = byWeek.get(w.weekMonday.slice(0, 10));
        if (!st || st.blockReason || preferred.has(st.weekMonday)) return false;
        if (suggested.has(st.weekMonday)) return false;
        if (w.phases.includes("competition")) return false;
        return w.freeCount >= minSlots;
      })
      .sort((a, b) => b.freeCount - a.freeCount || a.weekMonday.localeCompare(b.weekMonday))
      .map((w) => w.weekMonday.slice(0, 10));

    for (const m of extras) {
      if (suggestionMondays.length >= Math.max(required, 6)) break;
      suggestionMondays.push(m);
      const prev = byWeek.get(m);
      if (prev && prev.selectability === "available") {
        byWeek.set(m, { ...prev, selectability: "suggested" });
      }
    }
  }

  suggestionMondays.sort((a, b) => a.localeCompare(b));

  const selectedCount = preferred.size;
  const remaining = Math.max(0, required - selectedCount);
  const overSelected = Math.max(0, selectedCount - required);

  let statusLine: string;
  if (required <= 0) {
    statusLine = "Geen bekerweken nodig.";
  } else if (selectedCount === 0) {
    const tip = suggestionMondays
      .slice(0, 4)
      .map(formatWeekShort)
      .join(", ");
    statusLine = tip
      ? `${required} bekerweken nodig. Suggesties: ${tip}${
          suggestionMondays.length > 4 ? "…" : ""
        }.`
      : `${required} bekerweken nodig — markeer bruikbare weken of zet het voorstel vast.`;
  } else if (remaining > 0) {
    const tip = suggestionMondays
      .filter((m) => !preferred.has(m))
      .slice(0, 4)
      .map(formatWeekShort)
      .join(", ");
    statusLine = `${selectedCount}/${required} gekozen — nog ${remaining} nodig${
      tip ? ` · o.a. ${tip}` : ""
    }.`;
  } else if (overSelected > 0) {
    statusLine = `${selectedCount} gekozen (${required} nodig) — planner gebruikt ${required} gespreid uit je selectie.`;
  } else {
    statusLine = `${selectedCount}/${required} bekerweken gekozen.`;
  }

  return {
    required,
    selectedCount,
    remaining,
    overSelected,
    suggestionMondays: suggestionMondays.filter((m) => !preferred.has(m)),
    statusLine,
    byWeek,
  };
}
