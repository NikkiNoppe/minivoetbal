/** Circle-method BYE: welke ploeg rust op welke speeldag binnen één ronde. */

import type { CompetitionByePin } from "./types";

const BYE_SLOT = -1;
export function byeTeamForRoundMatchday(
  teamOrder: number[],
  roundMatchday: number,
): number | null {
  if (teamOrder.length % 2 === 0 || roundMatchday < 1) return null;

  let arr = [...teamOrder, BYE_SLOT];
  const n = arr.length;

  for (let md = 1; md < roundMatchday; md++) {
    const last = arr.pop();
    if (last == null) return null;
    arr.splice(1, 0, last);
  }

  for (let i = 0; i < n / 2; i++) {
    const home = arr[i];
    const away = arr[n - 1 - i];
    if (home === BYE_SLOT) return away;
    if (away === BYE_SLOT) return home;
  }
  return null;
}

export function validateByePins(
  teams: number[],
  pins: CompetitionByePin[],
): { ok: true } | { ok: false; reason: string } {
  if (pins.length === 0) return { ok: true };
  if (teams.length % 2 === 0) {
    return { ok: false, reason: "Geen bye bij een even aantal ploegen." };
  }
  const maxMd = teams.length;
  const teamSet = new Set(teams);
  const usedMd = new Set<number>();
  const usedTeam = new Set<number>();

  for (const pin of pins) {
    if (!teamSet.has(pin.teamId)) {
      return { ok: false, reason: `Ploeg ${pin.teamId} zit niet in deze poule.` };
    }
    if (pin.roundMatchday < 1 || pin.roundMatchday > maxMd) {
      return {
        ok: false,
        reason: `Speeldag ${pin.roundMatchday} is ongeldig (max. ${maxMd}).`,
      };
    }
    if (usedMd.has(pin.roundMatchday)) {
      return {
        ok: false,
        reason: `Speeldag ${pin.roundMatchday} heeft al een bye-pin.`,
      };
    }
    if (usedTeam.has(pin.teamId)) {
      return { ok: false, reason: `Ploeg ${pin.teamId} heeft al een bye-pin.` };
    }
    usedMd.add(pin.roundMatchday);
    usedTeam.add(pin.teamId);
  }
  return { ok: true };
}

/**
 * Zoek een ploegvolgorde waarbij elke pin klopt (circle method).
 * Retourneert null als geen volgorde gevonden binnen maxAttempts.
 */
export function findTeamOrderForByePins(
  teams: number[],
  pins: CompetitionByePin[],
  maxAttempts = 50_000,
): number[] | null {
  if (teams.length === 0) return [];
  const validation = validateByePins(teams, pins);
  if (!validation.ok) return null;
  if (pins.length === 0) return [...teams];

  const base = [...teams];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const order = [...base];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const ok = pins.every(
      (pin) => byeTeamForRoundMatchday(order, pin.roundMatchday) === pin.teamId,
    );
    if (ok) return order;
  }
  return null;
}

/** Pas bye-pins toe op één poule; shuffle alleen zonder pins. */
export function orderTeamsForByePins(
  teams: number[],
  pins: CompetitionByePin[],
  shuffle?: (arr: number[]) => number[],
): number[] {
  const poolPins = pins.filter((p) => teams.includes(p.teamId));
  if (poolPins.length > 0) {
    return findTeamOrderForByePins(teams, poolPins) ?? [...teams];
  }
  return shuffle ? shuffle([...teams]) : [...teams];
}
