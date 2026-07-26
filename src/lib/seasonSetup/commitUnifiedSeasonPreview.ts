/** Bevestig unified preview → schrijf wedstrijden naar DB (sessie-org). */

import { competitionService } from "@/services/match/competitionService";
import { bekerService } from "@/services/match/cupService";
import { playoffService } from "@/services/match/playoffService";
import { fetchMatchesForSession } from "@/services/core/matchesSessionBulk";
import { setSuperAdminActingOrganization } from "@/services/organization/superAdminOrganizationService";
import { getSuperAdminTenantById } from "@/config/superAdminTenants";
import type {
  UnifiedSeasonCommitPayload,
  UnifiedSeasonCommitResult,
} from "./commitTypes";

async function ensureActingOrganization(organizationId: number): Promise<{
  ok: boolean;
  message?: string;
}> {
  // SuperAdmin: forceer acting org = UI-tenant (Kuurne=2 / Harelbeke=1).
  // Gewone admin: RPC faalt stil; hun sessie-org blijft leidend.
  await setSuperAdminActingOrganization(organizationId);

  const tenant = getSuperAdminTenantById(organizationId);
  const label = tenant?.name ?? `organisatie ${organizationId}`;

  // Smoke-check: als er al wedstrijden zijn, moeten die bij deze org horen
  // (fetchMatchesForSession filtert op sessie-org).
  try {
    await fetchMatchesForSession({});
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : `Kon sessie niet verifiëren voor ${label}.`,
    };
  }

  return { ok: true };
}

async function preflightConflicts(payload: UnifiedSeasonCommitPayload): Promise<string | null> {
  const all = await fetchMatchesForSession({});
  const hasCup = all.some((m) => m.is_cup_match);
  const hasPlayoff = all.some((m) => m.is_playoff_match);
  const hasCompetition = all.some(
    (m) => !m.is_cup_match && !m.is_playoff_match,
  );

  const blockers: string[] = [];
  if (payload.cupPlan?.length && hasCup) {
    blockers.push("beker");
  }
  if (payload.competitionPlan?.length && hasCompetition) {
    blockers.push("competitie");
  }
  if (payload.playoffIntent && hasPlayoff) {
    blockers.push("play-offs");
  }
  if (blockers.length === 0) return null;
  return (
    `Er bestaan al wedstrijden voor: ${blockers.join(", ")}. ` +
    "Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten."
  );
}

/**
 * Schrijft de bewaarde preview-plannen naar de database.
 * Volgorde: beker → competitie → play-offs (zelfde als preview).
 * `organization_id` op rijen komt uit de sessie (niet uit de client-payload).
 */
export async function commitUnifiedSeasonPreview(
  payload: UnifiedSeasonCommitPayload,
): Promise<UnifiedSeasonCommitResult> {
  const results: UnifiedSeasonCommitResult["results"] = {};

  if (
    !payload.cupPlan?.length &&
    !payload.competitionPlan?.length &&
    !payload.playoffIntent
  ) {
    return {
      success: false,
      message: "Geen bevestigbare plannen in de preview.",
      results,
    };
  }

  const orgGuard = await ensureActingOrganization(payload.organizationId);
  if (!orgGuard.ok) {
    return {
      success: false,
      message: orgGuard.message || "Organisatie-sessie kon niet worden gezet.",
      results,
    };
  }

  const conflict = await preflightConflicts(payload);
  if (conflict) {
    return { success: false, message: conflict, results };
  }

  // 1) Beker
  if (payload.cupPlan?.length) {
    const cup = await bekerService.createCupFromPlan(payload.cupPlan);
    results.cup = {
      success: cup.success,
      message: cup.message,
      count: cup.success ? payload.cupPlan.length : 0,
    };
    if (!cup.success) {
      return {
        success: false,
        message: `Beker mislukt: ${cup.message}`,
        results,
      };
    }
  }

  // 2) Competitie
  if (payload.competitionPlan?.length) {
    const competition = await competitionService.createCompetitionFromPlan(
      payload.competitionPlan.map((p) => ({
        ...p,
        home_team_id: p.home_team_id as number,
      })),
    );
    const imported = payload.competitionPlan.filter((p) => p.away_team_id != null)
      .length;
    results.competition = {
      success: competition.success,
      message: competition.message,
      count: competition.success ? imported : 0,
    };
    if (!competition.success) {
      return {
        success: false,
        message: `Competitie mislukt (beker kan al geschreven zijn): ${competition.message}`,
        results,
      };
    }
  }

  // 3) Play-offs — regenereren met slot-packing ná cup+comp occupancy
  if (payload.playoffIntent) {
    const intent = payload.playoffIntent;
    const playoff = await playoffService.generatePositionBasedPlayoffs(
      intent.topPositions,
      intent.bottomPositions,
      intent.rounds,
      intent.startDate,
      intent.endDate,
      payload.organizationId,
    );
    results.playoff = {
      success: playoff.success,
      message: playoff.message,
      count: playoff.success
        ? intent.topPositions.length + intent.bottomPositions.length
        : 0,
    };
    if (!playoff.success) {
      return {
        success: false,
        message: `Play-offs mislukt (beker/competitie kunnen al geschreven zijn): ${playoff.message}`,
        results,
      };
    }
  }

  const parts: string[] = [];
  if (results.cup?.success) parts.push(`beker (${results.cup.count})`);
  if (results.competition?.success) {
    parts.push(`competitie (${results.competition.count})`);
  }
  if (results.playoff?.success) parts.push("play-offs (concept)");

  const tenant = getSuperAdminTenantById(payload.organizationId);
  const orgLabel = tenant?.name ?? `org ${payload.organizationId}`;

  return {
    success: true,
    message: `Opgeslagen voor ${orgLabel}: ${parts.join(", ") || "niets"}.`,
    results,
  };
}
