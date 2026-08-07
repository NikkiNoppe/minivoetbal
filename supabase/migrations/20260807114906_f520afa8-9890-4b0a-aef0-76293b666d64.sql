UPDATE public.organizations
SET branding_settings = branding_settings
  || jsonb_build_object(
    'logoWhitePath', '/images/logos/kuurne-logo-stacked-white.png',
    'logoHorizontalWhitePath', '/images/logos/kuurne-logo-horizontal-white.png',
    'logoIconWhitePath', '/images/logos/kuurne-logo-mark-white.png'
  )
WHERE id = 2;