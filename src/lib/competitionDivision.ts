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

/** Maandag (ISO) van de kalenderweek van een YYYY-MM-DD datum. */
export function mondayIsoFromMatchDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const day = dateStr.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Zondag van dezelfde week als de maandag. */
export function sundayIsoFromMonday(mondayIso: string): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
