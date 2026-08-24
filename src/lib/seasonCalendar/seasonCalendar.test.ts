import { describe, expect, it } from "vitest";
import {
  buildConfigWeekGrid,
  buildSeasonPlan,
  buildSeasonSlotGrids,
  capacityForWeek,
  reserveCupWeeks,
  resolveCupBracketSlotsPerWeek,
  resolveEffectiveSlotsPerWeek,
} from "./index";
import type { SlotDetailLike } from "./types";

function makeSlots(
  count: number,
  opts?: { validFrom?: string; validUntil?: string; dayOfWeek?: number },
): SlotDetailLike[] {
  return Array.from({ length: count }, (_, i) => ({
    venue: i % 2 === 0 ? "Hal A" : "Hal B",
    timeslot: {
      timeslot_id: i + 1,
      venue_id: (i % 2) + 1,
      day_of_week: opts?.dayOfWeek ?? (i % 2 === 0 ? 1 : 5),
      start_time: `${18 + (i % 3)}:00`,
      valid_from: opts?.validFrom ?? null,
      valid_until: opts?.validUntil ?? null,
    },
  }));
}

describe("buildConfigWeekGrid", () => {
  it("markeert alle slots blocked buiten valid_from/until", () => {
    const slots = makeSlots(16, {
      validFrom: "2026-09-01",
      validUntil: "2027-05-31",
    });
    const grid = buildConfigWeekGrid("2026-08-17", slots, []);
    expect(grid.configAvailableCount).toBe(0);
    expect(grid.freeCount).toBe(0);
    expect(grid.blockedConfig).toBe(16);
  });

  it("toont vakantieweken als phase vacation i.p.v. ze te verbergen", () => {
    const slots = makeSlots(4, { dayOfWeek: 1 });
    const plan = buildSeasonPlan({
      seasonStart: "2026-08-10",
      seasonEnd: "2026-08-31",
      vacations: [
        {
          start_date: "2026-08-17",
          end_date: "2026-08-23",
          is_active: true,
        },
      ],
      slotDetails: slots,
      competitionMatches: 8,
      cupTeamCount: 0,
      playoffMatchdays: 0,
    });
    const vacationWeek = plan.weeks.find((w) => w.weekMonday === "2026-08-17");
    expect(vacationWeek).toBeTruthy();
    expect(vacationWeek!.phases).toEqual(["vacation"]);
    expect(plan.competitionWeeks).not.toContain("2026-08-17");
    expect(plan.weeks.some((w) => w.weekMonday === "2026-08-10")).toBe(true);
    expect(plan.weeks.some((w) => w.weekMonday === "2026-08-24")).toBe(true);
  });

  it("maakt een vakantieweek speelbaar via playableVacationWeeks", () => {
    const slots = makeSlots(4, { dayOfWeek: 1 });
    const vacations = [
      {
        start_date: "2027-04-05",
        end_date: "2027-04-18",
        is_active: true,
        name: "Paasvakantie",
      },
    ];
    const blocked = buildSeasonPlan({
      seasonStart: "2027-03-29",
      seasonEnd: "2027-04-26",
      vacations,
      slotDetails: slots,
      competitionMatches: 4,
      cupTeamCount: 0,
      playoffMatchdays: 0,
    });
    expect(
      blocked.weeks.find((w) => w.weekMonday === "2027-04-05")?.phases,
    ).toEqual(["vacation"]);
    expect(blocked.competitionWeeks).not.toContain("2027-04-05");

    const open = buildSeasonPlan({
      seasonStart: "2027-03-29",
      seasonEnd: "2027-04-26",
      vacations,
      playableVacationWeeks: ["2027-04-05"],
      slotDetails: slots,
      competitionMatches: 4,
      cupTeamCount: 0,
      playoffMatchdays: 0,
    });
    const paas = open.weeks.find((w) => w.weekMonday === "2027-04-05");
    expect(paas).toBeTruthy();
    expect(paas!.phases).not.toContain("vacation");
    expect(paas!.freeCount).toBeGreaterThan(0);

    const grid = buildConfigWeekGrid(
      "2027-04-05",
      slots,
      [],
      vacations,
      ["2027-04-05"],
    );
    expect(grid.freeCount).toBe(4);
  });

  it("laat slots vrij binnen geldigheidsperiode", () => {
    const slots = makeSlots(7, {
      validFrom: "2026-09-01",
      validUntil: "2027-05-31",
    });
    const grid = buildConfigWeekGrid("2026-09-07", slots, []);
    expect(grid.freeCount).toBe(7);
  });

  it("opent Vlasschaard 18u alleen als Dageraad 21u geblokkeerd is", () => {
    const slots: SlotDetailLike[] = [
      {
        venue: "Dageraad",
        timeslot: {
          timeslot_id: 8,
          venue_id: 1,
          day_of_week: 1,
          start_time: "21:00",
        },
      },
      {
        venue: "Vlasschaard",
        timeslot: {
          timeslot_id: 9,
          venue_id: 2,
          day_of_week: 1,
          start_time: "18:00",
          available_when_blocked_timeslot_id: 8,
        },
      },
    ];
    const open = buildConfigWeekGrid("2026-09-07", slots, []);
    expect(open.slots[0].status).toBe("available");
    expect(open.slots[1].status).toBe("blocked_config");

    const blocked = buildConfigWeekGrid("2026-09-07", slots, [
      {
        id: 1,
        name: "Zweetvoetmannen",
        date: "2026-09-07",
        venue_id: 1,
        timeslot_id: 8,
        is_active: true,
      },
    ]);
    expect(blocked.slots[0].status).toBe("blocked_config");
    expect(blocked.slots[1].status).toBe("available");
  });

  it("blokkeert di–zo als kerstvakantie op di begint (ma blijft vrij)", () => {
    // Week ma 21/12/2026: 4 maandagslots + dinsdagslots; vakantie vanaf 22/12
    const slots: SlotDetailLike[] = [
      ...Array.from({ length: 4 }, (_, i) => ({
        venue: "Hal A",
        timeslot: {
          timeslot_id: i + 1,
          venue_id: 1,
          day_of_week: 1,
          start_time: `${18 + i}:00`,
        },
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        venue: "Hal A",
        timeslot: {
          timeslot_id: i + 10,
          venue_id: 1,
          day_of_week: 2,
          start_time: `${18 + i}:00`,
        },
      })),
    ];
    const vacations = [
      { start_date: "2026-12-22", end_date: "2027-01-04", is_active: true },
    ];
    const grid = buildConfigWeekGrid("2026-12-21", slots, [], vacations);
    expect(grid.configAvailableCount).toBe(4);
    const freeDays = grid.slots
      .filter((s) => s.status === "available")
      .map((s) => s.dayOfWeek);
    expect(freeDays.every((d) => d === 1)).toBe(true);
    expect(
      grid.slots.filter((s) => s.dayOfWeek === 2 && s.status === "blocked_config"),
    ).toHaveLength(4);
  });
});

