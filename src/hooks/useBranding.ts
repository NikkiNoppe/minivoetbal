import { useMemo } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import {
  getBootBranding,
  parseBrandingSettings,
  type OrganizationBranding,
} from '@/types/branding';

export function useBranding(): OrganizationBranding {
  const { organization, organizationSlug } = useOrganization();

  return useMemo(
    () =>
      organization
        ? parseBrandingSettings(organization.brandingSettings, organization.slug)
        : getBootBranding(organizationSlug),
    [organization, organizationSlug],
  );
}
