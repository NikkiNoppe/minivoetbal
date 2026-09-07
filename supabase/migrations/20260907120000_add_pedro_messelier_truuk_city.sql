-- Goedgekeurde uitzondering: 21e speler voor Truuk City (reglement max. 20)
-- Pedro Messelier, geb. 12/07/1987

INSERT INTO public.players (
  first_name,
  last_name,
  birth_date,
  team_id,
  organization_id
)
SELECT
  'Pedro',
  'Messelier',
  DATE '1987-07-12',
  t.team_id,
  t.organization_id
FROM public.teams t
WHERE t.team_name = 'Truuk City'
  AND t.organization_id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.team_id = t.team_id
      AND p.first_name = 'Pedro'
      AND p.last_name = 'Messelier'
      AND p.birth_date = DATE '1987-07-12'
  );
