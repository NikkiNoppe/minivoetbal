/** Spelerslijst vergrendeling — meerdere periodes + lopend seizoen. */

export type PlayerListLockReason = "settings" | "season" | "both" | null;

export type PlayerListLockScheduleStatus = "inactive" | "scheduled" | "active" | "expired";

export interface PlayerListLockPeriod {
  from: string;
  until: string | null;
  /** Optioneel weergavelabel (bv. Regulier seizoen, Play-offs). */
  label?: string | null;
}

export interface PlayerListLockSettingValue {
  lock_enabled?: boolean;
  lock_from_date?: string | null;
  lock_until_date?: string | null;
  periods?: Array<{
    from?: string | null;
    until?: string | null;
    label?: string | null;
  }> | null;
}

/** Legacy single range → periods[]; empty/invalid entries filtered out. */
export function normalizePlayerListLockPeriods(
  settingValue: PlayerListLockSettingValue | null | undefined,
): PlayerListLockPeriod[] {
  if (!settingValue) return [];

  const raw = settingValue.periods;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((p) => ({
        from: (p?.from ?? "").trim(),
        until: p?.until?.trim() ? p.until.trim() : null,
        label: p?.label?.trim() ? p.label.trim() : null,
      }))
      .filter((p) => p.from.length > 0 || (p.until != null && p.until.length > 0))
      .map((p) => ({
        from: p.from,
        until: p.until,
        label: p.label,
      }))
      .filter((p) => p.from.length > 0)
      .sort((a, b) => a.from.localeCompare(b.from));
  }

  const from = settingValue.lock_from_date?.trim() || "";
  const until = settingValue.lock_until_date?.trim() || null;
  if (!from && !until) return [];
  if (!from) return [];
  return [{ from, until: until || null, label: null }];
}

/** Payload to persist: periods + legacy mirrors of first period. */
export function toPlayerListLockSettingValue(
  lockEnabled: boolean,
  periods: PlayerListLockPeriod[],
): PlayerListLockSettingValue {
  const normalized = periods
    .map((p) => ({
      from: p.from.trim(),
      until: p.until?.trim() ? p.until.trim() : null,
      label: p.label?.trim() ? p.label.trim() : null,
    }))
    .filter((p) => p.from.length > 0)
    .sort((a, b) => a.from.localeCompare(b.from));

  const first = normalized[0];
  return {
    lock_enabled: lockEnabled,
    periods: normalized,
    lock_from_date: first?.from ?? null,
    lock_until_date: first?.until ?? null,
  };
}

export function isDateInLockPeriod(
  period: PlayerListLockPeriod,
  referenceDate: Date = new Date(),
): boolean {
  const today = startOfLocalDay(referenceDate);
  const lockFrom = parseDateOnly(period.from);
  const lockUntil = parseDateOnly(period.until);

  if (!lockFrom && !lockUntil) return false;
  if (lockFrom && today < lockFrom) return false;
  if (lockUntil && today > lockUntil) return false;
  return true;
}

export function findActiveLockPeriod(
  periods: PlayerListLockPeriod[],
  referenceDate: Date = new Date(),
): PlayerListLockPeriod | null {
  return periods.find((p) => isDateInLockPeriod(p, referenceDate)) ?? null;
}

export function findNextLockPeriod(
  periods: PlayerListLockPeriod[],
  referenceDate: Date = new Date(),
): PlayerListLockPeriod | null {
  const today = startOfLocalDay(referenceDate);
  const upcoming = periods
    .map((p) => ({ period: p, from: parseDateOnly(p.from) }))
    .filter((x): x is { period: PlayerListLockPeriod; from: Date } => x.from != null && today < x.from)
    .sort((a, b) => a.from.getTime() - b.from.getTime());
  return upcoming[0]?.period ?? null;
}

export function isSettingsPlayerListLocked(
  settingValue: PlayerListLockSettingValue | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  return getPlayerListLockScheduleStatus(settingValue, referenceDate) === "active";
}

