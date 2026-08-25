/**
 * Beker-loting: voorronde bij voorkeur lagere reeks;
 * byes (vaak reeks 1) gespreid in de volgende ronde.
 */

export type CupTeamRankMap = Record<number, number>;

function defaultRng(): number {
  return Math.random();
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function rankOf(teamId: number, ranks: CupTeamRankMap): number {
  const r = ranks[teamId];
  return typeof r === "number" && Number.isFinite(r) ? r : 99;
}

/**
 * Slotrollen in de ronde ná de voorronde: byes zo veel mogelijk 1 per wedstrijd.
 * Resterende byes vullen een 2e slot (bye vs bye) — ook rondgespreid.
 */
export function nextRoundSlotRoles(
  byeCount: number,
  nextMatchCount: number,
): Array<"bye" | "winner"> {
  const slots = nextMatchCount * 2;
  const roles: Array<"bye" | "winner"> = Array.from({ length: slots }, () => "winner");
  const byes = Math.max(0, Math.min(byeCount, slots));
  let placed = 0;
  for (let m = 0; m < nextMatchCount && placed < byes; m++) {
    roles[m * 2] = "bye";
    placed += 1;
  }
  for (let m = 0; m < nextMatchCount && placed < byes; m++) {
    if (roles[m * 2 + 1] === "winner") {
      roles[m * 2 + 1] = "bye";
      placed += 1;
    }
  }
  return roles;
}

/** Prefill home/away voor ronde na VR: byes gespreid, rest null (VR-winnaars). */
export function buildNextRoundPrefill(
  byeTeams: number[],
  nextMatchCount: number,
): Array<number | null> {
  const roles = nextRoundSlotRoles(byeTeams.length, nextMatchCount);
  const out: Array<number | null> = roles.map(() => null);
  let bi = 0;
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === "bye" && bi < byeTeams.length) {
      out[i] = byeTeams[bi++];
    }
  }
  return out;
}

/**
 * Doorstroming VR → volgende ronde: n-de VR-winnaar naar n-de vrije (winner) slot
 * volgens dezelfde spreidingslayout als de bye-prefill.
 */
export function nextSlotAfterVoorrondeSpread(
  vrMatchNumber1Based: number,
  vrMatchCount: number,
  nextMatchCount: number,
): { matchNumber: number; isHome: boolean; slotIndex: number } {
  const byeCount = Math.max(0, 2 * nextMatchCount - vrMatchCount);
  const roles = nextRoundSlotRoles(byeCount, nextMatchCount);
  const winnerSlots: number[] = [];
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === "winner") winnerSlots.push(i);
  }
  const idx = Math.max(0, Math.min(vrMatchNumber1Based, winnerSlots.length) - 1);
  const slotIndex = winnerSlots[idx] ?? byeCount + Math.max(0, vrMatchNumber1Based - 1);
  return {
    slotIndex,
    matchNumber: Math.floor(slotIndex / 2) + 1,
    isHome: slotIndex % 2 === 0,
  };
}

/**
 * Zet forcedPlaying hard in de speelgroep (na de byes), ongeacht eerdere shuffle.
 * Zo blijven nieuwe ploegen altijd in de voorronde, ook na preference-retries.
 */
export function pinForcedVoorrondeOrder(
  fullOrder: number[],
  byeCount: number,
  forcedPlayingTeamIds: number[] | undefined,
): number[] {
  const n = fullOrder.length;
  if (n === 0) return fullOrder;
  const byes = Math.max(0, Math.min(Math.floor(byeCount), n));
  const playingCount = n - byes;
  if (playingCount <= 0 || !forcedPlayingTeamIds?.length) return fullOrder;

  const orderSet = new Set(fullOrder);
  const forced = [
    ...new Set(
      forcedPlayingTeamIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && orderSet.has(id)),
    ),
  ].slice(0, playingCount);
  if (forced.length === 0) return fullOrder;

  const forcedSet = new Set(forced);
  const others = fullOrder.filter((id) => !forcedSet.has(id));
  return [...others.slice(0, byes), ...forced, ...others.slice(byes)].slice(0, n);
}

/**
 * Ordening voor openingsronde:
 * - Byes vooraan (bij voorkeur lagere rank = reeks 1)
 * - Speelveld achteraan (bij voorkeur hogere rank = reeks 2+), gepaard zelfde reeks waar mogelijk
 * - forcedPlayingTeamIds altijd in de voorronde (bv. nieuwe ploegen)
 */
