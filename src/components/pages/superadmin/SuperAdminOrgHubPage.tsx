import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Info,
  Loader2,
  Plus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PUBLIC_CARD_CLASS, PUBLIC_PAGE_CLASS } from '@/components/layout';
import { SUPERADMIN_ROUTES } from '@/config/routes';
import { fetchAllOrganizations } from '@/services/organization/organizationService';
import {
  upsertOrganizationForSuperAdmin,
  setSuperAdminActingOrganization,
} from '@/services/organization/superAdminOrganizationService';
import {
  getSuperAdminActingOrg,
  setSuperAdminActingOrg,
  type SuperAdminActingOrg,
} from '@/lib/superAdminOrg';
import {
  createEmptyOrgFormState,
  formStateToBrandingSettings,
  organizationToFormState,
  type SuperAdminOrgFormState,
} from '@/lib/superAdminOrgForm';
import { parseBrandingSettings } from '@/types/branding';
import { SuperAdminOrgEditor } from '@/components/pages/superadmin/org-hub/SuperAdminOrgEditor';
import { OrgHubAvatar } from '@/components/pages/superadmin/org-hub/OrgHubAvatar';
import { useSuperAdminOrgHubThemePreview } from '@/hooks/useSuperAdminOrgHubThemePreview';
import { cn } from '@/lib/utils';

const SIDEBAR_CARD_CLASS = cn(PUBLIC_CARD_CLASS, 'shadow-sm border-primary/20');

function PlatformPageSkeleton() {
  return (
    <div className={PUBLIC_PAGE_CLASS}>
      <div className="space-y-2 mb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_1fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
    </div>
  );
}

