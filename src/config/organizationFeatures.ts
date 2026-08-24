/** Per-organisatie feature flags. Tabs/routes worden hierop verborgen. */

export interface OrganizationFeatures {
  playoffs: boolean;
  /** Speelmoment-voorkeuren in team-modal (dagen, slots, locaties). */
  teamSlotPreferences: boolean;
}

const DEFAULT_FEATURES: OrganizationFeatures = {
  playoffs: true,
  teamSlotPreferences: false,
};

const ORGANIZATION_FEATURES: Record<string, Partial<OrganizationFeatures>> = {
  harelbeke: { playoffs: true, teamSlotPreferences: true },
  kuurne: { playoffs: false, teamSlotPreferences: false },
};

export function getOrganizationFeatures(
  slug: string | undefined | null,
): OrganizationFeatures {
  if (!slug) return DEFAULT_FEATURES;
  const overrides = ORGANIZATION_FEATURES[slug] ?? {};
  return { ...DEFAULT_FEATURES, ...overrides };
}
