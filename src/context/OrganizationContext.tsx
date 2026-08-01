import React, {
  createContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_ORGANIZATION_SLUG,
} from '@/config/organization';
import {
  getActiveOrgSlugOverride,
  getCurrentHostname,
  resolveBootOrganizationSlug,
} from '@/config/organizationHosts';
import {
  resolveOrganizationFromHostname,
  userBelongsToOrganization,
  UnknownOrganizationHostnameError,
  type Organization,
} from '@/services/organization/resolveOrganization';
import { SuperAdminActingOrgSync } from '@/components/common/SuperAdminActingOrgSync';
import { setResolvedOrganizationId } from '@/lib/organizationScope';
import { applyBootOrganizationTheme } from '@/lib/bootTheme';
import { useSuperAdminActingOrg } from '@/hooks/useSuperAdminActingOrg';

export interface OrganizationContextValue {
  organization: Organization | undefined;
  organizationId: number | undefined;
  organizationSlug: string;
  hostname: string;
  isOrganizationReady: boolean;
  isOrganizationLoading: boolean;
  organizationError: Error | null;
  isUnknownHostname: boolean;
  refetchOrganization: () => void;
}

export const OrganizationContext = createContext<
  OrganizationContextValue | undefined
>(undefined);

export const OrganizationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const hostname = getCurrentHostname();
  const { user, isAuthenticated, isSuperAdmin, authContextReady, logout } =
    useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const mismatchHandled = useRef(false);
  const actingOrg = useSuperAdminActingOrg();
  const superAdminActingSlug = isSuperAdmin ? actingOrg?.slug ?? null : null;
  const orgSlugOverride = useMemo(
    () => getActiveOrgSlugOverride({ isSuperAdmin, superAdminActingSlug }),
    [location.pathname, location.search, isSuperAdmin, superAdminActingSlug],
  );

  const bootOrganizationSlug = useMemo(
    () =>
      resolveBootOrganizationSlug({
        hostname,
        isSuperAdmin,
        superAdminActingSlug,
      }),
    [hostname, location.pathname, location.search, isSuperAdmin, superAdminActingSlug],
  );

  // Theme vóór org-fetch klaar is (voorkomt Harelbeke-blauw flash op Kuurne).
  useEffect(() => {
    applyBootOrganizationTheme({
      hostname,
      isSuperAdmin,
      slug: bootOrganizationSlug,
    });
  }, [bootOrganizationSlug, hostname, isSuperAdmin]);


  const {
    data: organization,
    isPending,
    isFetching,
    isFetched,
    error,
    refetch,
  } = useQuery({
    queryKey: ['organization', hostname, orgSlugOverride],
    queryFn: () =>
      resolveOrganizationFromHostname({ hostname, orgSlugOverride }),
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    retry: (failureCount, err) => {
      if (err instanceof UnknownOrganizationHostnameError) {
        return false;
      }
      return failureCount < 2;
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    enabled: authContextReady,
  });

  const organizationError =
    error instanceof Error ? error : error ? new Error(String(error)) : null;
  const isUnknownHostname =
    organizationError instanceof UnknownOrganizationHostnameError;
  const isOrganizationReady = authContextReady && isFetched && !!organization;

  useEffect(() => {
    if (!authContextReady) return;
    void refetch();
  }, [orgSlugOverride, authContextReady, refetch]);

  useEffect(() => {
    mismatchHandled.current = false;
  }, [hostname, user?.id]);

  useEffect(() => {
    if (!isOrganizationReady || !organization || !isAuthenticated || !user) {
      return;
    }
    if (mismatchHandled.current) {
      return;
    }
    if (
      userBelongsToOrganization(
        user.organizationId,
        organization.id,
        isSuperAdmin,
      )
    ) {
      return;
    }

    mismatchHandled.current = true;
    toast({
      title: 'Verkeerde organisatie',
      description:
        'Je account hoort niet bij deze site. Je bent uitgelogd.',
      variant: 'destructive',
    });
    void logout();
  }, [
    isOrganizationReady,
    organization,
    isAuthenticated,
    user,
    isSuperAdmin,
    logout,
    toast,
  ]);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organization,
      organizationId: organization?.id,
      organizationSlug: organization?.slug ?? bootOrganizationSlug,
      hostname,
      isOrganizationReady,
      isOrganizationLoading:
        !authContextReady || (isPending && !organization),
      organizationError,
      isUnknownHostname,
      refetchOrganization: () => {
        void refetch();
      },
    }),
    [
      organization,
      bootOrganizationSlug,
      hostname,
      isOrganizationReady,
      authContextReady,
      isPending,
      isFetching,
      organizationError,
      isUnknownHostname,
      refetch,
    ],
  );

  useEffect(() => {
    setResolvedOrganizationId(isOrganizationReady ? organization?.id : null);
  }, [isOrganizationReady, organization?.id]);

  return (
    <OrganizationContext.Provider value={value}>
      <SuperAdminActingOrgSync />
      {children}
    </OrganizationContext.Provider>
  );
};

export const defaultOrganizationContext: OrganizationContextValue = {
  organization: undefined,
  organizationId: undefined,
  organizationSlug:
    typeof window !== 'undefined'
      ? resolveBootOrganizationSlug()
      : DEFAULT_ORGANIZATION_SLUG,
  hostname: '',
  isOrganizationReady: false,
  isOrganizationLoading: true,
  organizationError: null,
  isUnknownHostname: false,
  refetchOrganization: () => undefined,
};
