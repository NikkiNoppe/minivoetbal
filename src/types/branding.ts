import type { ThemeColors } from '@/lib/colorUtils';

export interface OrganizationBrandingMeta {
  defaultTitle?: string;
  defaultDescription?: string;
}

export interface OrganizationExternalLink {
  label: string;
  url: string;
}

/** Transactionele e-mail per tenant (branding_settings.email). */
export interface OrganizationEmailSettings {
  fromEmail: string;
  replyToEmail: string;
}

export const DEFAULT_HARELBEKE_INFO_EMAIL = 'info@harelbekeminivoetbal.be';

/** Weergavevariant van het headerlogo. */
export type OrganizationLogoLayout = 'stacked' | 'horizontal';

export interface OrganizationBranding {
  displayName: string;
  shortName: string;
  siteUrl: string;
  hostnames?: string[];
  logoPath: string;
  /** Variant met de tekst naast het logo (optioneel). */
  logoHorizontalPath?: string;
  /** Witte variant voor donkere achtergronden (header). */
  logoWhitePath?: string;
  /** Witte horizontale variant voor donkere achtergronden. */
  logoHorizontalWhitePath?: string;
  logoLayout?: OrganizationLogoLayout;
  logoIconPath: string;
  /** Wit icoon voor donkere achtergronden. */
  logoIconWhitePath?: string;
  faviconPath: string;
  themeColors?: ThemeColors;
  meta?: OrganizationBrandingMeta;
  links?: OrganizationExternalLink[];
  email?: OrganizationEmailSettings;
}

/**
 * Kiest het te tonen headerlogo op basis van de gekozen variant.
 * Op donkere achtergronden wordt de witte variant gebruikt indien beschikbaar.
 */
export function resolveHeaderLogoPath(
  branding: OrganizationBranding,
  options: { onDark?: boolean } = {},
): string {
  const horizontal = branding.logoLayout === 'horizontal' && branding.logoHorizontalPath;

  if (options.onDark) {
    if (horizontal && branding.logoHorizontalWhitePath) {
      return branding.logoHorizontalWhitePath;
    }
    if (!horizontal && branding.logoWhitePath) {
      return branding.logoWhitePath;
    }
  }

  return horizontal ? (branding.logoHorizontalPath as string) : branding.logoPath;
}

/** Fallback-icoon, wit op donkere achtergrond indien aanwezig. */
export function resolveLogoIconPath(
  branding: OrganizationBranding,
  options: { onDark?: boolean } = {},
): string {
  if (options.onDark && branding.logoIconWhitePath) return branding.logoIconWhitePath;
  return branding.logoIconPath;
}


export function deriveDefaultInfoEmail(siteUrl: string): string {
  try {
    const hostname = new URL(siteUrl.trim()).hostname.replace(/^www\./, '');
    return hostname ? `info@${hostname}` : DEFAULT_HARELBEKE_INFO_EMAIL;
  } catch {
    return DEFAULT_HARELBEKE_INFO_EMAIL;
  }
}

export function parseOrganizationEmailSettings(
  raw: Record<string, unknown> | undefined,
  options: { siteUrl?: string; organizationSlug?: string } = {},
): OrganizationEmailSettings {
  const siteUrl =
    typeof options.siteUrl === 'string' && options.siteUrl.trim()
      ? options.siteUrl
      : DEFAULT_BRANDING.siteUrl;
  const fallbackFrom =
    options.organizationSlug === 'harelbeke'
      ? DEFAULT_HARELBEKE_INFO_EMAIL
      : deriveDefaultInfoEmail(siteUrl);

  const emailRaw = raw?.email;
  const emailObj =
    emailRaw && typeof emailRaw === 'object' && !Array.isArray(emailRaw)
      ? (emailRaw as Record<string, unknown>)
      : {};

  const fromEmail =
    typeof emailObj.fromEmail === 'string' && emailObj.fromEmail.trim()
      ? emailObj.fromEmail.trim().toLowerCase()
      : fallbackFrom;

  const replyToEmail =
    typeof emailObj.replyToEmail === 'string' && emailObj.replyToEmail.trim()
      ? emailObj.replyToEmail.trim().toLowerCase()
      : fromEmail;

  return { fromEmail, replyToEmail };
}

