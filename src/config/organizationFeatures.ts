/** Per-organisatie feature flags. Tabs/routes worden hierop verborgen. */

export interface OrganizationFeatures {
  playoffs: boolean;
  /** Speelmoment-voorkeuren in team-modal (dagen, slots, locaties). */
  teamSlotPreferences: boolean;
  /** Financieel overzicht op profiel (teamverantwoordelijke). */
  profileFinancial: boolean;
}

const DEFAULT_FEATURES: OrganizationFeatures = {
  playoffs: true,
  teamSlotPreferences: false,
  profileFinancial: true,
};

const ORGANIZATION_FEATURES: Record<string, Partial<OrganizationFeatures>> = {
  harelbeke: { playoffs: true, teamSlotPreferences: true, profileFinancial: true },
  kuurne: { playoffs: false, teamSlotPreferences: false, profileFinancial: false },
};

export function getOrganizationFeatures(
  slug: string | undefined | null,
): OrganizationFeatures {
  if (!slug) return DEFAULT_FEATURES;
  const overrides = ORGANIZATION_FEATURES[slug] ?? {};
  return { ...DEFAULT_FEATURES, ...overrides };
}
