-- Kuurne (organization_id = 2) boetelijst volgens reglement
-- Bedragen: wedstrijdblad/kaarten/forfait/… zoals aangeleverd 2026-08-26

UPDATE public.costs SET amount = 0.50, name = 'Niet correct ingevuld wedstrijdblad'
WHERE id = 56 AND organization_id = 2;

UPDATE public.costs SET amount = 2.50
WHERE id = 44 AND organization_id = 2 AND name = 'Gele kaart';

UPDATE public.costs SET amount = 7.50
WHERE id = 45 AND organization_id = 2 AND name = 'Rode kaart';

UPDATE public.costs SET amount = 1.00, name = 'Niet dragen kapiteinsband'
WHERE id = 47 AND organization_id = 2;

UPDATE public.costs SET amount = 1.00, name = 'Ploeg te laat op terrein'
WHERE id = 50 AND organization_id = 2;

UPDATE public.costs SET amount = 20.00
WHERE id = 49 AND organization_id = 2 AND name = 'Forfait verwittigd';

UPDATE public.costs SET amount = 25.00, name = 'Niet verwittigd forfait'
WHERE id = 48 AND organization_id = 2;

INSERT INTO public.costs (organization_id, name, amount, category)
SELECT 2, v.name, v.amount, 'penalty'
FROM (VALUES
  ('Gebruik reserve wedstrijdblad', 5.00),
  ('Gebruik hesjes', 2.50),
  ('Spelen zonder ID', 1.00),
  ('Geen wedstrijdbal', 2.50)
) AS v(name, amount)
WHERE NOT EXISTS (
  SELECT 1 FROM public.costs c
  WHERE c.organization_id = 2 AND c.name = v.name AND c.category = 'penalty'
);
