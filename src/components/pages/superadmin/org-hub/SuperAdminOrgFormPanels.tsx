import { Link2, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { deriveDefaultInfoEmail } from '@/types/branding';
import type { SuperAdminOrgFormState } from '@/lib/superAdminOrgForm';
import { OrgHubFormSection } from './OrgHubFormSection';
import { OrgHubAssetUploadField } from './OrgHubAssetUploadField';

type FormUpdater = (next: SuperAdminOrgFormState) => void;

function useFormUpdater(form: SuperAdminOrgFormState, onChange: FormUpdater) {
  const update = <K extends keyof SuperAdminOrgFormState>(
    key: K,
    value: SuperAdminOrgFormState[K],
  ) => onChange({ ...form, [key]: value });

  return { update, form };
}

export function OrgHubOverviewPanel({
  form,
  onChange,
  isNew,
}: {
  form: SuperAdminOrgFormState;
  onChange: FormUpdater;
  isNew?: boolean;
}) {
  const { update } = useFormUpdater(form, onChange);

  return (
    <OrgHubFormSection
      title="Identiteit"
      description="Technische sleutels en sitenaam van deze organisatie."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`display-name-${form.organizationId}`}>Sitenaam</Label>
          <Input
            id={`display-name-${form.organizationId}`}
            className="min-h-[44px]"
            placeholder="Harelbeekse Minivoetbal Competitie"
            value={form.displayName}
            onChange={(e) => update('displayName', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`org-id-${form.organizationId}`}>Organisatie ID</Label>
          <Input
            id={`org-id-${form.organizationId}`}
            type="number"
            min={1}
            disabled={!isNew}
            className="min-h-[44px]"
            value={form.organizationId}
            onChange={(e) =>
              update('organizationId', Number.parseInt(e.target.value, 10) || 1)
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`slug-${form.organizationId}`}>Slug</Label>
          <Input
            id={`slug-${form.organizationId}`}
            className="min-h-[44px]"
            placeholder="harelbeke"
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
          />
        </div>
      </div>
    </OrgHubFormSection>
  );
}

export function OrgHubBrandingPanel({
  form,
  onChange,
}: {
  form: SuperAdminOrgFormState;
  onChange: FormUpdater;
}) {
  const { update } = useFormUpdater(form, onChange);

  return (
    <OrgHubFormSection
      title="Website & branding"
      description="Logo's, hostnames en website-URL voor deze tenant."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Korte naam</Label>
          <Input
            className="min-h-[44px]"
            value={form.shortName}
            onChange={(e) => update('shortName', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Website URL</Label>
          <Input
            className="min-h-[44px]"
            type="url"
            placeholder="https://…"
            value={form.siteUrl}
            onChange={(e) => update('siteUrl', e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Hostnames (één per regel)</Label>
          <Textarea
            rows={3}
            className="min-h-[88px] resize-y"
            placeholder={'harelbekeminivoetbal.be\nkuurneminivoetbal.nikkinoppe.be'}
            value={form.hostnamesText}
            onChange={(e) => update('hostnamesText', e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <OrgHubAssetUploadField
          label="Logo"
          description="Breed logo voor header en e-mails."
          value={form.logoPath}
          onChange={(value) => update('logoPath', value)}
          organizationId={form.organizationId}
          assetType="logo"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          previewClassName="max-h-16"
        />
        <OrgHubAssetUploadField
          label="Logo (tekst naast logo)"
          description="Horizontale variant: beeldmerk links, tekst ernaast."
          value={form.logoHorizontalPath}
          onChange={(value) => update('logoHorizontalPath', value)}
          organizationId={form.organizationId}
          assetType="logo"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          previewClassName="max-h-16"
        />
        <div className="space-y-2 sm:col-span-2">
          <Label>Logovariant in header</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'stacked', label: 'Tekst onder logo' },
                { value: 'horizontal', label: 'Tekst naast logo' },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={form.logoLayout === option.value ? 'default' : 'outline'}
                className="min-h-[44px]"
                disabled={option.value === 'horizontal' && !form.logoHorizontalPath}
                onClick={() => update('logoLayout', option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Bepaalt welk logobestand in de header en e-mails getoond wordt.
          </p>
        </div>
        <OrgHubAssetUploadField
          label="Logo icoon"
          description="Vierkant icoon als fallback."
          value={form.logoIconPath}
          onChange={(value) => update('logoIconPath', value)}
          organizationId={form.organizationId}
          assetType="logo-icon"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          previewClassName="max-h-16 max-w-[64px]"
        />

        <div className="sm:col-span-2">
          <OrgHubAssetUploadField
            label="Favicon"
            description="Browsertab-icoon (.ico of .png)."
            value={form.faviconPath}
            onChange={(value) => update('faviconPath', value)}
            organizationId={form.organizationId}
            assetType="favicon"
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp"
            previewClassName="max-h-10 max-w-[40px]"
          />
        </div>
      </div>
    </OrgHubFormSection>
  );
}

export function OrgHubEmailSeoPanel({
  form,
  onChange,
}: {
  form: SuperAdminOrgFormState;
  onChange: FormUpdater;
}) {
  const { update } = useFormUpdater(form, onChange);

  return (
    <div className="space-y-8">
      <OrgHubFormSection
        title="E-mail"
        description="Afzender en antwoord-adres voor transactionele mails. Layout en kleuren volgen het kleurenpalet (tab Platform)."
        icon={Mail}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`email-from-${form.organizationId}`}>Afzender e-mail</Label>
            <Input
              id={`email-from-${form.organizationId}`}
              type="email"
              className="min-h-[44px]"
              placeholder={
                form.organizationId === 1
                  ? 'info@harelbekeminivoetbal.be'
                  : deriveDefaultInfoEmail(form.siteUrl || 'https://example.be')
              }
              value={form.emailFrom}
              onChange={(e) => update('emailFrom', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leeg = automatisch{' '}
              <code className="text-xs">
                info@
                {form.siteUrl
                  ? (() => {
                      try {
                        return new URL(form.siteUrl).hostname.replace(/^www\./, '');
                      } catch {
                        return '…';
                      }
                    })()
                  : 'domein'}
              </code>
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`email-reply-${form.organizationId}`}>Antwoord-adres (Reply-To)</Label>
            <Input
              id={`email-reply-${form.organizationId}`}
              type="email"
              className="min-h-[44px]"
              placeholder={form.emailFrom || 'Zelfde als afzender'}
              value={form.emailReplyTo}
              onChange={(e) => update('emailReplyTo', e.target.value)}
            />
          </div>
        </div>
      </OrgHubFormSection>

      <OrgHubFormSection title="SEO" description="Standaard titel en beschrijving voor zoekmachines.">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paginatitel (default)</Label>
            <Input
              className="min-h-[44px]"
              value={form.metaTitle}
              onChange={(e) => update('metaTitle', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Meta beschrijving</Label>
            <Textarea
              rows={2}
              className="resize-y"
              value={form.metaDescription}
              onChange={(e) => update('metaDescription', e.target.value)}
            />
          </div>
        </div>
      </OrgHubFormSection>
    </div>
  );
}

export function OrgHubContentPanel({
  form,
  onChange,
}: {
  form: SuperAdminOrgFormState;
  onChange: FormUpdater;
}) {
  const { update } = useFormUpdater(form, onChange);

  const updateLink = (index: number, field: 'label' | 'url', value: string) => {
    const links = [...form.externalLinks];
    links[index] = { ...links[index], [field]: value };
    update('externalLinks', links);
  };

  const updateContact = (
    index: number,
    field: 'name' | 'phone' | 'email',
    value: string,
  ) => {
    const contacts = [...form.footerContacts];
    contacts[index] = { ...contacts[index], [field]: value };
    update('footerContacts', contacts);
  };

  return (
    <div className="space-y-8">
      <OrgHubFormSection
        title="Pagina Algemeen"
        description="Titel, ondertitel en introductietekst op de publieke Algemeen-pagina."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titel</Label>
            <Input
              className="min-h-[44px]"
              value={form.algemeenTitle}
              onChange={(e) => update('algemeenTitle', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Ondertitel</Label>
            <Input
              className="min-h-[44px]"
              value={form.algemeenSubtitle}
              onChange={(e) => update('algemeenSubtitle', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Over-tekst</Label>
            <Textarea
              rows={4}
              className="resize-y"
              value={form.algemeenAbout}
              onChange={(e) => update('algemeenAbout', e.target.value)}
            />
          </div>
        </div>
      </OrgHubFormSection>

      <OrgHubFormSection title="Footer" description="Tagline en contactpersonen onderaan elke pagina.">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Footer tagline</Label>
            <Input
              className="min-h-[44px]"
              value={form.footerTagline}
              onChange={(e) => update('footerTagline', e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-dark flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  Contactpersonen
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Naam verplicht; telefoon en e-mail optioneel.
                </p>
              </div>
              <Button
                type="button"
                variant="unstyled"
                className="btn btn--outline min-h-[44px] w-full sm:w-auto shrink-0"
                onClick={() =>
                  update('footerContacts', [
                    ...form.footerContacts,
                    { name: '', phone: '', email: '' },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Toevoegen
              </Button>
            </div>

            {form.footerContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed border-primary/20 px-4 py-6 text-center">
                Nog geen contactpersonen.
              </p>
            ) : (
              <div className="space-y-3">
                {form.footerContacts.map((contact, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-3 rounded-lg border border-primary/10 bg-background p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`contact-name-${form.organizationId}-${index}`}>Naam</Label>
                        <Input
                          id={`contact-name-${form.organizationId}-${index}`}
                          className="min-h-[44px]"
                          value={contact.name}
                          onChange={(e) => updateContact(index, 'name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`contact-phone-${form.organizationId}-${index}`}>Telefoon</Label>
                        <Input
                          id={`contact-phone-${form.organizationId}-${index}`}
                          className="min-h-[44px]"
                          type="tel"
                          value={contact.phone ?? ''}
                          onChange={(e) => updateContact(index, 'phone', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`contact-email-${form.organizationId}-${index}`}>E-mail</Label>
                        <Input
                          id={`contact-email-${form.organizationId}-${index}`}
                          className="min-h-[44px]"
                          type="email"
                          value={contact.email ?? ''}
                          onChange={(e) => updateContact(index, 'email', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="unstyled"
                        className="btn btn--danger min-h-[44px]"
                        onClick={() =>
                          update(
                            'footerContacts',
                            form.footerContacts.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                        Verwijderen
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </OrgHubFormSection>

      <OrgHubFormSection title="Externe links" icon={Link2}>
        <div className="flex justify-end mb-3">
          <Button
            type="button"
            variant="unstyled"
            className="btn btn--outline min-h-[44px]"
            onClick={() =>
              update('externalLinks', [...form.externalLinks, { label: '', url: '' }])
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Link toevoegen
          </Button>
        </div>
        {form.externalLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed border-primary/20 px-4 py-6 text-center">
            Nog geen links — bv. Facebook of verenigingswebsite.
          </p>
        ) : (
          <div className="space-y-3">
            {form.externalLinks.map((link, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border border-primary/10 bg-background p-3 sm:flex-row sm:items-end"
              >
                <div className="flex-1 space-y-2 min-w-0">
                  <Label>Label</Label>
                  <Input
                    className="min-h-[44px]"
                    value={link.label}
                    onChange={(e) => updateLink(index, 'label', e.target.value)}
                  />
                </div>
                <div className="flex-[2] space-y-2 min-w-0">
                  <Label>URL</Label>
                  <Input
                    className="min-h-[44px]"
                    type="url"
                    value={link.url}
                    onChange={(e) => updateLink(index, 'url', e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="unstyled"
                  className="btn btn--icon btn--danger shrink-0"
                  aria-label="Link verwijderen"
                  onClick={() =>
                    update(
                      'externalLinks',
                      form.externalLinks.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </OrgHubFormSection>
    </div>
  );
}
