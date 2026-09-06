-- Elke organisatie krijgt eigen schorsingsregels.
-- Alleen org 1 (Harelbeke) had default_rules; Kuurne (en nieuwe orgs) faalden bij opslaan.

INSERT INTO public.application_settings (
  organization_id,
  setting_category,
  setting_name,
  setting_value
)
SELECT
  o.id,
  'suspension_rules',
  'default_rules',
  '{
    "yellow_card_rules": [
      {"card_count": 2, "suspension_matches": 1},
      {"card_count": 4, "suspension_matches": 2},
      {"card_count": 6, "suspension_matches": 2}
    ],
    "red_card_rules": {
      "default_suspension_matches": 1,
      "admin_can_modify": true
    },
    "reset_rules": {
      "reset_at_season_end": true
    }
  }'::jsonb
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.application_settings s
  WHERE s.organization_id = o.id
    AND s.setting_category = 'suspension_rules'
    AND s.setting_name = 'default_rules'
);
