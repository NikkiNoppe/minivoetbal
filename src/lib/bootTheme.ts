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
  const theme = readCachedTheme(slug) ?? resolveOrganizationTheme(slug);
  applyThemeToCSS(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.org = slug;
  }
  applyTenantPwaHead(slug);
  void applyThemeToDocument(theme);
  return slug;
}

const THEME_CACHE_PREFIX = 'boot-theme:';

/** Laatst geladen DB-thema per organisatie (slug) — voorkomt kleurflits bij opstart. */
export function readCachedTheme(slug: string): ReturnType<typeof resolveOrganizationTheme> | null {
  try {
    const raw = window.localStorage.getItem(THEME_CACHE_PREFIX + slug);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCachedTheme(slug: string, theme: unknown): void {
  try {
    window.localStorage.setItem(THEME_CACHE_PREFIX + slug, JSON.stringify(theme));
  } catch {
    /* ignore */
  }
}