export function getPlayerListLockScheduleStatus(
  settingValue: PlayerListLockSettingValue | null | undefined,
  referenceDate: Date = new Date(),
): PlayerListLockScheduleStatus {
  if (!settingValue || settingValue.lock_enabled === false) return "inactive";

  const periods = normalizePlayerListLockPeriods(settingValue);
  if (periods.length === 0) return "inactive";

  if (findActiveLockPeriod(periods, referenceDate)) return "active";

  if (findNextLockPeriod(periods, referenceDate)) return "scheduled";

  const allHaveUntil = periods.every((p) => Boolean(p.until?.trim()));
  if (allHaveUntil) return "expired";

  // Open-ended period in the past without until — treat as active already handled;
  // if we get here with an open-ended from in the past, isDateInLockPeriod should have matched.
  return "expired";
}

export function isWithinActiveSeason(
  seasonStart: string | null | undefined,
  seasonEnd: string | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  if (!seasonStart || !seasonEnd) return false;

  const today = startOfLocalDay(referenceDate);
  const start = startOfLocalDay(new Date(`${seasonStart}T00:00:00`));
  const end = startOfLocalDay(new Date(`${seasonEnd}T00:00:00`));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  return today >= start && today <= end;
}

export function resolvePlayerListLockReason(
  settingsLocked: boolean,
  seasonLocked: boolean,
): PlayerListLockReason {
  if (settingsLocked && seasonLocked) return "both";
  if (settingsLocked) return "settings";
  if (seasonLocked) return "season";
  return null;
}

export function buildPlayerListLockMessage(
  reason: PlayerListLockReason,
  lockDate: string | null,
  seasonEndDate: string | null,
  formatDate: (iso: string) => string,
  lockUntilDate: string | null = null,
): string | null {
  const settingsRange = formatLockDateRange(lockDate, lockUntilDate, formatDate);

  switch (reason) {
    case "both":
      return settingsRange
        ? `Tijdens het lopende seizoen en ${settingsRange} zijn wijzigingen aan de spelerslijst niet toegestaan.`
        : "Tijdens het lopende seizoen zijn wijzigingen aan de spelerslijst niet toegestaan.";
    case "season":
      return seasonEndDate
        ? `Tijdens het lopende seizoen (tot ${formatDate(seasonEndDate)}) zijn wijzigingen aan de spelerslijst niet toegestaan.`
        : "Tijdens het lopende seizoen zijn wijzigingen aan de spelerslijst niet toegestaan.";
    case "settings":
      return settingsRange
        ? `Wijzigingen zijn niet toegestaan ${settingsRange}.`
        : "Wijzigingen aan de spelerslijst zijn momenteel niet toegestaan.";
    default:
      return null;
  }
}

/** Message helpers for multi-period: prefer active, else next scheduled. */
export function resolveLockMessageDates(
  settingValue: PlayerListLockSettingValue | null | undefined,
  referenceDate: Date = new Date(),
): { from: string | null; until: string | null } {
  if (!settingValue || settingValue.lock_enabled === false) {
    return { from: null, until: null };
  }
  const periods = normalizePlayerListLockPeriods(settingValue);
  const active = findActiveLockPeriod(periods, referenceDate);
  if (active) return { from: active.from, until: active.until };
  const next = findNextLockPeriod(periods, referenceDate);
  if (next) return { from: next.from, until: next.until };
  const last = periods[periods.length - 1];
  return { from: last?.from ?? null, until: last?.until ?? null };
}

export function formatLockDateRange(
  lockFrom: string | null | undefined,
  lockUntil: string | null | undefined,
  formatDate: (iso: string) => string,
): string | null {
  const from = lockFrom?.trim();
  const until = lockUntil?.trim();

  if (from && until) {
    return `van ${formatDate(from)} tot ${formatDate(until)}`;
  }
  if (from) return `vanaf ${formatDate(from)}`;
  if (until) return `tot ${formatDate(until)}`;
  return null;
}

export function formatLockPeriodsSummary(
  periods: PlayerListLockPeriod[],
  formatDate: (iso: string) => string,
): string | null {
  if (periods.length === 0) return null;
  const parts = periods
    .map((p) => formatLockDateRange(p.from, p.until, formatDate))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join("; ");
}

