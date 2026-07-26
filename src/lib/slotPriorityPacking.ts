/**
 * SlotDetails zijn gesorteerd op priority (laagste index = hoogste prioriteit).
 * We prefereren hoge prioriteit, maar laten lagere slots (bv. 18:00) mee doen
 * zodat packing/preview vaker slaagt en capaciteit beter benut wordt.
 */

/** Bonus per prioriteitsstap (index 0 = hoogste). Zacht genoeg voor teamvoorkeuren. */
export const SLOT_PRIORITY_SCORE_WEIGHT = 0.4;

/**
 * Kies kandidaat-slots: minstens `matchCount`, bij voorkeur tot ~1.5× zoveel
 * hoogste-prioriteit slots zodat lagere uren ook mogen meedoen.
 */
export function pickPriorityCandidateSlots(
  availableSlots: number[],
  matchCount: number,
  isSlotUsable?: (slotIndex: number) => boolean,
): number[] {
  const sorted = [...availableSlots].sort((a, b) => a - b);
  if (matchCount <= 0) return [];
  if (matchCount >= sorted.length) return sorted;

  const target = Math.min(
    sorted.length,
    Math.max(matchCount, Math.ceil(matchCount * 1.5)),
  );

  const picked: number[] = [];
  for (const idx of sorted) {
    if (picked.length >= target) break;
    if (isSlotUsable && !isSlotUsable(idx)) continue;
    picked.push(idx);
  }

  if (picked.length < matchCount) {
    for (const idx of sorted) {
      if (picked.length >= matchCount) break;
      if (!picked.includes(idx)) picked.push(idx);
    }
  }

  return picked;
}

/** @deprecated alias — gebruik pickPriorityCandidateSlots */
export function pickHighestPrioritySlots(
  availableSlots: number[],
  matchCount: number,
  isSlotUsable?: (slotIndex: number) => boolean,
): number[] {
  return pickPriorityCandidateSlots(availableSlots, matchCount, isSlotUsable);
}

/** Soft score-bonus: hogere prioriteit (lagere index) scoort beter. */
export function slotPriorityScoreBonus(
  slotIndex: number,
  totalSlots: number,
): number {
  if (totalSlots <= 1 || slotIndex < 0) return 0;
  return Math.max(0, totalSlots - 1 - slotIndex) * SLOT_PRIORITY_SCORE_WEIGHT;
}

/** Chronologische sort: datum, daarna tijd (HH:mm). */
export function comparePreviewChronological(
  a: { match_date?: string; match_time?: string | null },
  b: { match_date?: string; match_time?: string | null },
): number {
  const da = (a.match_date || "9999").slice(0, 10);
  const db = (b.match_date || "9999").slice(0, 10);
  if (da !== db) return da.localeCompare(db);
  const ta = normalizeTimeKey(a.match_time);
  const tb = normalizeTimeKey(b.match_time);
  return ta.localeCompare(tb);
}

function normalizeTimeKey(value: string | null | undefined): string {
  if (!value) return "99:99";
  const raw = value.includes("T") ? value.split("T")[1] ?? value : value;
  return raw.slice(0, 5);
}
