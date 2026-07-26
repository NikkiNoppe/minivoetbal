/** Ruim slot-blokkades op die nog aan een vakantie hangen maar buiten de actieve periode vallen. */

import { isDateInVacationPeriod, type VacationLike } from "@/lib/competitionPlanningEstimate";
import type { SlotUnavailability } from "@/types/slotUnavailability";

function vacationLabels(vacations: VacationLike[]): Set<string> {
  const set = new Set<string>();
  for (const v of vacations) {
    if (v.is_active === false) continue;
    const name = String((v as { name?: string }).name ?? "")
      .trim()
      .toLowerCase();
    if (name) set.add(name);
  }
  return set;
}

function looksLikeVacationBlock(
  block: SlotUnavailability,
  labels: Set<string>,
): boolean {
  const name = (block.name || "").trim().toLowerCase();
  const reason = (block.reason || "").trim().toLowerCase();
  if (name && labels.has(name)) return true;
  if (reason && labels.has(reason)) return true;
  // Legacy: blokken met "vakantie" in naam/reden die bij een vakantieperiode hoorden
  if (/vakantie/.test(`${name} ${reason}`)) return true;
  // Verlengd weekend / Hemelvaart-achtige labels (niet exact gelijk aan periode-naam)
  if (/verlengd|hemelvaart/.test(`${name} ${reason}`)) {
    for (const label of labels) {
      if (/verlengd|hemelvaart/.test(label)) return true;
    }
  }
  return false;
}

/**
 * Verwijder actieve slot-blokkades die als vakantie gemarkeerd zijn maar waarvan
 * de datum niet meer in een actieve vakantieperiode valt (bv. ma 21/12 opengezet
 * terwijl kerstvakantie pas op 22/12 begint).
 */
export function pruneOrphanVacationSlotBlocks(
  blocks: SlotUnavailability[],
  vacations: VacationLike[],
): { blocks: SlotUnavailability[]; removed: SlotUnavailability[] } {
  const labels = vacationLabels(vacations);
  const removed: SlotUnavailability[] = [];
  const next: SlotUnavailability[] = [];

  for (const block of blocks) {
    if (block.is_active === false) {
      next.push(block);
      continue;
    }
    if (!looksLikeVacationBlock(block, labels)) {
      next.push(block);
      continue;
    }
    if (isDateInVacationPeriod(block.date, vacations)) {
      next.push(block);
      continue;
    }
    removed.push(block);
  }

  return { blocks: next, removed };
}