export function seedCupTeamOrder(input: {
  teams: number[];
  /** 1 = hoogste reeks (Eerste), 2 = Tweede, … Ontbrekend → 99 (speelt VR). */
  teamRank: CupTeamRankMap;
  byeCount: number;
  forcedByeTeamId?: number | null;
  /** Verplicht in voorronde (nieuwe ploegen); max. playingCount. */
  forcedPlayingTeamIds?: number[];
  rng?: () => number;
}): number[] {
  const rng = input.rng ?? defaultRng;
  const byeCount = Math.max(0, Math.min(input.byeCount, input.teams.length));
  const playingCount = input.teams.length - byeCount;

  const pool = [...input.teams];
  if (input.forcedByeTeamId != null && pool.includes(input.forcedByeTeamId)) {
    // Forced bye blijft in de bye-groep
  }

  const byRank = (a: number, b: number) =>
    rankOf(a, input.teamRank) - rankOf(b, input.teamRank) || a - b;

  // Sterker (lage rank) eerst → byes; zwakker → voorronde
  const sortedStrongFirst = [...pool].sort(byRank);
  shuffleWithinEqualRanks(sortedStrongFirst, input.teamRank, rng);

  let byes: number[] = [];
  let playing: number[] = [];

  const forcedPlaying = [
    ...new Set(
      (input.forcedPlayingTeamIds ?? []).filter((id) => pool.includes(id)),
    ),
  ].slice(0, playingCount);
  for (const id of forcedPlaying) {
    playing.push(id);
  }

  if (
    input.forcedByeTeamId != null &&
    pool.includes(input.forcedByeTeamId) &&
    !playing.includes(input.forcedByeTeamId)
  ) {
    byes.push(input.forcedByeTeamId);
  }

  for (const id of sortedStrongFirst) {
    if (byes.includes(id) || playing.includes(id)) continue;
    if (byes.length < byeCount) byes.push(id);
    else playing.push(id);
  }

  // Te weinig byes (edge): vul uit playing (sterkste eerst), behalve forced playing
  while (byes.length < byeCount && playing.length > forcedPlaying.length) {
    const movable = playing
      .filter((id) => !forcedPlaying.includes(id))
      .sort(byRank);
    if (movable.length === 0) break;
    const moved = movable[0];
    playing = playing.filter((id) => id !== moved);
    byes.push(moved);
  }
  // Te veel in byes / te weinig playing
  while (playing.length < playingCount && byes.length > byeCount) {
    const moved = byes.pop()!;
    playing.push(moved);
  }
  while (byes.length > byeCount) {
    playing.push(byes.pop()!);
  }
  // Te veel playing → push non-forced back to byes
  while (playing.length > playingCount) {
    const idx = [...playing]
      .map((id, i) => ({ id, i }))
      .reverse()
      .find((x) => !forcedPlaying.includes(x.id));
    if (!idx) break;
    playing.splice(idx.i, 1);
    byes.push(idx.id);
  }

  // Speelparen: zelfde reeks samen, daarbinnen shufflen — forced playing vooraan houden
  const forcedSet = new Set(forcedPlaying);
  const forcedPart = playing.filter((id) => forcedSet.has(id));
  const restPart = pairPreferSameRank(
    playing.filter((id) => !forcedSet.has(id)),
    input.teamRank,
    rng,
  );
  playing = [...pairPreferSameRank(forcedPart, input.teamRank, rng), ...restPart];
  byes = shuffleInPlace([...byes], rng);

  return [...byes, ...playing];
}

function shuffleWithinEqualRanks(
  sorted: number[],
  ranks: CupTeamRankMap,
  rng: () => number,
): void {
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    const r = rankOf(sorted[i], ranks);
    while (j < sorted.length && rankOf(sorted[j], ranks) === r) j++;
    const slice = sorted.slice(i, j);
    shuffleInPlace(slice, rng);
    for (let k = 0; k < slice.length; k++) sorted[i + k] = slice[k];
    i = j;
  }
}

/** Zet speelteams zodat opeenvolgende paren bij voorkeur dezelfde rank hebben. */
function pairPreferSameRank(
  playing: number[],
  ranks: CupTeamRankMap,
  rng: () => number,
): number[] {
  if (playing.length < 2) return playing;
  const byR = new Map<number, number[]>();
  for (const id of playing) {
    const r = rankOf(id, ranks);
    const arr = byR.get(r) ?? [];
    arr.push(id);
    byR.set(r, arr);
  }
  for (const arr of byR.values()) shuffleInPlace(arr, rng);

  const pairs: number[] = [];
  const leftovers: number[] = [];
  const rankKeys = Array.from(byR.keys()).sort((a, b) => b - a); // zwakker eerst

  for (const r of rankKeys) {
    const arr = byR.get(r) ?? [];
    while (arr.length >= 2) {
      pairs.push(arr.pop()!, arr.pop()!);
    }
    if (arr.length === 1) leftovers.push(arr.pop()!);
  }
  shuffleInPlace(leftovers, rng);
  // Rest als gemengde paren
  for (let i = 0; i + 1 < leftovers.length; i += 2) {
    pairs.push(leftovers[i], leftovers[i + 1]);
  }
  if (leftovers.length % 2 === 1) {
    pairs.push(leftovers[leftovers.length - 1]);
  }
  return pairs;
}

/** Bouw rank-map uit team → division.id en division rank (1 = hoogste). */
export function buildCupTeamRankMap(
  teamIds: number[],
  teamDivisions: Record<number, number> | undefined,
  divisionRankById: Record<number, number>,
): CupTeamRankMap {
  const out: CupTeamRankMap = {};
  for (const id of teamIds) {
    const divId = teamDivisions?.[id];
    out[id] =
      divId != null && divisionRankById[divId] != null
        ? divisionRankById[divId]
        : 99;
  }
  return out;
}

/** rank 1 = eerste in sort_order (Eerste klasse). */
export function divisionRankBySortOrder(
  divisions: Array<{ id: number; sort_order: number }>,
): Record<number, number> {
  const sorted = [...divisions].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  );
  const out: Record<number, number> = {};
  sorted.forEach((d, i) => {
    out[d.id] = i + 1;
  });
  return out;
}
