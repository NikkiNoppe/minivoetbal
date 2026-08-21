import { resolveBootOrganizationSlug } from '@/config/organizationHosts';
import { applyThemeToCSS, resolveOrganizationTheme } from '@/lib/colorUtils';
import { applyThemeToDocument } from '@/lib/themeDocument';
import { applyTenantPwaHead } from '@/lib/pwaHead';

/**
 * Past het code-fallback thema toe op basis van hostname / ?org= / pad.
 * Call vóór React mount en bij tenant-wissel vóór de org-fetch klaar is.
 */
export function applyBootOrganizationTheme(options?: {
  hostname?: string;
  isSuperAdmin?: boolean;
  slug?: string;
}): string {
  const slug =
    options?.slug ??
    resolveBootOrganizationSlug({
      hostname: options?.hostname,
      isSuperAdmin: options?.isSuperAdmin,
    });
  const theme = resolveOrganizationTheme(slug);
  applyThemeToCSS(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.org = slug;
  }
  applyTenantPwaHead(slug);
  void applyThemeToDocument(theme);
  return slug;
}
