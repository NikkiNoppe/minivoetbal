import { comparePreviewChronological } from "@/lib/slotPriorityPacking";
import { matchDateFromWeekMonday } from "@/lib/cupBracketPlan";
import type { UnifiedPreviewRow } from "./buildUnifiedPreview";

function dateKey(row: UnifiedPreviewRow): string {
  return (row.match_date || "").slice(0, 10);
}

function isBye(row: UnifiedPreviewRow): boolean {
  return (
    row.venue === "BYE" ||
    row.match_time === "00:00" ||
    row.awayLabel === "BYE" ||
    row.homeLabel === "BYE"
  );
}

function isRealMatch(row: UnifiedPreviewRow): boolean {
  if (isBye(row)) return false;
  return row.phase === "competition" || row.phase === "cup" || row.phase === "playoff";
}

export function isCupFinalPreviewRow(row: UnifiedPreviewRow): boolean {
  if (row.phase !== "cup") return false;
  const label = (row.speeldag || "").trim().toLowerCase();
  return label === "finale";
}

export function isCupSemiPreviewRow(row: UnifiedPreviewRow): boolean {
  if (row.phase !== "cup") return false;
  return /halve/i.test(row.speeldag || "");
}

function cupRoundRank(speeldag: string): number {
  const s = speeldag.toLowerCase();
  if (s.includes("voorronde")) return 1;
  if (s.includes("1/16")) return 2;
  if (s.includes("1/8")) return 3;
  if (s.includes("kwart")) return 4;
  if (s.includes("halve")) return 5;
  if (s === "finale" || s.startsWith("finale")) return 6;
  return 9;
}

/**
 * Preview-volgorde: kalenderdatum, daarna tijd.
 * Zelfde dag: competitie ronde, daarna bekerfase.
 */
export function compareUnifiedPreviewRows(
  a: UnifiedPreviewRow,
  b: UnifiedPreviewRow,
): number {
  const byDate = comparePreviewChronological(a, b);
  if (byDate !== 0) return byDate;
  if (a.phase === "competition" && b.phase === "competition") {
    const ra = a.round ?? 99;
    const rb = b.round ?? 99;
    if (ra !== rb) return ra - rb;
  }
  if (a.phase === "cup" && b.phase === "cup") {
    const ca = cupRoundRank(a.speeldag);
    const cb = cupRoundRank(b.speeldag);
    if (ca !== cb) return ca - cb;
  }
  return 0;
}

function otherMatchesOnDate(
  rows: UnifiedPreviewRow[],
  date: string,
  skipFinal: boolean,
): number {
  let n = 0;
  for (const row of rows) {
    if (!isRealMatch(row)) continue;
    if (skipFinal && isCupFinalPreviewRow(row)) continue;
    if (dateKey(row) === date) n += 1;
  }
  return n;
}

function isoDayOfWeek(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay(); // 0=zo … 1=ma
}

/**
 * Score: hogere waarde = rustiger dag voor de finale.
 * Lege dag (geen andere wedstrijden) wint; daarna isolatie en vrije slots.
 */
export function quietDayScore(
  date: string,
  otherMatches: number,
  freeOnDay: number,
  afterSemi: boolean,
): number {
  let score = 0;
  if (otherMatches === 0) score += 50_000;
  else score -= otherMatches * 8_000;
  if (afterSemi) score += 4_000;
  score += freeOnDay * 80;
  const dow = isoDayOfWeek(date);
  if (dow === 1) score += 120; // maandag = typische bekerdag
  if (dow === 2) score += 40;
  // Finale hoort ma/di — vrijdag/andere dagen zwaar afstraffen
  if (dow !== 1 && dow !== 2) score -= 20_000;
  return score;
}

export type RelocateCupFinalResult = {
  rows: UnifiedPreviewRow[];
  moved: boolean;
  warning?: string;
  fromDate?: string;
  toDate?: string;
};

function slotSortKey(row: UnifiedPreviewRow): string {
  return `${dateKey(row)}T${(row.match_time || "").slice(0, 5)}`;
}

function pickLastFreeIndex(rows: UnifiedPreviewRow[], freeIdxs: number[]): number {
  let best = -1;
  let bestKey = "";
  for (const i of freeIdxs) {
    const key = slotSortKey(rows[i]);
    if (best < 0 || key > bestKey) {
      best = i;
      bestKey = key;
    }
  }
  return best;
}

