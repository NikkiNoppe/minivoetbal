import { withOrganizationSearchParam } from '@/config/organizationHosts';

/** Bekende tenants voor SuperAdmin-portal (id ↔ slug). */
export const SUPER_ADMIN_TENANTS = [
  {
    id: 1,
    slug: 'harelbeke',
    name: 'Harelbeke Minivoetbal',
    description: 'Organisatie id=1 — harelbekeminivoetbal.be',
  },
  {
    id: 2,
    slug: 'kuurne',
    name: 'Kuurne Minivoetbal',
    description: 'Organisatie id=2 — www.mvvkuurne.be',
  },
] as const;

export type SuperAdminTenantSlug = (typeof SUPER_ADMIN_TENANTS)[number]['slug'];

export const SUPER_ADMIN_TENANT_SLUGS = SUPER_ADMIN_TENANTS.map((t) => t.slug);

export function isSuperAdminTenantSlug(
  slug: string | undefined,
): slug is SuperAdminTenantSlug {
  return SUPER_ADMIN_TENANT_SLUGS.includes(slug as SuperAdminTenantSlug);
}

export function getSuperAdminTenantBySlug(slug: string) {
  return SUPER_ADMIN_TENANTS.find((t) => t.slug === slug);
}

export function getSuperAdminTenantById(id: number) {
  return SUPER_ADMIN_TENANTS.find((t) => t.id === id);
}

/** Voeg ?org=slug toe aan pad (voor SuperAdmin tenant-switch op elke host). */
export function withOrgSearchParam(path: string, slug: string): string {
  return withOrganizationSearchParam(path, slug);
}
