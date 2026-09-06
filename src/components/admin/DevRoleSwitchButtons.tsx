import React, { useMemo, useState } from 'react';
import { Globe, Flag, Users, Shield, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { isLoginError } from '@/lib/loginErrors';
import { cn } from '@/lib/utils';
import { isTenantDebugPanelEnabled } from '@/components/admin/TenantDebugPanel';
import { useDevDebugContext } from '@/context/DevDebugContext';
import { devMiniButtonClass } from '@/components/admin/devToolbarStyles';
import {
  DEV_PERSONA_LABELS,
  DEV_PERSONA_ORDER,
  DEV_SUPERADMIN,
  resolveDevPersonaCredentials,
  type DevLoginPersonaId,
  type DevPersonaId,
} from '@/config/devAuthPersonas';

function getActivePersona(
  isAuthenticated: boolean,
  isSuperAdmin: boolean,
  role?: string,
): DevPersonaId {
  if (!isAuthenticated) return 'guest';
  if (isSuperAdmin) return 'superadmin';
  if (role === 'referee') return 'referee';
  if (role === 'player_manager') return 'player_manager';
  if (role === 'admin') return 'admin';
  return 'guest';
}

function isLoginPersona(persona: DevPersonaId): persona is DevLoginPersonaId {
  return persona !== 'guest' && persona !== 'superadmin';
}

const PERSONA_ICONS: Record<DevPersonaId, typeof Globe> = {
  guest: Globe,
  referee: Flag,
  player_manager: Users,
  admin: Shield,
  superadmin: ShieldCheck,
};

interface DevRoleSwitchButtonsProps {
  organizationSlug: string;
  className?: string;
}

export const DevRoleSwitchButtons: React.FC<DevRoleSwitchButtonsProps> = ({
  organizationSlug,
  className,
}) => {
  const { user, isAuthenticated, isSuperAdmin, login, logout } = useAuth();
  const { toast } = useToast();
  const [switching, setSwitching] = useState<DevPersonaId | null>(null);

  const activePersona = useMemo(
    () => getActivePersona(isAuthenticated, isSuperAdmin, user?.role),
    [isAuthenticated, isSuperAdmin, user?.role],
  );

  const isPersonaDisabled = (persona: DevPersonaId): boolean => {
    if (persona === 'guest' || persona === 'superadmin') return false;
    return resolveDevPersonaCredentials(organizationSlug, persona) === null;
  };

  const getDisabledTitle = (persona: DevPersonaId): string | undefined => {
    if (persona === 'guest' || persona === 'superadmin') return undefined;
    if (resolveDevPersonaCredentials(organizationSlug, persona)) return undefined;
    return `Geen ${DEV_PERSONA_LABELS[persona].toLowerCase()}-account in ${organizationSlug}`;
  };

  const handleSwitch = async (persona: DevPersonaId) => {
    if (persona === activePersona || switching) return;
    if (isPersonaDisabled(persona)) return;

    setSwitching(persona);
    try {
      if (persona === 'guest') {
        await logout();
        return;
      }

      if (persona === 'superadmin') {
        await login(DEV_SUPERADMIN.username, DEV_SUPERADMIN.password);
        return;
      }

      if (!isLoginPersona(persona)) return;

      const creds = resolveDevPersonaCredentials(organizationSlug, persona);
      if (!creds) {
        toast({
          title: 'Dev-login niet geconfigureerd',
          description: `Geen credentials voor ${DEV_PERSONA_LABELS[persona]} in ${organizationSlug}.`,
          variant: 'destructive',
        });
        return;
      }

      await login(creds.username, creds.password);
    } catch (error) {
      const description = isLoginError(error)
        ? error.message
        : 'Kon niet wisselen van rol.';
      toast({
        title: 'Dev-login mislukt',
        description,
        variant: 'destructive',
      });
      console.error('Dev role switch:', description, error);
    } finally {
      setSwitching(null);
    }
  };

  const devDebug = useDevDebugContext();
  const hideGuestPersona =
    isTenantDebugPanelEnabled() && (devDebug?.matchFormModalCount ?? 0) > 0;
  const visiblePersonas = hideGuestPersona
    ? DEV_PERSONA_ORDER.filter((persona) => persona !== 'guest')
    : DEV_PERSONA_ORDER;

  return (
    <div
      className={cn('flex flex-nowrap items-center gap-1.5', className)}
      role="group"
      aria-label="Wissel gebruikersrol (dev)"
    >
      {visiblePersonas.map((persona) => {
        const isActive = activePersona === persona;
        const disabled = isPersonaDisabled(persona) || switching !== null;
        const label = DEV_PERSONA_LABELS[persona];
        const title = getDisabledTitle(persona) ?? label;
        const Icon = PERSONA_ICONS[persona];

        return (
          <button
            key={persona}
            type="button"
            disabled={disabled && !isActive}
            title={title}
            onClick={() => void handleSwitch(persona)}
            aria-pressed={isActive}
            aria-label={label}
            aria-busy={switching === persona}
            className={devMiniButtonClass(isActive)}
          >
            {switching === persona ? (
              <span className="text-xs" aria-hidden>
                …
              </span>
            ) : (
              <Icon className="h-4 w-4" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
};
