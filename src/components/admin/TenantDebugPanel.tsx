import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { DEFAULT_ORGANIZATION_SLUG } from '@/config/organization';
import {
  applyDevOrgSlugToSearch,
  DEV_ORGANIZATION_LABELS,
  DEV_ORGANIZATION_SLUGS,
  getOrgSlugQueryParam,
  isDevOrgSwitcherEnabled,
  type DevOrganizationSlug,
} from '@/config/organizationHosts';
import { DevRoleSwitchButtons } from '@/components/admin/DevRoleSwitchButtons';
import { DevViewportSwitchButtons } from '@/components/admin/DevViewportSwitchButtons';
import { devMiniButtonClass } from '@/components/admin/devToolbarStyles';
import { isDevViewportPreviewFrame } from '@/context/DevViewportContext';

export function isTenantDebugPanelEnabled(): boolean {
  return (
    (import.meta.env.VITE_SHOW_TENANT_DEBUG === 'true' || import.meta.env.DEV) &&
    isDevOrgSwitcherEnabled()
  );
}

const ORG_INITIALS: Record<DevOrganizationSlug, string> = {
  harelbeke: 'H',
  kuurne: 'K',
};

function DevOrgSwitchButtons({
  activeSlug,
  onSwitch,
}: {
  activeSlug: string;
  onSwitch: (slug: DevOrganizationSlug) => void;
}) {
  return (
    <div
      className="flex flex-nowrap items-center gap-1.5"
      role="group"
      aria-label="Wissel organisatie (dev)"
    >
      {DEV_ORGANIZATION_SLUGS.map((slug) => {
        const isActive = activeSlug === slug;
        const label = DEV_ORGANIZATION_LABELS[slug];
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onSwitch(slug)}
            aria-pressed={isActive}
            aria-current={isActive ? 'true' : undefined}
            aria-label={label}
            title={label}
            className={devMiniButtonClass(isActive)}
          >
            <span className="text-xs font-bold" aria-hidden>
              {ORG_INITIALS[slug]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dev-only panel: org + rol + viewport, altijd als compacte icon-balk.
 */
export const TenantDebugPanel: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationSlug } = useOrganization();

  const panelEnabled = isTenantDebugPanelEnabled() && !isDevViewportPreviewFrame();
  const effectiveOrgSlug =
    organizationSlug ||
    getOrgSlugQueryParam() ||
    DEFAULT_ORGANIZATION_SLUG;

  useEffect(() => {
    if (!panelEnabled) return;
    document.body.classList.add('has-tenant-debug-panel');
    return () => {
      document.body.classList.remove('has-tenant-debug-panel');
      document.body.classList.remove('has-tenant-debug-panel-collapsed');
    };
  }, [panelEnabled]);

  const switchOrg = (slug: DevOrganizationSlug) => {
    navigate({
      pathname: location.pathname,
      search: applyDevOrgSlugToSearch(location.search, slug),
    });
  };

  if (!panelEnabled) {
    return null;
  }

  const panel = (
    <aside
      className="fixed bottom-0 left-0 right-0 z-[1200] border-t border-amber-300 bg-amber-50/95 px-3 py-1 text-xs text-amber-950 shadow-lg safe-area-bottom backdrop-blur-sm pointer-events-auto"
      aria-label="Tenant debug"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-3 items-center gap-2 overflow-x-auto">
        <div className="justify-self-start">
          <DevOrgSwitchButtons activeSlug={effectiveOrgSlug} onSwitch={switchOrg} />
        </div>
        <div className="justify-self-center">
          <DevRoleSwitchButtons organizationSlug={effectiveOrgSlug} />
        </div>
        <div className="justify-self-end">
          <DevViewportSwitchButtons />
        </div>
      </div>
    </aside>
  );

  if (typeof document !== 'undefined') {
    return createPortal(panel, document.body);
  }

  return panel;
};

export default TenantDebugPanel;
