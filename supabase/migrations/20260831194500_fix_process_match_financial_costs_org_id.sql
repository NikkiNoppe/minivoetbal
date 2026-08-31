-- Fix: team_costs.organization_id NOT NULL — trigger moet org meenemen bij auto wedstrijdkosten.

CREATE OR REPLACE FUNCTION public.process_match_financial_costs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  veld_cost_id INT;
  referee_cost_id INT;
  admin_cost_id INT;
  veld_am NUMERIC;
  ref_am NUMERIC;
  admin_am NUMERIC;
  tx_date date;
  v_org_id integer;
BEGIN
  v_org_id := NEW.organization_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'process_match_financial_costs: match % heeft geen organization_id', NEW.match_id;
  END IF;

  tx_date := COALESCE(
    CASE
      WHEN NEW.match_date IS NULL THEN NULL
      ELSE left(NEW.match_date::text, 10)::date
    END,
    CURRENT_DATE
  );

  IF public.match_has_forfait_penalty(NEW.match_id)
     AND NOT public.match_played_with_scores(NEW.match_id) THEN
    DELETE FROM public.team_costs tc
    USING public.costs c
    WHERE tc.match_id = NEW.match_id
      AND tc.organization_id = v_org_id
      AND tc.cost_setting_id = c.id
      AND c.organization_id = v_org_id
      AND c.category = 'match_cost'
      AND NOT public.cost_name_is_admin_match_cost(c.name);

    SELECT id, amount INTO admin_cost_id, admin_am FROM public.costs
    WHERE name = 'Administratiekosten'
      AND category = 'match_cost'
      AND organization_id = v_org_id
    LIMIT 1;

    IF admin_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.home_team_id, admin_cost_id, NEW.match_id, tx_date, admin_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;

      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.away_team_id, admin_cost_id, NEW.match_id, tx_date, admin_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;

    RETURN NEW;
  END IF;

  SELECT id, amount INTO veld_cost_id, veld_am FROM public.costs
  WHERE name = 'Veldkosten'
    AND category = 'match_cost'
    AND organization_id = v_org_id
  LIMIT 1;

  SELECT id, amount INTO referee_cost_id, ref_am FROM public.costs
  WHERE name = 'Scheidsrechterkosten'
    AND category = 'match_cost'
    AND organization_id = v_org_id
  LIMIT 1;

  SELECT id, amount INTO admin_cost_id, admin_am FROM public.costs
  WHERE name = 'Administratiekosten'
    AND category = 'match_cost'
    AND organization_id = v_org_id
  LIMIT 1;

  IF NEW.home_score IS NULL AND NEW.away_score IS NULL THEN
    DELETE FROM public.team_costs tc
    USING public.costs c
    WHERE tc.match_id = NEW.match_id
      AND tc.organization_id = v_org_id
      AND tc.cost_setting_id = c.id
      AND c.organization_id = v_org_id
      AND c.category = 'match_cost'
      AND NOT public.cost_name_is_admin_match_cost(c.name);
    RETURN NEW;
  END IF;

  IF NEW.is_submitted = true
     AND (OLD.is_submitted = false OR OLD.is_submitted IS NULL)
     AND NEW.home_score IS NOT NULL
     AND NEW.away_score IS NOT NULL
  THEN
    IF COALESCE(NEW.skip_auto_match_costs, false) THEN
      RETURN NEW;
    END IF;

    IF NEW.assigned_referee_id IS NULL AND referee_cost_id IS NOT NULL THEN
      DELETE FROM public.team_costs
      WHERE match_id = NEW.match_id
        AND organization_id = v_org_id
        AND cost_setting_id = referee_cost_id;
    END IF;

    IF veld_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.home_team_id, veld_cost_id, NEW.match_id, tx_date, veld_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;

    IF admin_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.home_team_id, admin_cost_id, NEW.match_id, tx_date, admin_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;

    IF NEW.assigned_referee_id IS NOT NULL AND referee_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.home_team_id, referee_cost_id, NEW.match_id, tx_date, ref_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;

    IF veld_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.away_team_id, veld_cost_id, NEW.match_id, tx_date, veld_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;

    IF admin_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.away_team_id, admin_cost_id, NEW.match_id, tx_date, admin_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;

    IF NEW.assigned_referee_id IS NOT NULL AND referee_cost_id IS NOT NULL THEN
      INSERT INTO public.team_costs (organization_id, team_id, cost_setting_id, match_id, transaction_date, amount)
      VALUES (v_org_id, NEW.away_team_id, referee_cost_id, NEW.match_id, tx_date, ref_am)
      ON CONFLICT (match_id, team_id, cost_setting_id) WHERE match_id IS NOT NULL
      DO UPDATE SET amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date
      WHERE team_costs.amount IS DISTINCT FROM EXCLUDED.amount OR team_costs.transaction_date IS DISTINCT FROM EXCLUDED.transaction_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.process_match_financial_costs() IS
  'Auto wedstrijdkosten bij indienen; organization_id uit matches.organization_id.';
