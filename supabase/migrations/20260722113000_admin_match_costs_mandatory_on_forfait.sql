-- Administratiekosten blijven per wedstrijd staan, ook bij forfait.
-- process_match_financial_costs niet hier vervangen — canonieke versie:
-- 20260831194500 (organization_id). Zie ook 20260902185908.

CREATE OR REPLACE FUNCTION public.cost_name_is_admin_match_cost(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT lower(trim(COALESCE(p_name, ''))) LIKE '%administratie%'
      OR lower(trim(COALESCE(p_name, ''))) LIKE '%admin%';
$$;

REVOKE ALL ON FUNCTION public.cost_name_is_admin_match_cost(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cost_name_is_admin_match_cost(text) TO anon, service_role;

CREATE OR REPLACE FUNCTION public.trg_strip_match_costs_on_forfait_penalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.match_id IS NULL OR NEW.cost_setting_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.match_played_with_scores(NEW.match_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.costs c
    WHERE c.id = NEW.cost_setting_id
      AND c.category = 'penalty'
      AND public.cost_name_implies_match_cost_suppression(c.name)
  ) THEN
    DELETE FROM public.team_costs tc
    USING public.costs c
    WHERE tc.match_id = NEW.match_id
      AND tc.cost_setting_id = c.id
      AND c.category = 'match_cost'
      AND NOT public.cost_name_is_admin_match_cost(c.name);
  END IF;

  RETURN NEW;
END;
$fn$;
