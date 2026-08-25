import { describe, expect, it } from "vitest";
import {
  byeTeamForRoundMatchday,
  findTeamOrderForByePins,
  orderTeamsForByePins,
  validateByePins,
} from "./competitionByePin";

describe("competitionByePin", () => {
  const teams = Array.from({ length: 17 }, (_, i) => i + 1);

  it("kent bye op speeldag 1 bij natuurlijke volgorde (ploeg 1)", () => {
    expect(byeTeamForRoundMatchday(teams, 1)).toBe(1);
  });

  it("vindt volgorde voor ploeg 5 op speeldag 4", () => {
    const order = findTeamOrderForByePins(teams, [{ teamId: 5, roundMatchday: 4 }]);
    expect(order).not.toBeNull();
    expect(byeTeamForRoundMatchday(order!, 4)).toBe(5);
  });

  it("weigert dubbele speeldag in pins", () => {
    expect(
      validateByePins(teams, [
        { teamId: 1, roundMatchday: 4 },
        { teamId: 2, roundMatchday: 4 },
      ]).ok,
    ).toBe(false);
  });

  it("orderTeamsForByePins respecteert pin i.p.v. shuffle", () => {
    const target = 12;
    const ordered = orderTeamsForByePins(
      teams,
      [{ teamId: target, roundMatchday: 4 }],
      (arr) => [...arr].reverse(),
    );
    expect(byeTeamForRoundMatchday(ordered, 4)).toBe(target);
  });

  it("geen bye bij even aantal ploegen", () => {
    const even = [1, 2, 3, 4];
    expect(findTeamOrderForByePins(even, [{ teamId: 1, roundMatchday: 1 }])).toBeNull();
  });
});
