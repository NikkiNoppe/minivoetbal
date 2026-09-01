/** Zelfde normalisatie als private.clean_referee_note_for_fingerprint (SQL). */

export function cleanRefereeNoteForFingerprint(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .split("\n")
    .filter((line) => !line.trim().startsWith("⚠️ BOETE:"))
    .join("\n")
    .trim();
}

export async function refereeNoteFingerprint(
  notes: string | null | undefined,
): Promise<string> {
  const cleaned = cleanRefereeNoteForFingerprint(notes);
  const data = new TextEncoder().encode(cleaned);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
