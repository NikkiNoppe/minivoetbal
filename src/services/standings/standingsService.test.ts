import { describe, expect, it } from "vitest";
import { buildRegularStandings, type MatchRow } from "./standingsService";

const teams = new Map([
  [1, "Alpha"],
  [2, "Bravo"],
  [3, "Charlie"],
  [4, "Delta"],
]);

describe("buildRegularStandings", () => {
  it("toont alle ploegen op 0 punten zonder gespeelde wedstrijden", () => {
    const standings = buildRegularStandings([], teams);
    expect(standings).toHaveLength(4);
    expect(standings.every((row) => row.played === 0 && row.points === 0)).toBe(
      true,
    );
    expect(standings.every((row) => row.division === null)).toBe(true);
  });

  it("splitst twee reeksen en sorteert alfabetisch bij gelijke punten", () => {
    const matches: MatchRow[] = [
      {
        home_team_id: 1,
        away_team_id: 2,
        home_score: null,
        away_score: null,
        is_submitted: false,
        speeldag: "Eerste klasse – Speeldag 1",
      },
      {
        home_team_id: 3,
        away_team_id: 4,
        home_score: null,
        away_score: null,
        is_submitted: false,
        speeldag: "Tweede klasse – Speeldag 1",
      },
    ];
    const standings = buildRegularStandings(matches, teams);
    expect(standings.filter((row) => row.division === "Eerste klasse")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ team_name: "Alpha", position: 1, points: 0 }),
        expect.objectContaining({ team_name: "Bravo", position: 2, points: 0 }),
      ]),
    );
    expect(
      standings.filter((row) => row.division === "Tweede klasse").map((row) => row.team_name),
    ).toEqual(["Charlie", "Delta"]);
  });
});
