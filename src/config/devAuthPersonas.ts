import type { DevOrganizationSlug } from '@/config/organizationHosts';

/** Dev-only: snelle login via TenantDebugPanel (nooit in productie-build). */
export type DevPersonaId =
  | 'guest'
  | 'referee'
  | 'player_manager'
  | 'admin'
  | 'superadmin';

export type DevLoginPersonaId = Exclude<DevPersonaId, 'guest' | 'superadmin'>;

export interface DevPersonaCredentials {
  username: string;
  password: string;
}

export const DEV_PERSONA_ORDER: DevPersonaId[] = [
  'guest',
  'referee',
  'player_manager',
  'admin',
  'superadmin',
];

export const DEV_PERSONA_LABELS: Record<DevPersonaId, string> = {
  guest: 'Publiek',
  referee: 'Scheids',
  player_manager: 'Team',
  admin: 'Admin',
  superadmin: 'SuperAdmin',
};

/**
 * Lokale dev-accounts per tenant.
 * Alleen gebruikt wanneer import.meta.env.DEV — niet tonen in productie-UI.
 */
export const DEV_PERSONA_CREDENTIALS: Record<
  DevOrganizationSlug,
  Partial<Record<DevLoginPersonaId, DevPersonaCredentials>>
> = {
  harelbeke: {
    admin: { username: 'admin', password: 'admin123' },
    referee: { username: 'KennethMaes', password: 'f4D8r2Ns' },
    player_manager: { username: 'TruukCity', password: 'a9K2t7cB' },
  },
  kuurne: {
    admin: { username: 'test.admin', password: 'admin1987' },
    referee: { username: 'test.scheidsrechter', password: 'scheidsrechter123' },
    player_manager: { username: 'test.teamverantwoordelijke', password: 'admin1987' },
  },
};

export const DEV_SUPERADMIN = {
  username: 'superadmin',
  password: 'admin1987',
} as const;

export function resolveDevPersonaCredentials(
  orgSlug: string,
  persona: DevLoginPersonaId,
): DevPersonaCredentials | null {
  if (orgSlug !== 'harelbeke' && orgSlug !== 'kuurne') {
    return null;
  }
  const creds = DEV_PERSONA_CREDENTIALS[orgSlug as DevOrganizationSlug][persona];
  if (!creds?.username?.trim() || !creds?.password) {
    return null;
  }
  return creds;
}
