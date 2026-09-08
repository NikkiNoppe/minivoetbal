import {
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PUBLIC_CARD_CLASS } from '@/components/layout';
import type { SuperAdminOrgFormState } from '@/lib/superAdminOrgForm';
import { SuperAdminOrgTenantSettings } from '@/components/pages/superadmin/SuperAdminOrgTenantSettings';
import { cn } from '@/lib/utils';
import { OrgHubAvatar } from './OrgHubAvatar';
import {
  OrgHubBrandingPanel,
  OrgHubContentPanel,
  OrgHubEmailSeoPanel,
  OrgHubOverviewPanel,
} from './SuperAdminOrgFormPanels';
import { CloseSeasonCard } from './CloseSeasonCard';

const EDITOR_TABS = [
  { value: 'overview', label: 'Overzicht' },
  { value: 'branding', label: 'Branding' },
  { value: 'email', label: 'E-mail & SEO' },
  { value: 'content', label: 'Content' },
  { value: 'platform', label: 'Platform' },
  { value: 'season', label: 'Seizoen' },
] as const;

function InactiveTabHint({ isNew }: { isNew?: boolean }) {
  return (
    <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-primary/20 px-4 py-8 text-center">
      {isNew
        ? 'Sla de organisatie eerst op en maak hem actief om dit tabblad te gebruiken.'
        : 'Selecteer deze organisatie in de lijst links om dit tabblad te bewerken.'}
    </p>
  );
}

export function SuperAdminOrgEditor({
  form,
  displayName,
  logoPath,
  isActive,
  isNew,
  isSaving,
  onChange,
  onSave,
}: {
  form: SuperAdminOrgFormState;
  displayName: string;
  logoPath?: string;
  isActive: boolean;
  isNew?: boolean;
  isSaving: boolean;
  onChange: (next: SuperAdminOrgFormState) => void;
  onSave: () => void;
}) {
  return (
    <Card className={cn(PUBLIC_CARD_CLASS, 'shadow-sm border-primary/20 overflow-hidden')}>
      <CardHeader className="border-b border-primary/10 bg-card pb-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <OrgHubAvatar logoPath={logoPath} displayName={displayName} />
            <div className="min-w-0">
              <CardTitle className="text-lg text-brand-dark truncate">
                {displayName || form.displayName || 'Nieuwe organisatie'}
              </CardTitle>
            </div>
          </div>
          <Button
            type="button"
            className="min-h-[44px] w-full sm:w-auto shrink-0"
            disabled={isSaving}
            onClick={onSave}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden />
            )}
            {isSaving ? 'Opslaan…' : isNew ? 'Organisatie aanmaken' : 'Opslaan'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 flex h-auto min-h-[44px] w-full flex-wrap justify-start gap-1 p-1">
            {EDITOR_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-h-[40px] flex-1 sm:flex-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <OrgHubOverviewPanel form={form} onChange={onChange} isNew={isNew} />
          </TabsContent>

            <TabsContent value="branding" className="mt-0">
              <OrgHubBrandingPanel form={form} onChange={onChange} />
            </TabsContent>

            <TabsContent value="email" className="mt-0">
              <OrgHubEmailSeoPanel form={form} onChange={onChange} />
            </TabsContent>

            <TabsContent value="content" className="mt-0">
              <OrgHubContentPanel form={form} onChange={onChange} />
            </TabsContent>

            <TabsContent value="platform" className="mt-0">
              {isActive ? <SuperAdminOrgTenantSettings /> : <InactiveTabHint isNew={isNew} />}
            </TabsContent>

            <TabsContent value="season" className="mt-0">
              {isActive && !isNew ? (
                <CloseSeasonCard
                  organizationId={form.organizationId}
                  organizationName={displayName || form.displayName || 'Organisatie'}
                  enabled
                  embedded
                />
              ) : (
                <InactiveTabHint isNew={isNew} />
              )}
            </TabsContent>
          </Tabs>
      </CardContent>
    </Card>
  );
}
