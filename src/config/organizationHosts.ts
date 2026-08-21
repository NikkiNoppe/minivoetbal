import {
  DEFAULT_ORGANIZATION_SLUG,
  isKnownOrganizationSlug,
  ORGANIZATION_URL_PARAM,
} from '@/config/organization';

/** Hostname → organization slug (één centrale mapping).
 *  Eerste paint: zelfde hosts ook in index.html boot-script (data-org). */
export const HOSTNAME_TO_SLUG: Record<string, string> = {
  'harelbekeminivoetbal.nikkinoppe.be': 'harelbeke',
  'kuurneminivoetbal.nikkinoppe.be': 'kuurne',
  'mvvkuurne.nikkinoppe.be': 'kuurne',
  'mvvkuurne.be': 'kuurne',
  'www.mvvkuurne.be': 'kuurne',
  'harelbekeminivoetbal.be': 'harelbeke',
  'www.harelbekeminivoetbal.be': 'harelbeke',
};

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const LOVABLE_PREVIEW_HOST_SUFFIXES = [
  '.lovableproject.com',
  '.lovable.app',
  '.lovable.dev',
  '.sandbox.lovable.dev',
];

function isLovablePreviewHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return LOVABLE_PREVIEW_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function getDevDefaultSlug(): string {
  const fromEnv = import.meta.env.VITE_DEFAULT_ORG_SLUG as string | undefined;
  return fromEnv?.trim().toLowerCase() || DEFAULT_ORGANIZATION_SLUG;
}

export function isLocalDevHostname(hostname: string): boolean {
  return LOCAL_DEV_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Bepaalt slug uit hostname.
 * - Bekende hostname → mapping
 * - localhost/127.0.0.1 → VITE_DEFAULT_ORG_SLUG of harelbeke
 * - Onbekend → null (geen stille fallback)
 */
export function resolveHostnameToSlug(
  hostname: string = window.location.hostname,
): string | null {
  const normalized = hostname.trim().toLowerCase();
  const mapped = HOSTNAME_TO_SLUG[normalized];
  if (mapped) {
    return mapped;
  }
  if (isLocalDevHostname(normalized) || isLovablePreviewHostname(normalized)) {
    return getDevDefaultSlug();
  }
  return null;
}

/** ?org=slug uit query string (zonder dev/superadmin-check). */
export function getOrgSlugQueryParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get(ORGANIZATION_URL_PARAM)?.trim().toLowerCase();
  return slug || null;
}

/** Dev-only: ?org=slug override (niet in productie). */
export function getDevOrgSlugOverride(): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  return getOrgSlugQueryParam();
}

/** Slug uit /superadmin/:slug (platform-portal). Niet voor /superadmin/beheer. */
const SUPERADMIN_RESERVED_SEGMENTS = new Set(['beheer']);

export function getSuperAdminPathSlug(): string | null {
  const match = window.location.pathname.match(
    /^\/superadmin\/([a-z0-9-]+)\/?$/i,
  );
  const slug = match?.[1]?.toLowerCase() ?? null;
  if (!slug || SUPERADMIN_RESERVED_SEGMENTS.has(slug)) {
    return null;
  }
  return slug;
}

/** Pad waar ?org= in productie mag (auth-links op gedeeld domein). */
const PUBLIC_TENANT_QUERY_PATH = /^\/(reset-password|unsubscribe)(\/|$)/;

export function isPublicTenantQueryPath(pathname: string): boolean {
  return PUBLIC_TENANT_QUERY_PATH.test(pathname);
}

/**
 * Actieve org-slug override: superadmin-pad, daarna ?org= (dev of SuperAdmin),
 * en tenslotte de door SuperAdmin gekozen acting-tenant (localStorage).
 */
export function getActiveOrgSlugOverride(options: {
  isSuperAdmin: boolean;
  superAdminActingSlug?: string | null;
}): string | null {
  const pathSlug = getSuperAdminPathSlug();
  if (pathSlug) {
    return pathSlug;
  }

  const querySlug = getOrgSlugQueryParam();
  if (querySlug) {
    if (import.meta.env.DEV || options.isSuperAdmin) {
      return querySlug;
    }
    if (isPublicTenantQueryPath(window.location.pathname)) {
      return querySlug;
    }
  }

  if (options.isSuperAdmin && isKnownOrganizationSlug(options.superAdminActingSlug)) {
    return options.superAdminActingSlug;
  }

  return null;
}


/**
 * Sync slug voor eerste paint / theme-bootstrap (geen DB-fetch).
 * Volgorde: override → hostname → bekende ?org= hint → default.
 */
export function resolveBootOrganizationSlug(options?: {
  hostname?: string;
  isSuperAdmin?: boolean;
  superAdminActingSlug?: string | null;
}): string {
  const hostname = options?.hostname ?? getCurrentHostname();
  const override = getActiveOrgSlugOverride({
    isSuperAdmin: options?.isSuperAdmin ?? false,
    superAdminActingSlug: options?.superAdminActingSlug ?? null,
  });
  if (override) {
    return override;
  }

  const hostSlug = resolveHostnameToSlug(hostname);
  if (hostSlug) {
    return hostSlug;
  }

  // Vóór auth (SuperAdmin nog onbekend): ?org=kuurne toch als theme-hint.
  const querySlug = getOrgSlugQueryParam();
  if (isKnownOrganizationSlug(querySlug)) {
    return querySlug;
  }

  return DEFAULT_ORGANIZATION_SLUG;
}


