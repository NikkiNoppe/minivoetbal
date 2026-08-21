import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import {
  getOrgSlugQueryParam,
  resolveHostnameToSlug,
} from '@/config/organizationHosts';
import { isKnownOrganizationSlug } from '@/config/organization';

const MAX_ORG_LOAD_MS = 5000;

/**
 * Blokkeert de app bij onbekende hostname (geen stille Harelbeke-fallback).
 */
export const OrganizationGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const {
    isOrganizationLoading,
    isUnknownHostname,
    organizationError,
    hostname,
    organizationSlug,
    refetchOrganization,
  } = useOrganization();
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    if (!isOrganizationLoading) {
      setLoadTimedOut(false);
      return;
    }

    setLoadTimedOut(false);
    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, MAX_ORG_LOAD_MS);

    return () => window.clearTimeout(timer);
  }, [isOrganizationLoading, location.pathname, location.search, organizationSlug]);

  const hostnameMapped =
    resolveHostnameToSlug(hostname) != null ||
    isKnownOrganizationSlug(getOrgSlugQueryParam());

  // Bekende tenant: toon de app met boot-branding i.p.v. Harelbeke-wachtspinner.
  if (isOrganizationLoading && !hostnameMapped) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-brand-100 p-6 text-center"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-brand-dark" aria-hidden />
        <p className="text-sm text-muted-foreground">Organisatie laden…</p>
        <span className="sr-only">Laden…</span>
        {loadTimedOut && (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">
              Het laden duurt langer dan verwacht.
            </p>
            <button
              type="button"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white min-h-[44px]"
              onClick={() => {
                setLoadTimedOut(false);
                refetchOrganization();
              }}
            >
              Opnieuw proberen
            </button>
          </>
        )}
      </div>
    );
  }

  if (isUnknownHostname || organizationError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-100 p-6 text-center">
        <h1 className="text-xl font-semibold text-brand-dark">
          Site niet gevonden
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {isUnknownHostname
            ? `Er is geen organisatie gekoppeld aan "${hostname}".`
            : organizationError?.message ?? 'Organisatie kon niet geladen worden.'}
        </p>
        <button
          type="button"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white min-h-[44px]"
          onClick={() => refetchOrganization()}
        >
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
