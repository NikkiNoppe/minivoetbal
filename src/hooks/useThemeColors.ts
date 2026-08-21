import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ThemeColors,
  DEFAULT_THEME,
  applyThemeToCSS,
  normalizeTheme,
  resolveOrganizationTheme,
} from "@/lib/colorUtils";
import { applyThemeToDocument } from "@/lib/themeDocument";
import {
  insertApplicationSettingForSession,
  listApplicationSettingsForSession,
  updateApplicationSettingForSession,
} from "@/services/core/applicationSettingsSessionFetch";
import {
  fetchPublicApplicationSettings,
  findPublicSetting,
} from "@/services/public/publicApplicationSettingsFetch";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useOrgQueryScope, useOrganization } from "@/hooks/useOrganization";
import { useSuperAdminActingOrg } from "@/hooks/useSuperAdminActingOrg";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { parseBrandingSettings } from "@/types/branding";

const QUERY_KEY_BASE = ["theme-colors"] as const;

/** Query key voor sitethema (hostname-org) — o.a. restore na kleuren-editor. */
export function getSiteThemeColorsQueryKey(
  organizationSlug: string,
  organizationId: number | undefined,
) {
  return withOrgQueryKey([...QUERY_KEY_BASE, organizationSlug], organizationId);
}

async function fetchThemeColorsFromSession(
  organizationSlug: string,
  brandingTheme?: ThemeColors,
): Promise<ThemeColors> {
  let dbTheme: ThemeColors | undefined;

  try {
    const rows = await listApplicationSettingsForSession("theme_colors");
    const row = rows.find((r) => r.setting_name === "global_theme");
    if (row?.setting_value) {
      dbTheme = row.setting_value as unknown as ThemeColors;
    }
  } catch (error) {
    console.warn("[fetchThemeColorsFromSession] session-RPC mislukt:", error);
  }

  return resolveOrganizationTheme(organizationSlug, {
    brandingTheme,
    dbTheme,
  });
}

async function fetchThemeColors(
  organizationId: number,
  organizationSlug: string,
  brandingTheme?: ThemeColors,
): Promise<ThemeColors> {
  let dbTheme: ThemeColors | undefined;

  try {
    const rows = await fetchPublicApplicationSettings(
      ["theme_colors"],
      organizationId,
    );
    const row = findPublicSetting(rows, "theme_colors", "global_theme");
    if (row?.setting_value) {
      dbTheme = row.setting_value as unknown as ThemeColors;
    }
  } catch (error) {
    console.warn("[fetchThemeColors] RPC mislukt, gebruik slug-fallback:", error);
  }

  return resolveOrganizationTheme(organizationSlug, {
    brandingTheme,
    dbTheme,
  });
}

/** Publiek tenant-palet ophalen (platform beheer preview). */
export async function fetchOrganizationThemeColors(
  organizationId: number,
  organizationSlug: string,
  brandingTheme?: ThemeColors,
): Promise<ThemeColors> {
  return fetchThemeColors(organizationId, organizationSlug, brandingTheme);
}

export function restoreSiteThemeFromCache(
  queryClient: QueryClient,
  organizationSlug: string,
  organizationId: number | undefined,
): void {
  const siteTheme = queryClient.getQueryData<ThemeColors>(
    getSiteThemeColorsQueryKey(organizationSlug, organizationId),
  );
  if (siteTheme) {
    applyThemeToCSS(siteTheme);
    void applyThemeToDocument(siteTheme);
  }
}

/**
 * Hook that loads theme colors from DB and applies them to CSS variables.
 * Call once at the app root level (inside OrganizationProvider).
 */
