/** Reeksnaam uit speeldag-label, bv. "Eerste klasse – Speeldag 1". */
export function divisionFromSpeeldag(
  speeldag: string | null | undefined,
): string | null {
  if (!speeldag) return null;
  const match = speeldag.match(/^(.+?)\s+[–-]\s*Speeldag\b/i);
  return match ? match[1].trim() : null;
}

/** Eerste klasse vóór Tweede; naamloze reeks achteraan. */
export function divisionSortKey(name: string | null | undefined): string {
  if (!name) return "zzz";
  if (/eerste/i.test(name)) return "0";
  if (/tweede/i.test(name)) return "1";
  return name.toLocaleLowerCase("nl-BE");
}

/** Publieke weergave: "Eerste klasse" → "Eerste reeks". */
export function formatDivisionDisplayName(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  return name.replace(/klasse/gi, "reeks");
}

/** Speeldagnummer uit label, bv. "Eerste klasse – Speeldag 3" → 3. */
export function speeldagNumberFromLabel(
  speeldag: string | null | undefined,
): number | null {
  if (!speeldag) return null;
  const match = speeldag.match(/Speeldag\s+(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}