function OrgSidebarItem({
  displayName,
  logoPath,
  orgId,
  slug,
  isActive,
  isSelected,
  onSelect,
}: {
  displayName: string;
  logoPath?: string;
  orgId: number;
  slug: string;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors min-h-[44px]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isSelected
          ? 'border-primary/40 bg-primary/5 shadow-sm'
          : 'border-primary/10 bg-background hover:bg-brand-50/60',
      )}
      aria-current={isSelected ? 'true' : undefined}
    >
      <OrgHubAvatar logoPath={logoPath} displayName={displayName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-dark">{displayName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-mono text-muted-foreground">id {orgId}</span>
          {isActive ? (
            <Badge className="h-5 bg-primary/10 px-1.5 text-[10px] text-primary border-primary/20">
              Actief
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-[10px] font-mono text-muted-foreground">{slug}</p>
      </div>
    </button>
  );
}

export const SuperAdminOrgHubPage: React.FC<{ embedded?: boolean }> = ({
  embedded = false,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<Record<number, SuperAdminOrgFormState>>({});
  const [newOrgForm, setNewOrgForm] = useState<SuperAdminOrgFormState | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | 'new' | null>(null);
  const [savingId, setSavingId] = useState<number | 'new' | null>(null);
  const [actingOrg, setActingOrg] = useState<SuperAdminActingOrg | null>(() =>
    getSuperAdminActingOrg(),
  );

  const orgsQuery = useQuery({
    queryKey: ['superadmin', 'organizations'],
    queryFn: fetchAllOrganizations,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useSuperAdminOrgHubThemePreview(orgsQuery.data);

  useEffect(() => {
    if (!orgsQuery.data) return;
    const next: Record<number, SuperAdminOrgFormState> = {};
    for (const org of orgsQuery.data) {
      next[org.id] = organizationToFormState(org);
    }
    setForms(next);
  }, [orgsQuery.data]);

  useEffect(() => {
    if (selectedOrgId !== null) return;
    if (newOrgForm) {
      setSelectedOrgId('new');
      return;
    }
    const preferred = actingOrg?.organizationId ?? orgsQuery.data?.[0]?.id;
    if (preferred) setSelectedOrgId(preferred);
  }, [orgsQuery.data, actingOrg, selectedOrgId, newOrgForm]);

  const nextOrgId = useMemo(() => {
    const ids = orgsQuery.data?.map((o) => o.id) ?? [];
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }, [orgsQuery.data]);

  const orgCount = orgsQuery.data?.length ?? 0;

  const saveMutation = useMutation({
    mutationFn: async ({
      form,
      existingBranding,
    }: {
      form: SuperAdminOrgFormState;
      existingBranding: Record<string, unknown>;
    }) => {
      const brandingSettings = formStateToBrandingSettings(form, existingBranding);
      return upsertOrganizationForSuperAdmin({
        organizationId: form.organizationId,
        name: form.displayName.trim(),
        slug: form.slug,
        brandingSettings,
      });
    },
    onSuccess: async (result, variables) => {
      if (!result.success) {
        toast({
          title: 'Opslaan mislukt',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Organisatie opgeslagen' });
      setNewOrgForm(null);
      setSelectedOrgId(variables.form.organizationId);
      await queryClient.invalidateQueries({ queryKey: ['superadmin', 'organizations'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
      setForms((prev) => ({
        ...prev,
        [variables.form.organizationId]: variables.form,
      }));
    },
    onError: () => {
      toast({
        title: 'Opslaan mislukt',
        description: 'Er ging iets mis bij het opslaan.',
        variant: 'destructive',
      });
    },
    onSettled: () => setSavingId(null),
  });

  const handleSave = (form: SuperAdminOrgFormState, isNew = false) => {
    const existing =
      orgsQuery.data?.find((o) => o.id === form.organizationId)?.brandingSettings ?? {};
    setSavingId(isNew ? 'new' : form.organizationId);
    saveMutation.mutate({ form, existingBranding: existing });
  };

  const handleActivate = async (form: SuperAdminOrgFormState) => {
    try {
      const applied = await setSuperAdminActingOrganization(form.organizationId);
      if (!applied) {
        toast({ title: 'Activeren mislukt', variant: 'destructive' });
        return;
      }
      const next: SuperAdminActingOrg = {
        organizationId: form.organizationId,
        slug: form.slug,
      };
      setSuperAdminActingOrg(next);
      setActingOrg(next);
      await queryClient.invalidateQueries({ queryKey: ['theme-colors'] });
      toast({
        title: `${form.displayName || form.slug} actief`,
        description: 'Admin-acties gelden nu voor deze organisatie.',
      });
    } catch {
      // setSuperAdminActingOrganization logs errors internally
    }
  };

  const pageWrapperClass = cn(
    PUBLIC_PAGE_CLASS,
    embedded ? 'w-full max-w-7xl mx-auto' : 'min-h-screen px-4 py-6 sm:px-6 safe-area-bottom',
  );

  if (orgsQuery.isLoading && !orgsQuery.data) {
    return (
      <div className={pageWrapperClass}>
        <PlatformPageSkeleton />
      </div>
    );
  }

  if (orgsQuery.isError) {
    return (
      <div className={cn(pageWrapperClass, 'flex flex-col items-center justify-center min-h-[40vh]')}>
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Kon organisaties niet laden</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3">
            <p>Controleer je verbinding en probeer opnieuw.</p>
            <Button type="button" className="min-h-[44px]" onClick={() => void orgsQuery.refetch()}>
              Opnieuw proberen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedForm =
    selectedOrgId === 'new'
      ? newOrgForm
      : typeof selectedOrgId === 'number'
        ? forms[selectedOrgId]
        : null;

  const selectedOrg =
    typeof selectedOrgId === 'number'
      ? orgsQuery.data?.find((o) => o.id === selectedOrgId)
      : null;

  const selectedBranding = selectedOrg
    ? parseBrandingSettings(selectedOrg.brandingSettings)
    : null;

  return (
    <div className={pageWrapperClass}>
      {!embedded && (
        <Link
          to={SUPERADMIN_ROUTES.platform}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Terug naar platform
        </Link>
      )}

      <PageHeader
        title="Platform beheer"
        icon={Building2}
        subtitle="Kies een organisatie links en bewerk branding, e-mail, content en platform-instellingen per tab."
        rightAction={
          <Badge variant="outline" className="min-h-[28px] px-3 text-xs font-medium">
            {orgCount} {orgCount === 1 ? 'organisatie' : 'organisaties'}
          </Badge>
        }
      />

      {orgsQuery.isFetching && orgsQuery.data ? (
        <p className="text-xs text-muted-foreground -mt-4 mb-2 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Vernieuwen…
        </p>
      ) : null}

      {actingOrg ? (
        <Alert className="border-primary/25 py-3">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <AlertTitle className="text-sm">Actieve tenant</AlertTitle>
          <AlertDescription className="text-sm">
            Admin-wijzigingen gelden voor{' '}
            <strong className="font-medium text-foreground">
              {forms[actingOrg.organizationId]?.displayName ?? actingOrg.slug}
            </strong>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="py-3">
          <Info className="h-4 w-4" aria-hidden />
          <AlertTitle className="text-sm">Geen actieve tenant</AlertTitle>
          <AlertDescription className="text-sm">
            Kies een organisatie in de lijst links vóór je platform-instellingen wijzigt.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start">
        <aside className="space-y-3 lg:sticky lg:top-4">
          <Card className={SIDEBAR_CARD_CLASS}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-brand-dark">Organisaties</CardTitle>
              <CardDescription className="text-xs">Selecteer welke tenant je bewerkt.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {(orgsQuery.data ?? []).map((org) => {
                const form = forms[org.id];
                if (!form) return null;
                const branding = parseBrandingSettings(org.brandingSettings);
                const displayName = branding.displayName || org.name;

                return (
                  <OrgSidebarItem
                    key={org.id}
                    displayName={displayName}
                    logoPath={form.logoPath || branding.logoPath}
                    orgId={org.id}
                    slug={org.slug}
                    isActive={actingOrg?.organizationId === org.id}
                    isSelected={selectedOrgId === org.id}
                    onSelect={() => {
                      setNewOrgForm(null);
                      setSelectedOrgId(org.id);
                      if (actingOrg?.organizationId !== org.id) {
                        void handleActivate(form);
                      }
                    }}
                  />
                );
              })}

              <Button
                type="button"
                variant={selectedOrgId === 'new' ? 'secondary' : 'outline'}
                className="min-h-[44px] w-full justify-start gap-2"
                onClick={() => {
                  const empty = createEmptyOrgFormState(nextOrgId);
                  setNewOrgForm(empty);
                  setSelectedOrgId('new');
                }}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                Nieuwe organisatie
              </Button>
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          {selectedForm ? (
            <>
              <SuperAdminOrgEditor
                form={selectedForm}
                displayName={
                  selectedOrgId === 'new'
                    ? 'Nieuwe organisatie'
                    : selectedBranding?.displayName || selectedForm.displayName
                }
                logoPath={
                  selectedOrgId === 'new'
                    ? selectedForm.logoPath
                    : selectedForm.logoPath || selectedBranding?.logoPath
                }
                isActive={
                  typeof selectedOrgId === 'number' &&
                  actingOrg?.organizationId === selectedOrgId
                }
                isNew={selectedOrgId === 'new'}
                isSaving={savingId === (selectedOrgId === 'new' ? 'new' : selectedOrgId)}
                onChange={(next) => {
                  if (selectedOrgId === 'new') {
                    setNewOrgForm(next);
                  } else if (typeof selectedOrgId === 'number') {
                    setForms((prev) => ({ ...prev, [selectedOrgId]: next }));
                  }
                }}
                onSave={() => handleSave(selectedForm, selectedOrgId === 'new')}
              />
            </>
          ) : (
            <Card className={SIDEBAR_CARD_CLASS}>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Building2 className="mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden />
                <p className="text-sm font-medium text-brand-dark">Geen organisatie geselecteerd</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Kies een organisatie in de lijst links om instellingen te bewerken.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