export function useThemeColorsInit() {
  const { isSuperAdmin } = useAuth();
  const actingOrg = useSuperAdminActingOrg();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { organization, organizationSlug } = useOrganization();

  const brandingTheme = useMemo(
    () =>
      organization
        ? parseBrandingSettings(organization.brandingSettings, organization.slug).themeColors
        : undefined,
    [organization],
  );

  const slugFallback = useMemo(
    () => resolveOrganizationTheme(organizationSlug, { brandingTheme }),
    [organizationSlug, brandingTheme],
  );

  const { data: theme } = useQuery({
    queryKey: getSiteThemeColorsQueryKey(organizationSlug, organizationId),
    queryFn: () =>
      fetchThemeColors(organizationId!, organizationSlug, brandingTheme),
    enabled: orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: slugFallback,
  });

  useEffect(() => {
    // SuperAdmin preview in platform beheer — acting tenant wijkt af van hostname
    if (
      isSuperAdmin &&
      actingOrg &&
      organizationId != null &&
      actingOrg.organizationId !== organizationId
    ) {
      return;
    }

    // Tijdens org-load: slug-fallback (boot theme). Na ready: DB/branding theme.
    const activeTheme = orgQueryEnabled
      ? (theme ?? slugFallback)
      : slugFallback;
    applyThemeToCSS(activeTheme);
    void applyThemeToDocument(activeTheme);
  }, [
    theme,
    slugFallback,
    organizationId,
    orgQueryEnabled,
    isSuperAdmin,
    actingOrg?.organizationId,
  ]);
}

/**
 * Hook for the settings page to read/write theme colors.
 * SuperAdmin: gebruikt acting tenant (platform beheer), niet hostname-org.
 */
export function useThemeColorsAdmin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const actingOrg = useSuperAdminActingOrg();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const { organization, organizationSlug } = useOrganization();

  const scopeOrgId =
    isSuperAdmin && actingOrg?.organizationId != null
      ? actingOrg.organizationId
      : organizationId;
  const scopeSlug =
    isSuperAdmin && actingOrg?.slug ? actingOrg.slug : organizationSlug;

  const brandingTheme = useMemo(() => {
    if (!organization) return undefined;
    if (
      isSuperAdmin &&
      actingOrg &&
      organization.id !== actingOrg.organizationId
    ) {
      return undefined;
    }
    return parseBrandingSettings(organization.brandingSettings, organization.slug).themeColors;
  }, [organization, isSuperAdmin, actingOrg]);

  const adminQueryEnabled = orgQueryEnabled && scopeOrgId != null;

  const queryKey = withOrgQueryKey(
    [...QUERY_KEY_BASE, "admin", scopeSlug],
    scopeOrgId,
  );

  const slugFallback = useMemo(
    () => resolveOrganizationTheme(scopeSlug, { brandingTheme }),
    [scopeSlug, brandingTheme],
  );

  const { data: theme, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchThemeColorsFromSession(scopeSlug, brandingTheme),
    enabled: adminQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: slugFallback,
  });

  const saveMutation = useMutation({
    mutationFn: async (newTheme: ThemeColors) => {
      const rows = await listApplicationSettingsForSession("theme_colors");
      const existing = rows.find((row) => row.setting_name === "global_theme");

      if (existing) {
        await updateApplicationSettingForSession(existing.id, {
          setting_value: JSON.parse(JSON.stringify(newTheme)),
          setting_category: "theme_colors",
        });
      } else {
        await insertApplicationSettingForSession({
          setting_category: "theme_colors",
          setting_name: "global_theme",
          setting_value: JSON.parse(JSON.stringify(newTheme)),
        });
      }
    },
    onSuccess: (_, newTheme) => {
      applyThemeToCSS(normalizeTheme(newTheme));
      void applyThemeToDocument(normalizeTheme(newTheme));
      queryClient.setQueryData(queryKey, newTheme);
      toast({ title: "Kleuren opgeslagen", description: "Het kleurenpalet is bijgewerkt." });
    },
    onError: () => {
      toast({ title: "Fout", description: "Kleuren konden niet worden opgeslagen.", variant: "destructive" });
    },
  });

  return {
    theme: theme ?? slugFallback,
    isLoading,
    saveTheme: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  };
}
