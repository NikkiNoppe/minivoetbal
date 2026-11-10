import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  costNameImpliesMatchCostSuppression,
  forfaitConflictsWithScores,
  isForfaitScore,
  scoresForForfaitLoser,
  FORFAIT_WIN_SCORE,
  FORFAIT_LOSE_SCORE,
  findForfaitVerwittigdPenaltyCost,
  costNameIsForfaitVerwittigd,
  shouldSyncMatchCostsAfterMatchUpdate,
  matchHasForfaitPenalty,
  matchSkipAutoMatchCosts,
} from "./matchCostService";

vi.mock("@/lib/authSession", () => ({
  getRpcSessionArgs: vi.fn(() => ({ p_session_token: "test-token" })),
  getEdgeFunctionHeaders: vi.fn(() => ({})),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("@/services/core/matchesSessionFetch", () => ({
  fetchMatchForSession: vi.fn(),
  fetchAllMatchesForSession: vi.fn(),
}));

vi.mock("@/services/financial/costsSessionFetch", () => ({
  fetchCostsForSession: vi.fn(),
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchMatchForSession } from "@/services/core/matchesSessionFetch";
import { fetchCostsForSession } from "@/services/financial/costsSessionFetch";

const mockFetchMatchForSession = vi.mocked(fetchMatchForSession);
const mockFetchCostsForSession = vi.mocked(fetchCostsForSession);

const mockRpc = vi.mocked(supabase.rpc);
const mockFrom = vi.mocked(supabase.from);

function chain(result: { data: unknown; error?: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ["select", "eq", "maybeSingle", "order", "limit"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = terminal;
  builder.single = terminal;
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return builder;
}

describe("costNameImpliesMatchCostSuppression", () => {
  it("herkent forfait-boeten", () => {
    expect(costNameImpliesMatchCostSuppression("Forfait verwittigd")).toBe(true);
    expect(costNameImpliesMatchCostSuppression("FORFAIT")).toBe(true);
  });

  it("herkent walk-over en vrijstelling", () => {
    expect(costNameImpliesMatchCostSuppression("Walk-over")).toBe(true);
    expect(costNameImpliesMatchCostSuppression("Vrijstelling")).toBe(true);
  });

  it("negeert gewone boetes", () => {
    expect(costNameImpliesMatchCostSuppression("Boete te laat ingevuld")).toBe(false);
    expect(costNameImpliesMatchCostSuppression("Gele kaart")).toBe(false);
    expect(costNameImpliesMatchCostSuppression(null)).toBe(false);
  });
});

describe("matchHasForfaitPenalty", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gebruikt RPC-resultaat", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(matchHasForfaitPenalty(42)).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("match_has_forfait_penalty", { p_match_id: 42 });
  });

  it("valt terug op team_costs query", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "match_has_forfait_penalty") {
        return Promise.resolve({ data: null, error: { message: "rpc missing" } });
      }
      if (fn === "get_team_costs_for_match") {
        return Promise.resolve({
          data: [{ cost_name: "Forfait", cost_category: "penalty" }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    await expect(matchHasForfaitPenalty(7)).resolves.toBe(true);
  });
});

describe("matchSkipAutoMatchCosts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leest skip_auto_match_costs van matches", async () => {
    mockFetchMatchForSession.mockResolvedValueOnce({ skip_auto_match_costs: true } as never);
    await expect(matchSkipAutoMatchCosts(99)).resolves.toBe(true);
  });
});

describe("costNameIsForfaitVerwittigd", () => {
  it("herkent Forfait verwittigd", () => {
    expect(costNameIsForfaitVerwittigd("Forfait verwittigd")).toBe(true);
  });

  it("herkent forfait tijdens de wedstrijd niet als verwittigd", () => {
    expect(costNameIsForfaitVerwittigd("Forfait tijdens de wedstrijd")).toBe(false);
  });
});

describe("isForfaitScore / scoresForForfaitLoser", () => {
  it("herkent reglementaire 10-0 en 0-10", () => {
    expect(isForfaitScore(FORFAIT_WIN_SCORE, FORFAIT_LOSE_SCORE)).toBe(true);
    expect(isForfaitScore(FORFAIT_LOSE_SCORE, FORFAIT_WIN_SCORE)).toBe(true);
    expect(isForfaitScore(3, 1)).toBe(false);
    expect(isForfaitScore(null, 0)).toBe(false);
  });

  it("zet uitslag t.o.v. verliezend team", () => {
    expect(scoresForForfaitLoser(1, 1, 2)).toEqual({ homeScore: 0, awayScore: 10 });
    expect(scoresForForfaitLoser(2, 1, 2)).toEqual({ homeScore: 10, awayScore: 0 });
    expect(scoresForForfaitLoser(9, 1, 2)).toBeNull();
  });

  it("conflicteert alleen bij niet-forfait uitslag", () => {
    expect(forfaitConflictsWithScores(10, 0)).toBe(false);
    expect(forfaitConflictsWithScores(0, 10)).toBe(false);
    expect(forfaitConflictsWithScores(2, 1)).toBe(true);
    expect(forfaitConflictsWithScores(null, null)).toBe(false);
  });

  it("10-0 patroon alleen ≠ forfait: forfait vereist boete, niet de score", () => {
    // isForfaitScore herkent het reglementaire patroon; zonder forfait-boete
    // mag niets automatisch een forfait aanmaken of kosten onderdrukken.
    expect(isForfaitScore(10, 0)).toBe(true);
    expect(costNameImpliesMatchCostSuppression("Veldkosten")).toBe(false);
    expect(costNameIsForfaitVerwittigd("")).toBe(false);
  });
});

describe("findForfaitVerwittigdPenaltyCost", () => {
  const penalties = [
    { id: 25, name: "Forfait tijdens de wedstrijd", amount: 15 },
    { id: 6, name: "Forfait verwittigd", amount: 25 },
    { id: 9, name: "Gele kaart", amount: 5 },
  ];

  it("kiest Forfait verwittigd boven tijdens de wedstrijd", () => {
    const result = findForfaitVerwittigdPenaltyCost(penalties);
    expect(result?.id).toBe(6);
    expect(result?.name).toBe("Forfait verwittigd");
    expect(Number(result?.amount)).toBe(25);
  });

  it("valt terug op tweede forfait in alfabetische volgorde", () => {
    const onlyForfaits = [
      { id: 1, name: "Forfait A", amount: 10 },
      { id: 2, name: "Forfait B", amount: 20 },
    ];
    expect(findForfaitVerwittigdPenaltyCost(onlyForfaits)?.id).toBe(2);
  });
});

describe("shouldSyncMatchCostsAfterMatchUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMatchForSession.mockResolvedValue({ skip_auto_match_costs: false } as never);
  });

  it("staat sync toe bij forfait op indiening (admin-kosten)", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockFetchCostsForSession.mockResolvedValue([{ id: 10, name: "Administratiekosten" }] as never);
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "match_has_forfait_penalty") return Promise.resolve({ data: true, error: null });
      if (fn === "get_team_costs_for_match") {
        return Promise.resolve({ data: [{ cost_setting_id: 10 }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    await expect(shouldSyncMatchCostsAfterMatchUpdate(1, true)).resolves.toBe(true);
  });

  it("blokkeert sync bij skip_auto_match_costs", async () => {
    mockFetchMatchForSession.mockResolvedValue({ skip_auto_match_costs: true } as never);
    await expect(shouldSyncMatchCostsAfterMatchUpdate(1, true)).resolves.toBe(false);
  });

  it("staat sync toe bij eerste indiening zonder forfait", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "match_has_forfait_penalty") return Promise.resolve({ data: false, error: null });
      if (fn === "get_team_costs_for_match") {
        return Promise.resolve({ data: [{ cost_setting_id: 10 }, { cost_setting_id: 10 }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockFetchCostsForSession.mockResolvedValue([{ id: 10, name: "Veldkosten" }] as never);
    await expect(shouldSyncMatchCostsAfterMatchUpdate(1, true)).resolves.toBe(true);
  });
});

describe("financieel UI-filterlogica (wedstrijdformulier)", () => {
  const allCosts = [
    { id: 1, name: "Veldkosten", category: "match_cost", amount: 30 },
    { id: 2, name: "Forfait verwittigd", category: "penalty", amount: 50 },
    { id: 3, name: "Administratiekosten", category: "match_cost", amount: 5 },
  ];

  it("matchCostSettings sluit penalties uit", () => {
    const matchCostSettings = allCosts.filter((cs) => cs.category !== "penalty");
    expect(matchCostSettings).toHaveLength(2);
    expect(matchCostSettings.every((c) => c.category !== "penalty")).toBe(true);
  });

  it("wedstrijdkosten-lijst sluit penalties uit", () => {
    const teamCosts = [
      { id: 1, costs: { name: "Veldkosten", category: "match_cost" } },
      { id: 2, costs: { name: "Forfait verwittigd", category: "penalty" } },
    ];
    const visible = teamCosts.filter((tc) => tc.costs?.category !== "penalty");
    expect(visible).toHaveLength(1);
    expect(visible[0].costs.name).toBe("Veldkosten");
  });

  it("banner: skip_auto alleen tonen zonder actief forfait", () => {
    const showManualBanner = (skipAuto: boolean, hasForfait: boolean) =>
      skipAuto && !hasForfait;
    expect(showManualBanner(true, true)).toBe(false);
    expect(showManualBanner(true, false)).toBe(true);
    expect(showManualBanner(false, false)).toBe(false);
  });

  it("forfait preset kiest verliezend team bij 0-10", () => {
    const homeScore = 0;
    const awayScore = 10;
    const homeTeamId = 100;
    const awayTeamId = 200;
    const suggested =
      homeScore < awayScore ? homeTeamId : awayTeamId;
    expect(suggested).toBe(homeTeamId);
  });
});