describe("reserveCupWeeks", () => {
  it("slaat weken met 0 capaciteit over (augustus-gat)", () => {
    const slots = makeSlots(16, {
      validFrom: "2026-09-01",
      validUntil: "2027-05-31",
    });
    const result = reserveCupWeeks({
      seasonStart: "2026-08-01",
      seasonEnd: "2027-05-31",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      cupTeamCount: 22,
    });
    expect(result.dates.length).toBeGreaterThan(0);
    expect(result.dates.every((d) => d >= "2026-09-01")).toBe(true);
    expect(result.dates.includes("2026-08-17")).toBe(false);
    expect(result.firstRoundWeeks).toBeGreaterThanOrEqual(1);
  });

  it("gebruikt effectieve capaciteit i.p.v. nominale 16 slots", () => {
    // Slechts 5 van 16 slots geldig → 11 paren vragen ≥3 first-round weken
    const all = makeSlots(16, { validFrom: "2026-09-01", validUntil: "2027-05-31" });
    const limited = all.map((s, i) =>
      i < 5
        ? s
        : {
            ...s,
            timeslot: {
              ...s.timeslot!,
              valid_from: "2099-01-01",
              valid_until: "2099-12-31",
            },
          },
    );
    const result = reserveCupWeeks({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-05-31",
      slotDetails: limited,
      cupTeamCount: 22,
    });
    expect(result.effectiveSlotsPerWeek).toBeLessThanOrEqual(5);
    expect(result.requiredWeeks).toBeGreaterThanOrEqual(6);
    // 22 teams: voorronde + 1/8 + QF + SF + F (niet meer firstRound+3)
    expect(result.requiredWeeks).toBeGreaterThan(result.firstRoundWeeks + 3);
  });
});