export function getCurrentHostname(): string {
  return window.location.hostname;
}

/** Bekende tenants voor localhost dev-switcher (?org=slug). */
export const DEV_ORGANIZATION_SLUGS = ['harelbeke', 'kuurne'] as const;

export type DevOrganizationSlug = (typeof DEV_ORGANIZATION_SLUGS)[number];

export const DEV_ORGANIZATION_LABELS: Record<DevOrganizationSlug, string> = {
  harelbeke: 'Harelbeke',
  kuurne: 'Kuurne',
};

/** Dev-switcher via ?org= — alleen tijdens `npm run dev`. */
export function isDevOrgSwitcherEnabled(): boolean {
  return import.meta.env.DEV;
}

/** Zet ?org=slug op bestaande query string (andere params blijven behouden). */
export function applyDevOrgSlugToSearch(search: string, slug: string): string {
  const params = new URLSearchParams(search);
  params.set(ORGANIZATION_URL_PARAM, slug);
  return params.toString();
}

/** Voeg ?org=slug toe aan pad (bestaande query params op path blijven behouden). */
export function withOrganizationSearchParam(path: string, slug: string): string {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set(ORGANIZATION_URL_PARAM, slug);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Bepaalt of interne links ?org= moeten meenemen.
 * - localhost: altijd (hostname onderscheidt geen tenant)
 * - hostname ≠ actieve org: override via ?org= (dev / SuperAdmin)
 * - URL heeft al ?org= voor actieve tenant
 */
export function shouldCarryOrgSearchParam(
  hostname: string,
  organizationSlug: string,
): boolean {
  if (isLocalDevHostname(hostname)) {
    return true;
  }

  const hostSlug = resolveHostnameToSlug(hostname);
  if (hostSlug != null && hostSlug !== organizationSlug) {
    return true;
  }

  const querySlug = getOrgSlugQueryParam();
  return querySlug != null && querySlug === organizationSlug;
}

/** Bouwt navigatiepad met ?org= indien nodig. */
export function buildTenantNavigationPath(
  path: string,
  organizationSlug: string,
  hostname: string = getCurrentHostname(),
): string {
  if (!shouldCarryOrgSearchParam(hostname, organizationSlug)) {
    return path;
  }
  return withOrganizationSearchParam(path, organizationSlug);
}

/**
 * Home na auth-flow (wachtwoord instellen/resetten): publieke startpagina van de tenant.
 * Op gedeeld domein → /algemeen?org=kuurne; op eigen hostname → /algemeen.
 */
export function resolvePostAuthTenantHomePath(
  organizationSlug: string,
  homePath = '/algemeen',
  hostname: string = getCurrentHostname(),
): string {
  return buildTenantNavigationPath(homePath, organizationSlug, hostname);
}

/**
 * Externe tenant-site wanneer de gebruiker op een ander hostname zit
 * dan de publieke site van die organisatie (bv. reset-link op Harelbeke-domein
 * voor een Kuurne-account → doorsturen naar kuurne-site).
 * Geen externe redirect op localhost / Lovable-preview.
 */
export function resolvePostAuthTenantExternalUrl(
  organizationSlug: string,
  siteUrl: string,
  homePath = '/algemeen',
  hostname: string = getCurrentHostname(),
): string | null {
  if (isLocalDevHostname(hostname) || isLovablePreviewHostname(hostname)) {
    return null;
  }

  const currentHost = hostname.replace(/^www\./, '').toLowerCase();
  const currentSlug = resolveHostnameToSlug(hostname);

  if (currentSlug === organizationSlug) {
    return null;
  }

  try {
    const site = new URL(siteUrl);
    const siteHost = site.hostname.replace(/^www\./, '').toLowerCase();
    const siteSlug = HOSTNAME_TO_SLUG[siteHost];

    if (siteSlug !== organizationSlug || siteHost === currentHost) {
      return null;
    }

    const path = homePath.startsWith('/') ? homePath : `/${homePath}`;
    return `${site.origin}${path}`;
  } catch {
    return null;
  }
}

export function navigateToTenantHomeAfterAuth(options: {
  organizationSlug: string;
  homePath?: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  hostname?: string;
  /** Publieke site-URL van de tenant (branding.siteUrl) — voor hard redirect naar juiste host */
  siteUrl?: string;
}): void {
  const homePath = options.homePath ?? '/algemeen';
  const hostname = options.hostname ?? getCurrentHostname();

  if (options.siteUrl) {
    const external = resolvePostAuthTenantExternalUrl(
      options.organizationSlug,
      options.siteUrl,
      homePath,
      hostname,
    );
    if (external) {
      window.location.replace(external);
      return;
    }
  }

  options.navigate(
    resolvePostAuthTenantHomePath(options.organizationSlug, homePath, hostname),
    { replace: true },
  );
}
