import { describe, expect, it } from "vitest";
import {
  buildCupTeamRankMap,
  buildNextRoundPrefill,
  divisionRankBySortOrder,
  nextRoundSlotRoles,
  nextSlotAfterVoorrondeSpread,
  seedCupTeamOrder,
} from "./cupTeamSeeding";

describe("seedCupTeamOrder", () => {
  it("zet reeks 2 in de voorronde en reeks 1 als bye", () => {
    const reeks1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const reeks2 = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const teamRank: Record<number, number> = {};
    for (const id of reeks1) teamRank[id] = 1;
    for (const id of reeks2) teamRank[id] = 2;

    // Deterministic rng for stable test
    let i = 0;
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const rng = () => seq[i++ % seq.length];

    const order = seedCupTeamOrder({
      teams: [...reeks1, ...reeks2],
      teamRank,
      byeCount: 10,
      rng,
    });

    const byes = order.slice(0, 10);
    const playing = order.slice(10);
    expect(playing).toHaveLength(12);
    // Alle VR-spelers uit reeks 2 (11 beschikbaar → 11 + 1 uit reeks 1)
    const playingFrom2 = playing.filter((id) => teamRank[id] === 2);
    expect(playingFrom2.length).toBe(11);
    // Byes: vooral reeks 1
    const byesFrom1 = byes.filter((id) => teamRank[id] === 1);
    expect(byesFrom1.length).toBeGreaterThanOrEqual(9);
  });
});

describe("buildNextRoundPrefill / spread", () => {
  it("spreidt 10 byes over 8 wedstrijden (max 1 per match eerst)", () => {
    const roles = nextRoundSlotRoles(10, 8);
    const byeSlots = roles.filter((r) => r === "bye").length;
    expect(byeSlots).toBe(10);
    // Eerste pass: elke match heeft home-bye
    for (let m = 0; m < 8; m++) {
      expect(roles[m * 2]).toBe("bye");
    }
    const prefill = buildNextRoundPrefill([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 8);
    expect(prefill.filter((x) => x != null)).toHaveLength(10);
    expect(prefill.filter((x) => x == null)).toHaveLength(6);
    // VR1 → slot 5
    expect(nextSlotAfterVoorrondeSpread(1, 6, 8).slotIndex).toBe(5);
  });
});

describe("divisionRankBySortOrder", () => {
  it("eerste sort_order = rank 1", () => {
    const ranks = divisionRankBySortOrder([
      { id: 2, sort_order: 2 },
      { id: 1, sort_order: 1 },
    ]);
    expect(ranks[1]).toBe(1);
    expect(ranks[2]).toBe(2);
    const map = buildCupTeamRankMap([10, 20], { 10: 1, 20: 2 }, ranks);
    expect(map[10]).toBe(1);
    expect(map[20]).toBe(2);
  });
});