describe("buildSeasonPlan", () => {
  it("zet playoffs aan het einde en beker/competitie ervoor", () => {
    const slots = makeSlots(7);
    const plan = buildSeasonPlan({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-04-30",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 70,
      cupTeamCount: 14,
      playoffMatchdays: 4,
    });
    expect(plan.playoffWeeks.length).toBe(4);
    const lastPlayable = plan.weeks.filter((w) => w.freeCount > 0).map((w) => w.weekMonday);
    const last4 = lastPlayable.slice(-4);
    expect(plan.playoffWeeks).toEqual(last4);
    expect(plan.cupDates.every((d) => !plan.playoffWeeks.includes(d))).toBe(true);
    expect(plan.efficiency.usableWeeks).toBeGreaterThan(0);
    expect(plan.daySeparation.separated).toBe(true);
    expect(plan.sharedCupMondays).toBeDefined();
  });

  it("deelt bekerweken zodra er na de beker speelmomenten vrij blijven", () => {
    const slots = makeSlots(7);

    // 8 ploegen beker op 7 slots/week: de drukste ronde vult 4 momenten, dus blijft
    // er ruimte over die de competitie mag benutten.
    const ruim = buildSeasonPlan({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-05-31",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 40,
      cupTeamCount: 8,
      playoffMatchdays: 2,
    });
    expect(ruim.daySeparation.separated).toBe(true);
    expect(ruim.efficiency.sharedWeeks).toBeGreaterThan(0);
    expect(ruim.efficiency.sharedWeeks).toBe(ruim.sharedCupMondays.length);
    expect(
      ruim.sharedCupMondays.every(
        (d) => ruim.cupDates.includes(d) && ruim.competitionWeeks.includes(d),
      ),
    ).toBe(true);

    // Krap seizoen: gedeelde weken blijven consistent met de weekstrook
    const krap = buildSeasonPlan({
      seasonStart: "2026-09-01",
      seasonEnd: "2026-12-15",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 120,
      cupTeamCount: 22,
      playoffMatchdays: 2,
    });
    expect(krap.daySeparation.separated).toBe(true);
    expect(krap.efficiency.sharedWeeks).toBe(krap.sharedCupMondays.length);
    if (krap.sharedCupMondays.length > 0) {
      expect(
        krap.cupDates.filter((d) => krap.competitionWeeks.includes(d)).length,
      ).toBe(krap.sharedCupMondays.length);
    }
  });

  it("deelt geen bekerweken bij één speeldag per week", () => {
    // Alleen maandag geconfigureerd → geen dagscheiding, dus geen gedeelde weken.
    const slots = makeSlots(4, { dayOfWeek: 1 });
    const plan = buildSeasonPlan({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-05-31",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 40,
      cupTeamCount: 8,
      playoffMatchdays: 2,
    });
    expect(plan.daySeparation.separated).toBe(false);
    expect(plan.sharedCupMondays).toEqual([]);
    expect(plan.cupDates.every((d) => !plan.competitionWeeks.includes(d))).toBe(true);
  });

  it("gebruikt handmatig gekozen bekerweken", () => {
    const slots = makeSlots(7);
    const preferred = ["2026-10-05", "2026-11-02", "2026-12-07", "2027-01-11"];
    const plan = buildSeasonPlan({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-04-30",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 40,
      cupTeamCount: 8,
      playoffMatchdays: 0,
      cupWeekMode: "manual",
      cupPreferredWeeks: preferred,
    });
    expect(plan.cupBracket.requiredWeeks).toBeGreaterThan(0);
    expect(plan.cupDates.every((d) => preferred.includes(d))).toBe(true);
    expect(plan.cupDates.length).toBe(plan.cupBracket.requiredWeeks);
  });

  it("beperkt competitieweken tot het aantal benodigde speeldagen", () => {
    // 11+11 × 3 rondes = 330 wedstrijden / 33 speeldagen: niet méér weken markeren.
    const slots = makeSlots(16);
    const plan = buildSeasonPlan({
      seasonStart: "2026-09-07",
      seasonEnd: "2027-06-21",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 330,
      competitionMatchdays: 33,
      cupTeamCount: 22,
      playoffMatchdays: 2,
    });

    expect(plan.competitionWeeks.length).toBeLessThanOrEqual(33);
    expect(plan.competitionWeeks).toEqual([...plan.competitionWeeks].sort());
  });

  it("competition-first zet competitie op de vroegste weken en beker erna", () => {
    const slots = makeSlots(8);
    const plan = buildSeasonPlan({
      seasonStart: "2026-09-07",
      seasonEnd: "2027-06-21",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      competitionMatches: 136,
      competitionMatchdays: 17,
      cupTeamCount: 16,
      playoffMatchdays: 4,
      phaseStrategy: "competition-first",
    });

    expect(plan.competitionWeeks.length).toBe(17);
    const lastComp = plan.competitionWeeks[plan.competitionWeeks.length - 1];
    for (const cupWeek of plan.cupDates) {
      expect(cupWeek > lastComp).toBe(true);
    }
  });
});

