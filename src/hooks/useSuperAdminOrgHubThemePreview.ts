import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  applyThemeToCSS,
  resolveOrganizationTheme,
} from '@/lib/colorUtils';
import { applyThemeToDocument } from '@/lib/themeDocument';
import { useOrganization } from '@/hooks/useOrganization';
import { useSuperAdminActingOrg } from '@/hooks/useSuperAdminActingOrg';
import {
  fetchOrganizationThemeColors,
  restoreSiteThemeFromCache,
} from '@/hooks/useThemeColors';
import { parseBrandingSettings } from '@/types/branding';

type OrgRow = {
  id: number;
  slug: string;
  brandingSettings?: unknown;
};

/**
 * Past het visuele palet van de geselecteerde acting tenant toe in platform beheer.
 * Herstelt het hostname-sitethema bij unmount (andere admin-tab).
 */
export function useSuperAdminOrgHubThemePreview(
  organizations: OrgRow[] | undefined,
): void {
  const actingOrg = useSuperAdminActingOrg();
  const queryClient = useQueryClient();
  const { organizationId, organizationSlug } = useOrganization();

  useEffect(() => {
    if (!actingOrg) return;

    const org = organizations?.find((o) => o.id === actingOrg.organizationId);
    const brandingTheme = org
      ? parseBrandingSettings((org.brandingSettings ?? {}) as Record<string, unknown>).themeColors
      : undefined;
    const slugFallback = resolveOrganizationTheme(actingOrg.slug, {
      brandingTheme,
    });

    applyThemeToCSS(slugFallback);
    void applyThemeToDocument(slugFallback);

    let cancelled = false;

    void fetchOrganizationThemeColors(
      actingOrg.organizationId,
      actingOrg.slug,
      brandingTheme,
    ).then((theme) => {
      if (cancelled) return;
      applyThemeToCSS(theme);
      void applyThemeToDocument(theme);
    });

    return () => {
      cancelled = true;
    };
  }, [actingOrg?.organizationId, actingOrg?.slug, organizations]);

  useEffect(() => {
    return () => {
      restoreSiteThemeFromCache(queryClient, organizationSlug, organizationId);
    };
  }, [queryClient, organizationId, organizationSlug]);
}
