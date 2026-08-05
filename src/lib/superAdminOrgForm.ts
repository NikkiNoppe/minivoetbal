import type { Organization } from '@/services/organization/organizationService';
import {
  resolveOrganizationPublicContent,
  type FooterContactPerson,
} from '@/config/organizationContent';
import {
  deriveDefaultInfoEmail,
  parseBrandingSettings,
  parseOrganizationEmailSettings,
  type OrganizationExternalLink,
} from '@/types/branding';

export interface SuperAdminOrgFormState {
  organizationId: number;
  slug: string;
  displayName: string;
  shortName: string;
  siteUrl: string;
  hostnamesText: string;
  logoPath: string;
  logoHorizontalPath: string;
  logoLayout: 'stacked' | 'horizontal';
  logoIconPath: string;
  faviconPath: string;
  metaTitle: string;
  metaDescription: string;
  algemeenTitle: string;
  algemeenSubtitle: string;
  algemeenAbout: string;
  footerTagline: string;
  footerContacts: FooterContactPerson[];
  externalLinks: OrganizationExternalLink[];
  emailFrom: string;
  emailReplyTo: string;
}

export function organizationToFormState(org: Organization): SuperAdminOrgFormState {
  const branding = parseBrandingSettings(org.brandingSettings);
  const content = resolveOrganizationPublicContent(org.slug, org.brandingSettings);
  const email = parseOrganizationEmailSettings(org.brandingSettings, {
    siteUrl: branding.siteUrl,
    organizationSlug: org.slug,
  });

  return {
    organizationId: org.id,
    slug: org.slug,
    displayName: branding.displayName || org.name,
    shortName: branding.shortName,
    siteUrl: branding.siteUrl,
    hostnamesText: (branding.hostnames ?? []).join('\n'),
    logoPath: branding.logoPath,
    logoIconPath: branding.logoIconPath,
    faviconPath: branding.faviconPath,
    metaTitle: branding.meta?.defaultTitle ?? '',
    metaDescription: branding.meta?.defaultDescription ?? '',
    algemeenTitle: content.algemeen.title,
    algemeenSubtitle: content.algemeen.subtitle,
    algemeenAbout: content.algemeen.aboutParagraph,
    footerTagline: content.footerTagline,
    footerContacts: content.footerContacts.map((contact) => ({ ...contact })),
    externalLinks: branding.links?.length ? [...branding.links] : [],
    emailFrom: email.fromEmail,
    emailReplyTo: email.replyToEmail,
  };
}

export function formStateToBrandingSettings(
  form: SuperAdminOrgFormState,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const hostnames = form.hostnamesText
    .split(/[\n,]+/)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const links = form.externalLinks
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }))
    .filter((link) => link.label && link.url);

  const existingBranding = parseBrandingSettings(existing);
  const siteUrl = form.siteUrl.trim() || existingBranding.siteUrl;
  const fallbackFrom = deriveDefaultInfoEmail(siteUrl);
  const fromEmail = (form.emailFrom.trim() || fallbackFrom).toLowerCase();
  const replyToEmail = (form.emailReplyTo.trim() || fromEmail).toLowerCase();

  return {
    ...existing,
    displayName: form.displayName.trim(),
    shortName: form.shortName.trim(),
    siteUrl: form.siteUrl.trim(),
    hostnames,
    logoPath: form.logoPath.trim(),
    logoIconPath: form.logoIconPath.trim(),
    faviconPath: form.faviconPath.trim(),
    meta: {
      defaultTitle: form.metaTitle.trim(),
      defaultDescription: form.metaDescription.trim(),
    },
    content: {
      algemeen: {
        title: form.algemeenTitle.trim(),
        subtitle: form.algemeenSubtitle.trim(),
        aboutParagraph: form.algemeenAbout.trim(),
      },
      footerTagline: form.footerTagline.trim(),
      footerContacts: form.footerContacts
        .map((contact) => ({
          name: contact.name.trim(),
          phone: contact.phone?.trim() ?? '',
          email: contact.email?.trim() ?? '',
        }))
        .filter((contact) => contact.name),
    },
    links,
    themeColors: existingBranding.themeColors ?? existing.themeColors,
    email: {
      fromEmail,
      replyToEmail,
    },
  };
}

export function createEmptyOrgFormState(nextId: number): SuperAdminOrgFormState {
  return {
    organizationId: nextId,
    slug: '',
    displayName: '',
    shortName: 'Minivoetbal',
    siteUrl: '',
    hostnamesText: '',
    logoPath: '/images/logos/minivoetbal-text.png',
    logoIconPath: '/images/logos/minivoetbal-icon.png',
    faviconPath: '/favicon.ico',
    metaTitle: '',
    metaDescription: '',
    algemeenTitle: '',
    algemeenSubtitle: '',
    algemeenAbout: '',
    footerTagline: '',
    footerContacts: [],
    externalLinks: [],
    emailFrom: '',
    emailReplyTo: '',
  };
}
