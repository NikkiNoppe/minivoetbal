import { describe, expect, it } from "vitest";
import { assignTeamsToDivisions } from "./buildUnifiedPreview";

describe("assignTeamsToDivisions", () => {
  it("verdeelt volgens target counts", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const assignment = assignTeamsToDivisions(ids, [10, 20], [3, 5]);
    const in10 = Object.entries(assignment).filter(([, d]) => d === 10).map(([t]) => Number(t));
    const in20 = Object.entries(assignment).filter(([, d]) => d === 20).map(([t]) => Number(t));
    expect(in10).toHaveLength(3);
    expect(in20).toHaveLength(5);
  });
});