export const DEFAULT_BRANDING: OrganizationBranding = {
  displayName: 'Harelbeekse Minivoetbal Competitie',
  shortName: 'Minivoetbal',
  siteUrl: 'https://harelbekeminivoetbal.be',
  logoPath: '/images/logos/minivoetbal-text.png',
  logoIconPath: '/images/logos/minivoetbal-icon.png',
  faviconPath: '/favicon.ico',
  meta: {
    defaultTitle: 'Minivoetbal Harelbeke | Competitie, standen & uitslagen',
    defaultDescription:
      'Nieuws en info over de Harelbeekse Minivoetbal Competitie.',
  },
};

export function parseBrandingSettings(
  raw: Record<string, unknown> | undefined,
): OrganizationBranding {
  if (!raw || Object.keys(raw).length === 0) {
    return DEFAULT_BRANDING;
  }

  const meta = raw.meta as OrganizationBrandingMeta | undefined;
  const rawLinks = raw.links;

  let links: OrganizationExternalLink[] | undefined;
  if (Array.isArray(rawLinks)) {
    links = rawLinks
      .filter(
        (item): item is OrganizationExternalLink =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as OrganizationExternalLink).label === 'string' &&
          typeof (item as OrganizationExternalLink).url === 'string',
      )
      .map((item) => ({
        label: item.label.trim(),
        url: item.url.trim(),
      }))
      .filter((item) => item.label && item.url);
  }

  return {
    displayName:
      typeof raw.displayName === 'string'
        ? raw.displayName
        : DEFAULT_BRANDING.displayName,
    shortName:
      typeof raw.shortName === 'string'
        ? raw.shortName
        : DEFAULT_BRANDING.shortName,
    siteUrl:
      typeof raw.siteUrl === 'string' ? raw.siteUrl : DEFAULT_BRANDING.siteUrl,
    hostnames: Array.isArray(raw.hostnames)
      ? (raw.hostnames as string[])
      : DEFAULT_BRANDING.hostnames,
    logoPath:
      typeof raw.logoPath === 'string'
        ? raw.logoPath
        : DEFAULT_BRANDING.logoPath,
    logoHorizontalPath:
      typeof raw.logoHorizontalPath === 'string' ? raw.logoHorizontalPath : undefined,
    logoWhitePath:
      typeof raw.logoWhitePath === 'string' ? raw.logoWhitePath : undefined,
    logoHorizontalWhitePath:
      typeof raw.logoHorizontalWhitePath === 'string'
        ? raw.logoHorizontalWhitePath
        : undefined,
    logoIconWhitePath:
      typeof raw.logoIconWhitePath === 'string' ? raw.logoIconWhitePath : undefined,
    logoLayout: raw.logoLayout === 'horizontal' ? 'horizontal' : 'stacked',
    logoIconPath:
      typeof raw.logoIconPath === 'string'
        ? raw.logoIconPath
        : DEFAULT_BRANDING.logoIconPath,
    faviconPath:
      typeof raw.faviconPath === 'string'
        ? raw.faviconPath
        : DEFAULT_BRANDING.faviconPath,
    themeColors: raw.themeColors as ThemeColors | undefined,
    meta: {
      defaultTitle: meta?.defaultTitle ?? DEFAULT_BRANDING.meta?.defaultTitle,
      defaultDescription:
        meta?.defaultDescription ?? DEFAULT_BRANDING.meta?.defaultDescription,
    },
    links,
    email: parseOrganizationEmailSettings(raw, {
      siteUrl:
        typeof raw.siteUrl === 'string' ? raw.siteUrl : DEFAULT_BRANDING.siteUrl,
    }),
  };
}
