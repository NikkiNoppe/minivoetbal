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

/**
 * Voeg periode-slots (bv. extra dinsdagen) toe aan de competitie-scope, ook als
 * ma/do/vr al voldoende capaciteit hebben — anders blijven ze ongebruikt in de preview.
 */
export function appendPeriodBoundedSlots(
  scopedSlots: number[],
  allAvailable: number[],
  isPeriodBoundedSlot: (slotIndex: number) => boolean,
): number[] {
  const seen = new Set(scopedSlots);
  const merged = [...scopedSlots];
  for (const idx of allAvailable) {
    if (seen.has(idx)) continue;
    if (!isPeriodBoundedSlot(idx)) continue;
    merged.push(idx);
    seen.add(idx);
  }
  return merged;
}

/**
 * Beker: vul eerst de bekerdag volledig, pas daarna de volgende voorkeursdag.
 * `preferredDays` komt uit `orderCupDayPreference` (competitiedag staat er niet in,
 * dag vóór de competitiedag staat achteraan). Blijft er dan nog een tekort, dan
 * worden de overige slots achteraan toegevoegd zodat planning niet vastloopt.
 */
export function scopeSlotsByCupDayPreference(
  availableSlots: number[],
  matchCount: number,
  dayOfWeekForSlot: (slotIndex: number) => number | null | undefined,
  preferredDays: number[],
): number[] {
  if (matchCount <= 0) return [];
  if (availableSlots.length === 0) return [];

  const picked: number[] = [];
  const taken = new Set<number>();

  for (const day of preferredDays) {
    for (const idx of availableSlots) {
      if (taken.has(idx)) continue;
      if (dayOfWeekForSlot(idx) !== day) continue;
      picked.push(idx);
      taken.add(idx);
    }
    if (picked.length >= matchCount) return picked;
  }

  for (const idx of availableSlots) {
    if (taken.has(idx)) continue;
    picked.push(idx);
    taken.add(idx);
  }

  return picked;
}
