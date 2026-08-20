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

function isoDayIndex(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

/** Absoluut aantal dagen tussen twee weekdagen in dezelfde ISO-week (ma–zo). */
export function isoWeekDayDistance(dayA: number, dayB: number): number {
  return Math.abs(isoDayIndex(dayA) - isoDayIndex(dayB));
}

/**
 * 2×/week: do+vr (1 dag) is te krap. Voeg dagen toe met ≥ minGap t.o.v. de
 * voorkeursdag (typisch di/ma) zodat dual-ploegen kunnen spreiden.
 */
export function expandSlotsForDualWeekGap(
  scopedSlots: number[],
  allAvailable: number[],
  preferredDay: number,
  minGap: number,
  dayOfWeekForSlot: (slotIndex: number) => number | null | undefined,
): number[] {
  const hasFarDay = scopedSlots.some((idx) => {
    const dow = dayOfWeekForSlot(idx);
    return typeof dow === "number" && isoWeekDayDistance(dow, preferredDay) >= minGap;
  });
  if (hasFarDay) return scopedSlots;
  const seen = new Set(scopedSlots);
  const merged = [...scopedSlots];
  for (const idx of allAvailable) {
    if (seen.has(idx)) continue;
    const dow = dayOfWeekForSlot(idx);
    if (typeof dow !== "number") continue;
    if (isoWeekDayDistance(dow, preferredDay) < minGap) continue;
    merged.push(idx);
    seen.add(idx);
  }
  return merged;
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
