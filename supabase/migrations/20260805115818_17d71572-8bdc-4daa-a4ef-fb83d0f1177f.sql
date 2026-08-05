UPDATE public.organizations
SET branding_settings = jsonb_set(
  jsonb_set(branding_settings, '{siteUrl}', '"https://www.mvvkuurne.be"'::jsonb, true),
  '{hostnames}',
  '["mvvkuurne.be","www.mvvkuurne.be","mvvkuurne.nikkinoppe.be","kuurneminivoetbal.nikkinoppe.be"]'::jsonb,
  true
)
WHERE id = 2;