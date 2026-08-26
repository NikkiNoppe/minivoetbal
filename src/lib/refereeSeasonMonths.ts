import { format } from "date-fns";
import { nl } from "date-fns/locale";

/** Seizoen: sep–jun. Jul/aug → aankomend seizoen (start dit kalenderjaar). */
export function getSeasonStartYear(now = new Date()): number {
  const month = now.getMonth(); // 0–11
  const year = now.getFullYear();
  if (month >= 8) return year; // sep–dec
  if (month <= 5) return year - 1; // jan–jun
  return year; // jul–aug → volgende seizoen start sep dit jaar
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** Standaard: huidige maand in het seizoen; jul/aug → september (seizoensstart). */
export function resolveDefaultSeasonMonth(now = new Date()): string {
  const month = now.getMonth();
  if (month === 6 || month === 7) {
    return monthKey(now.getFullYear(), 8); // september
  }
  return format(now, "yyyy-MM");
}

/** Opties strikt september → juni van het lopende/aankomende seizoen. */
export function buildSeasonMonthOptions(now = new Date()) {
  const startYear = getSeasonStartYear(now);
  const options: Array<{ value: string; label: string }> = [];

  for (let m = 8; m <= 11; m++) {
    const value = monthKey(startYear, m);
    options.push({
      value,
      label: format(new Date(startYear, m, 1), "MMMM yyyy", { locale: nl }),
    });
  }
  for (let m = 0; m <= 5; m++) {
    const value = monthKey(startYear + 1, m);
    options.push({
      value,
      label: format(new Date(startYear + 1, m, 1), "MMMM yyyy", { locale: nl }),
    });
  }

  return options;
}

export function isMonthInSeason(month: string, now = new Date()): boolean {
  const startYear = getSeasonStartYear(now);
  const seasonStart = monthKey(startYear, 8);
  const seasonEnd = monthKey(startYear + 1, 5); // juni
  return month >= seasonStart && month <= seasonEnd;
}
