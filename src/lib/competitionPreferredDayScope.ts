/**
 * Beperk competitie-slots tot de voorkeursdag; bij tekort geleidelijk
 * dichterbij uitbreiden (bv. vrijdag → donderdag → …) i.p.v. meteen alle dagen.
 */
export function scopeSlotsByPreferredDayDistance(
  availableSlots: number[],
  preferredDay: number,
  matchCount: number,
  dayOfWeekForSlot: (slotIndex: number) => number | null | undefined,
): number[] {
  if (matchCount <= 0) return [];
  if (availableSlots.length === 0) return [];

  let dayScoped = availableSlots;
  for (let maxDist = 0; maxDist <= 6; maxDist++) {
    const candidates = availableSlots.filter((idx) => {
      const dow = dayOfWeekForSlot(idx);
      return typeof dow === "number" && Math.abs(dow - preferredDay) <= maxDist;
    });
    if (candidates.length >= matchCount) {
      return candidates;
    }
    if (maxDist === 6) {
      dayScoped = candidates.length > 0 ? candidates : availableSlots;
    }
  }
  return dayScoped;
}
