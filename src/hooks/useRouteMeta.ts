import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getRouteMeta, PUBLIC_ROUTES } from "@/config/routes";
import { NOINDEX_PATHS } from "@/config/site";
import { useBranding } from "@/hooks/useBranding";
import { resolveOrganizationPublicContent } from "@/config/organizationContent";
import { useOrganization } from "@/hooks/useOrganization";
import { applyTenantPwaHead } from "@/lib/pwaHead";

const DEFAULT_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex, nofollow";

const UTILITY_PAGE_TITLES: Record<string, string> = {
  "/reset-password": "Wachtwoord resetten",
  "/unsubscribe": "Afmelden voor e-mails",
};

function upsertMeta(selector: string, create: () => HTMLElement, update: (el: HTMLElement) => void) {
  let el = document.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  update(el);
}

function upsertMetaName(name: string, content: string) {
  upsertMeta(
    `meta[name="${name}"]`,
    () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", name);
      return meta;
    },
    (el) => {
      (el as HTMLMetaElement).content = content;
    },
  );
}

function upsertMetaProperty(property: string, content: string) {
  upsertMeta(
    `meta[property="${property}"]`,
    () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", property);
      return meta;
    },
    (el) => {
      (el as HTMLMetaElement).content = content;
    },
  );
}

function buildDocumentTitle(
  pathname: string,
  metaTitle: string,
  brandingDisplayName: string,
  defaultTitle: string,
): string {
  if (pathname === PUBLIC_ROUTES.algemeen || pathname === "/") {
    return defaultTitle;
  }
  return `${metaTitle} | ${brandingDisplayName}`;
}

function upsertCanonical(href: string) {
  upsertMeta(
    'link[rel="canonical"]',
    () => {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      return link;
    },
    (el) => {
      (el as HTMLLinkElement).href = href;
    },
  );
}

function upsertFavicon(href: string) {
  upsertMeta(
    'link[rel="icon"]',
    () => {
      const link = document.createElement("link");
      link.setAttribute("rel", "icon");
      return link;
    },
    (el) => {
      (el as HTMLLinkElement).href = href;
    },
  );
}

/**
 * Hook to update document title, meta tags and canonical URL based on current route.
 */
export const useRouteMeta = () => {
  const location = useLocation();
  const branding = useBranding();
  const { organization, organizationSlug } = useOrganization();
  const publicContent = resolveOrganizationPublicContent(
    organizationSlug,
    organization?.brandingSettings,
  );
  const meta = getRouteMeta(location.pathname);
  const isNoIndex = NOINDEX_PATHS.includes(location.pathname as (typeof NOINDEX_PATHS)[number]);
  const siteSuffix = branding.displayName;
  const defaultTitle =
    branding.meta?.defaultTitle ??
    `${publicContent.algemeen.title} | ${branding.displayName}`;
  const siteBaseUrl = branding.siteUrl.replace(/\/$/, "");
  const canonicalUrl = `${siteBaseUrl}${location.pathname}`;

  useEffect(() => {
    applyTenantPwaHead(organizationSlug);
    upsertFavicon(branding.faviconPath);

    if (isNoIndex) {
      const utilityTitle = UTILITY_PAGE_TITLES[location.pathname];
      document.title = utilityTitle
        ? `${utilityTitle} - ${siteSuffix}`
        : siteSuffix;
      upsertMetaName("robots", NOINDEX_ROBOTS);
      upsertCanonical(canonicalUrl);
      return;
    }

    upsertMetaName("robots", DEFAULT_ROBOTS);

    if (meta) {
      const routeDescription =
        location.pathname === PUBLIC_ROUTES.algemeen
          ? branding.meta?.defaultDescription ?? publicContent.algemeen.subtitle
          : location.pathname === PUBLIC_ROUTES.reglement
            ? publicContent.reglement.metaDescription
            : meta.description;
      const routeTitle =
        location.pathname === PUBLIC_ROUTES.algemeen
          ? publicContent.algemeen.title
          : meta.title;

      const pageTitle = buildDocumentTitle(
        location.pathname,
        routeTitle,
        siteSuffix,
        defaultTitle,
      );
      document.title = pageTitle;

      upsertMetaName("description", routeDescription);
      upsertMetaProperty("og:title", pageTitle);
      upsertMetaProperty("og:description", routeDescription);
      upsertMetaProperty("og:url", canonicalUrl);
      upsertMetaName("twitter:title", pageTitle);
      upsertMetaName("twitter:description", routeDescription);
      upsertMetaName("twitter:url", canonicalUrl);
    } else {
      document.title = defaultTitle;
    }

    upsertCanonical(canonicalUrl);
  }, [
    meta,
    location.pathname,
    canonicalUrl,
    isNoIndex,
    branding.faviconPath,
    branding.displayName,
    branding.meta?.defaultTitle,
    branding.siteUrl,
    defaultTitle,
    siteSuffix,
    organizationSlug,
    organization?.brandingSettings,
    publicContent.algemeen.subtitle,
    publicContent.algemeen.title,
    publicContent.reglement.metaDescription,
  ]);
};
