UPDATE public.organizations
SET branding_settings = branding_settings
  || jsonb_build_object(
    'logoPath', '/images/logos/kuurne-logo-stacked.png',
    'logoHorizontalPath', '/images/logos/kuurne-logo-horizontal.png',
    'logoIconPath', '/images/logos/kuurne-logo-mark.png',
    'logoLayout', 'horizontal'
  )
WHERE id = 2;