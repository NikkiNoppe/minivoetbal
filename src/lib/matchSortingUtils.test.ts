import { describe, expect, it } from "vitest";
import { getCupRoundName, sortGroupKeys } from "./matchSortingUtils";

describe("sortGroupKeys cup", () => {
  it("zet Voorronde (order 0) bovenaan, niet onderaan via || 99", () => {
    const keys = [
      "Achtste Finales",
      "Finale",
      "Halve Finales",
      "Kwart Finales",
      "Voorronde",
    ];
    expect(sortGroupKeys(keys, true)).toEqual([
      "Voorronde",
      "Achtste Finales",
      "Kwart Finales",
      "Halve Finales",
      "Finale",
    ]);
  });
});

describe("getCupRoundName", () => {
  it("herkent VR- als Voorronde", () => {
    expect(getCupRoundName("VR-1")).toBe("Voorronde");
  });
});