/** Maandag of dinsdag van de laatste speelweek (ISO) — bekerfinale, nooit vrijdag. */
export function lastPlayableCupFinalDay(
  weekMondays: string[],
  preferredDow: 1 | 2 = 1,
): string | null {
  const last = [...weekMondays].filter(Boolean).sort().at(-1);
  if (!last) return null;
  return matchDateFromWeekMonday(last, preferredDow);
}

/** @deprecated Gebruik lastPlayableCupFinalDay — finale is ma/di, niet vrijdag. */
export function lastPlayableFriday(weekMondays: string[]): string | null {
  return lastPlayableCupFinalDay(weekMondays, 1);
}

function isEarlyWeekday(iso: string): boolean {
  const dow = isoDayOfWeek(iso);
  return dow === 1 || dow === 2;
}

export function pinCupFinalToDate(
  plan: Array<{
    speeldag?: string;
    unique_number?: string;
    match_date: string;
    match_time: string;
    slot_index?: number;
  }>,
  dateIso: string,
  time = "21:00",
): boolean {
  if (!dateIso) return false;
  let pinned = false;
  for (const p of plan) {
    const label = (p.speeldag || "").trim().toLowerCase();
    if (label !== "finale" && p.unique_number !== "FINAL") continue;
    p.match_date = dateIso;
    p.match_time = time;
    p.slot_index = -1;
    pinned = true;
  }
  return pinned;
}

/**
 * Zet de bekerfinale op het laatste vrije speelmoment van de kalender
 * (ná eerdere bekerondes), zodat ze de allerlaatste wedstrijd is.
 */
export function relocateCupFinalToStandaloneDay(
  rows: UnifiedPreviewRow[],
): RelocateCupFinalResult {
  const finalIdx = rows.findIndex(isCupFinalPreviewRow);
  if (finalIdx < 0) return { rows, moved: false };
  const final = rows[finalIdx];
  const currentDate = dateKey(final);

  const lastPriorCupDate = rows
    .filter(
      (r) =>
        r.phase === "cup" &&
        !isCupFinalPreviewRow(r) &&
        isRealMatch(r),
    )
    .map(dateKey)
    .filter(Boolean)
    .sort();
  const afterPriorCup = lastPriorCupDate[lastPriorCupDate.length - 1] ?? "";

  const freeIdxs: number[] = [];
  rows.forEach((row, i) => {
    if (row.phase !== "free") return;
    const d = dateKey(row);
    if (!d) return;
    if (afterPriorCup && d < afterPriorCup) return;
    freeIdxs.push(i);
  });
  // Finale alleen op ma/di; fallback op alle vrije momenten als die er niet zijn.
  const earlyFree = freeIdxs.filter((i) => isEarlyWeekday(dateKey(rows[i])));
  const candidateIdxs = earlyFree.length > 0 ? earlyFree : freeIdxs;
  if (candidateIdxs.length === 0) {
    const currentOthers = otherMatchesOnDate(rows, currentDate, true);
    if (
      currentOthers === 0 &&
      (!afterPriorCup || currentDate >= afterPriorCup) &&
      isEarlyWeekday(currentDate)
    ) {
      return { rows, moved: false };
    }
    return {
      rows,
      moved: false,
      warning:
        afterPriorCup
          ? `Finale niet verplaatst: geen vrij speelmoment (ma/di) ná ${afterPriorCup}.`
          : "Finale niet verplaatst: geen vrij speelmoment (ma/di) over voor een alleenstaande dag.",
    };
  }

  const bestIdx = pickLastFreeIndex(rows, candidateIdxs);
  if (bestIdx < 0) return { rows, moved: false };

  const slot = rows[bestIdx];
  const toDate = dateKey(slot);
  const slotTime = (slot.match_time || "").slice(0, 5);
  if (slotSortKey(final) >= slotSortKey(slot)) {
    return { rows, moved: false };
  }

  const next = [...rows];
  next[finalIdx] = {
    ...final,
    match_date: slot.match_date,
    match_time: slot.match_time,
    venue: slot.venue || final.venue,
    note: "Laatste speelmoment van de kalender",
  };
  next.splice(bestIdx, 1);

  return {
    rows: next,
    moved: true,
    fromDate: currentDate,
    toDate,
    warning: `Finale als laatste wedstrijd op ${toDate}${slotTime ? ` ${slotTime}` : ""}.`,
  };
}