export function validatePlayerListLockRange(
  lockFrom: string,
  lockUntil: string,
): string | null {
  if (!lockFrom || !lockUntil) return null;

  const from = parseDateOnly(lockFrom);
  const until = parseDateOnly(lockUntil);
  if (!from || !until) return null;

  if (startOfLocalDay(until) < startOfLocalDay(from)) {
    return "Einddatum moet op of na de startdatum liggen.";
  }

  return null;
}

export function validatePlayerListLockPeriods(
  lockEnabled: boolean,
  periods: PlayerListLockPeriod[],
): string | null {
  if (!lockEnabled) return null;

  const filled = periods.filter((p) => p.from.trim().length > 0);
  if (filled.length === 0) {
    return "Voeg minstens één vergrendelingsperiode toe (startdatum).";
  }

  for (const period of filled) {
    const err = validatePlayerListLockRange(period.from, period.until ?? "");
    if (err) return err;
  }

  return null;
}

/** YYYY-MM-DD helpers for suggested lock windows from seizoensconfig. */
function addDaysIso(iso: string, days: number): string | null {
  const d = parseDateOnly(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function subtractDaysIso(iso: string, days: number): string | null {
  return addDaysIso(iso, -days);
}

/**
 * Standaardperiode = volledig seizoen (start → eind) uit Instellingen → Seizoensdata.
 * Geen seizoensdatums → lege periode om manueel in te vullen.
 */
export function buildSuggestedSeasonLockPeriod(
  seasonStart?: string | null,
  seasonEnd?: string | null,
): PlayerListLockPeriod {
  const from = seasonStart?.trim() || "";
  const until = seasonEnd?.trim() || null;
  if (!from) return { from: "", until: null, label: null };
  return { from, until: until || null, label: null };
}

/**
 * Extra play-offvenster: laatste ~5 weken van het seizoen.
 * Past de vorige periode in zodat die eindigt de dag vóór play-offs.
 */
export function appendSuggestedPlayoffLockPeriod(
  periods: PlayerListLockPeriod[],
  seasonEnd?: string | null,
): PlayerListLockPeriod[] {
  const end = seasonEnd?.trim() || periods.find((p) => p.until)?.until?.trim() || "";
  if (!end) {
    return [...periods, { from: "", until: null, label: null }];
  }

  const playoffFrom = subtractDaysIso(end, 35) || end;
  const dayBefore = subtractDaysIso(playoffFrom, 1);

  const base = periods
    .map((p) => ({
      from: p.from.trim(),
      until: p.until?.trim() ? p.until.trim() : null,
      label: p.label?.trim() ? p.label.trim() : null,
    }))
    .filter((p) => p.from.length > 0);

  if (base.length === 0) {
    return [
      { from: playoffFrom, until: end, label: "Play-offs" },
    ];
  }

  // Laatste periode inkorten tot dag vóór play-offs (als die langer loopt)
  const lastIdx = base.length - 1;
  const last = base[lastIdx];
  if (dayBefore && (!last.until || last.until >= playoffFrom)) {
    base[lastIdx] = { ...last, until: dayBefore };
  }

  // Geen dubbele play-offrij
  if (base.some((p) => p.from === playoffFrom && p.until === end)) {
    return base;
  }

  return [...base, { from: playoffFrom, until: end, label: "Play-offs" }];
}

/** Volgende lege rij: start na laatste "tot", anders leeg. */
export function nextEmptyLockPeriod(periods: PlayerListLockPeriod[]): PlayerListLockPeriod {
  const filled = periods.filter((p) => p.from.trim().length > 0);
  const lastUntil = [...filled].reverse().find((p) => p.until?.trim())?.until?.trim();
  if (lastUntil) {
    const nextFrom = addDaysIso(lastUntil, 1);
    return { from: nextFrom || "", until: null, label: null };
  }
  return { from: "", until: null, label: null };
}

export const PLAYER_LIST_LOCK_STATUS_LABELS: Record<PlayerListLockScheduleStatus, string> = {
  inactive: "Uitgeschakeld",
  scheduled: "Gepland (nog open)",
  active: "Actief vergrendeld",
  expired: "Verlopen",
};

function parseDateOnly(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
