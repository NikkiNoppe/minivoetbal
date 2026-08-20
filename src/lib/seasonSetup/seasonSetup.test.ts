import { describe, expect, it } from "vitest";
import {
  assignTeamsToDivisions,
  createDefaultSeasonSetup,
  cupBusyTeamsByMondayFromPlan,
  cupDatesByMondayFromPlan,
  cupUnassignedByMondayFromPlan,
  describeCompetitionMatchdayMath,
  estimateCompetitionMatches,
  estimateCompetitionMatchdays,
  estimatePlayoffMatchdays,
  seasonSetupToDemand,
} from "./index";
import {
  compareMatchdayKeys,
  parseMatchdayKey,
} from "@/services/match/competitionService";

describe("seasonSetup estimates", () => {
  it("estimates single-poule competition matches", () => {
    const setup = createDefaultSeasonSetup(8);
    setup.systems = { competition: true, cup: false, playoffs: false };
    setup.competition.hasDivisions = false;
    setup.competition.estimatedTeamCount = 8;
    setup.competition.regularRounds = 2;
    expect(estimateCompetitionMatches(setup)).toBe(56);
  });

  it("estimates division competition matches", () => {
    const setup = createDefaultSeasonSetup(12);
    setup.systems = { competition: true, cup: false, playoffs: false };
    setup.competition.hasDivisions = true;
    setup.competition.divisions = [
      { id: 1, name: "A", sort_order: 1 },
      { id: 2, name: "B", sort_order: 2 },
    ];
    setup.competition.divisionTeamCounts = [6, 6];
    setup.competition.regularRounds = 1;
    expect(estimateCompetitionMatches(setup)).toBe(30);
  });

  it("estimates from saved teamDivisions when present", () => {
    const setup = createDefaultSeasonSetup(24);
    setup.systems = { competition: true, cup: false, playoffs: false };
    setup.competition.hasDivisions = true;
    setup.competition.divisions = [
      { id: 1, name: "A", sort_order: 1 },
      { id: 2, name: "B", sort_order: 2 },
    ];
    setup.competition.divisionTeamCounts = [11, 11];
    setup.competition.regularRounds = 3;
    const td: Record<number, number> = {};
    for (let i = 1; i <= 12; i++) td[i] = 1;
    for (let i = 13; i <= 24; i++) td[i] = 2;
    setup.competition.teamDivisions = td;
    expect(estimateCompetitionMatches(setup)).toBe(396);
  });

  it("estimates competition matchdays with parallel divisions", () => {
    const setup = createDefaultSeasonSetup(16);
    setup.systems = { competition: true, cup: false, playoffs: false };
    setup.competition.hasDivisions = true;
    setup.competition.divisions = [
      { id: 1, name: "Eerste", sort_order: 1 },
      { id: 2, name: "Tweede", sort_order: 2 },
    ];
    setup.competition.divisionTeamCounts = [8, 8];
    setup.competition.regularRounds = 2;
    expect(estimateCompetitionMatchdays(setup)).toBe(14);
  });

  it("telt bij oneven reeks n speeldagen per ronde (bye), niet n−1", () => {
    const setup = createDefaultSeasonSetup(22);
    setup.systems = { competition: true, cup: false, playoffs: false };
    setup.competition.hasDivisions = true;
    setup.competition.divisions = [
      { id: 1, name: "Eerste", sort_order: 1 },
      { id: 2, name: "Tweede", sort_order: 2 },
    ];
    setup.competition.divisionTeamCounts = [11, 11];
    setup.competition.regularRounds = 3;
    // 11 ploegen → 11 speeldagen/ronde × 3 = 33 (niet 10×3 = 30)
    expect(estimateCompetitionMatchdays(setup)).toBe(33);
    expect(estimateCompetitionMatches(setup)).toBe(330);
    expect(describeCompetitionMatchdayMath(setup)).toMatch(/11 speeldagen\/ronde/);
  });

  it("maps setup to season demand with multi systems", () => {
    const setup = createDefaultSeasonSetup(14);
    setup.systems = { competition: true, cup: true, playoffs: true };
    setup.playoffs.rounds = 2;
    const demand = seasonSetupToDemand(setup, 14);
    expect(demand.cupTeamCount).toBe(14);
    expect(demand.playoffMatchdays).toBe(estimatePlayoffMatchdays(setup));
    expect(demand.competitionMatchdays).toBe(estimateCompetitionMatchdays(setup));
  });
});

describe("assignTeamsToDivisions", () => {
  it("dumpt geen extra teams in de laatste reeks", () => {
    const ids = Array.from({ length: 24 }, (_, i) => i + 1);
    const assignment = assignTeamsToDivisions(ids, [1, 2], [11, 11]);
    const a = Object.values(assignment).filter((d) => d === 1).length;
    const b = Object.values(assignment).filter((d) => d === 2).length;
    expect(a).toBe(11);
    expect(b).toBe(11);
    expect(Object.keys(assignment)).toHaveLength(22);
  });
});

describe("cupBusyTeamsByMondayFromPlan", () => {
  it("telt eenzijdige bekerduels mee; negeert BYE-markers", () => {
    const busy = cupBusyTeamsByMondayFromPlan(
      [
        { home_team_id: 10, away_team_id: 11, match_date: "2026-08-17T18:00:00", match_time: "18:00" },
        { home_team_id: 12, away_team_id: null, match_date: "2026-08-17T19:00:00", match_time: "19:00" },
        { home_team_id: 99, away_team_id: null, match_date: "2026-08-17T00:00:00", match_time: "00:00", venue: "BYE" },
        { home_team_id: 13, away_team_id: 14, match_date: "2026-08-24T19:00:00", match_time: "19:00" },
      ],
      (d) => (d.startsWith("2026-08-17") ? "2026-08-17" : "2026-08-24"),
    );
    expect(busy["2026-08-17"]?.sort((a, b) => a - b)).toEqual([10, 11, 12]);
    expect(busy["2026-08-24"]?.sort((a, b) => a - b)).toEqual([13, 14]);
  });
});

describe("cupDatesByMondayFromPlan / cupUnassignedByMondayFromPlan", () => {
  const toMonday = (_d: string) => "2027-06-07";

  it("houdt TBD-halve finales bij als bekerdag zonder ploegen", () => {
    const plan = [
      {
        home_team_id: null,
        away_team_id: null,
        match_date: "2027-06-07",
        match_time: "20:00",
      },
      {
        home_team_id: null,
        away_team_id: null,
        match_date: "2027-06-07",
        match_time: "21:00",
      },
    ];
    expect(cupDatesByMondayFromPlan(plan, toMonday)["2027-06-07"]).toEqual([
      "2027-06-07",
    ]);
    expect(cupUnassignedByMondayFromPlan(plan, toMonday)["2027-06-07"]).toBe(true);
    expect(cupBusyTeamsByMondayFromPlan(plan, toMonday)["2027-06-07"]).toBeUndefined();
  });
});

describe("matchday packing order", () => {
  it("parses pool and matchday from key", () => {
    expect(parseMatchdayKey("2-30")).toEqual({ poolKey: "2", matchday: 30 });
    expect(parseMatchdayKey("all-3")).toEqual({ poolKey: "all", matchday: 3 });
  });

  it("sorts by matchday first so divisions interleave", () => {
    const keys = ["1-30", "2-1", "1-1", "2-2", "1-2"];
    expect([...keys].sort(compareMatchdayKeys)).toEqual([
      "1-1",
      "2-1",
      "1-2",
      "2-2",
      "1-30",
    ]);
  });
});