describe("resolveEffectiveSlotsPerWeek", () => {
  it("neemt mediaan van positieve freeCounts", () => {
    const slots = makeSlots(7);
    const grids = buildSeasonSlotGrids({
      weekMondays: ["2026-09-07", "2026-09-14", "2026-09-21"],
      slotDetails: slots,
    });
    expect(capacityForWeek(grids, "2026-09-07")).toBe(7);
    expect(resolveEffectiveSlotsPerWeek(grids, 16)).toBe(7);
  });
});

describe("resolveCupBracketSlotsPerWeek", () => {
  it("gebruikt piekcapaciteit voor beker-bracket", () => {
    const slots = makeSlots(12);
    const grids = buildSeasonSlotGrids({
      weekMondays: ["2026-09-07", "2026-09-14", "2026-09-21"],
      slotDetails: slots,
    });
    expect(resolveCupBracketSlotsPerWeek(grids, 16)).toBe(12);
  });

  it("22 teams: meer slots/week → minder bekerweken nodig", () => {
    const slots = makeSlots(12);
    const with12 = reserveCupWeeks({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-05-31",
      slotDetails: slots,
      timeslots: slots.map((s) => s.timeslot!),
      cupTeamCount: 22,
    });
    const with7 = reserveCupWeeks({
      seasonStart: "2026-09-01",
      seasonEnd: "2027-05-31",
      slotDetails: makeSlots(7),
      timeslots: makeSlots(7).map((s) => s.timeslot!),
      cupTeamCount: 22,
    });
    expect(with12.effectiveSlotsPerWeek).toBe(12);
    expect(with7.effectiveSlotsPerWeek).toBe(7);
    expect(with12.requiredWeeks).toBeLessThan(with7.requiredWeeks);
    expect(with12.requiredWeeks).toBe(5);
    expect(with7.requiredWeeks).toBe(6);
  });
});
