/** Per-organisatie feature flags. Tabs/routes worden hierop verborgen. */

export interface OrganizationFeatures {
  playoffs: boolean;
}

const DEFAULT_FEATURES: OrganizationFeatures = {
  playoffs: true,
};

const ORGANIZATION_FEATURES: Record<string, Partial<OrganizationFeatures>> = {
  harelbeke: { playoffs: true },
  kuurne: { playoffs: false },
};

export function getOrganizationFeatures(
  slug: string | undefined | null,
): OrganizationFeatures {
  if (!slug) return DEFAULT_FEATURES;
  const overrides = ORGANIZATION_FEATURES[slug] ?? {};
  return { ...DEFAULT_FEATURES, ...overrides };
}
