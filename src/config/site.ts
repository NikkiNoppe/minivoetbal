import { PUBLIC_ROUTES } from '@/config/routes';

/** Canonical productiedomein voor SEO (canonical, sitemap, og:url). */
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://harelbekeminivoetbal.be';

/** Utility-routes die niet geïndexeerd mogen worden. */
export const NOINDEX_PATHS = ['/reset-password', '/unsubscribe'] as const;

/** Publieke routes voor sitemap — houd in sync met App.tsx + scripts/generate-seo-static.mjs */
export const PUBLIC_SITEMAP_ROUTES = [
  { path: '/', priority: 1.0, changefreq: 'daily' as const },
  { path: PUBLIC_ROUTES.competitie, priority: 0.9, changefreq: 'daily' as const },
  { path: PUBLIC_ROUTES.beker, priority: 0.8, changefreq: 'weekly' as const },
  { path: PUBLIC_ROUTES.playoff, priority: 0.8, changefreq: 'weekly' as const },
  { path: PUBLIC_ROUTES.reglement, priority: 0.7, changefreq: 'monthly' as const },
  { path: PUBLIC_ROUTES.archief, priority: 0.7, changefreq: 'monthly' as const },
] as const;
