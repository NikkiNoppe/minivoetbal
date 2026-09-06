-- 1) is_player_list_locked: respect periods[] (migratie 20260722140527 was nooit remote)
-- 2) Team managers: blokkeer insert/update/delete als lijst vergrendeld is

CREATE OR REPLACE FUNCTION public.is_player_list_locked(p_organization_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  setting_data jsonb;
  is_enabled boolean;
  periods jsonb;
  period jsonb;
  lock_from date;
  lock_until date;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT setting_value
  INTO setting_data
  FROM public.application_settings
  WHERE organization_id = p_organization_id
    AND setting_category = 'player_list_lock'
    AND setting_name = 'global_lock'
  LIMIT 1;

  IF setting_data IS NULL THEN
    RETURN false;
  END IF;

  is_enabled := COALESCE((setting_data->>'lock_enabled')::boolean, true);
  IF NOT is_enabled THEN
    RETURN false;
  END IF;

  periods := setting_data->'periods';

  IF periods IS NULL OR jsonb_typeof(periods) <> 'array' OR jsonb_array_length(periods) = 0 THEN
    lock_from := NULLIF(setting_data->>'lock_from_date', '')::date;
    lock_until := NULLIF(setting_data->>'lock_until_date', '')::date;

    IF lock_from IS NULL AND lock_until IS NULL THEN
      RETURN false;
    END IF;

    IF lock_from IS NOT NULL AND CURRENT_DATE < lock_from THEN
      RETURN false;
    END IF;

    IF lock_until IS NOT NULL AND CURRENT_DATE > lock_until THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  FOR period IN SELECT value FROM jsonb_array_elements(periods)
  LOOP
    lock_from := NULLIF(period->>'from', '')::date;
    lock_until := NULLIF(period->>'until', '')::date;

    IF lock_from IS NULL AND lock_until IS NULL THEN
      CONTINUE;
    END IF;

    IF lock_from IS NOT NULL AND CURRENT_DATE < lock_from THEN
      CONTINUE;
    END IF;

    IF lock_until IS NOT NULL AND CURRENT_DATE > lock_until THEN
      CONTINUE;
    END IF;

    RETURN true;
  END LOOP;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_player_list_locked(integer) IS
  'True when player list lock is enabled and CURRENT_DATE falls in any periods[] entry (or legacy single range).';

CREATE OR REPLACE FUNCTION public.insert_player_for_session(
  p_session_token uuid,
  p_first_name character varying,
  p_last_name character varying,
  p_birth_date date,
  p_team_id integer
)
RETURNS TABLE(player_id integer, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_role text;
  v_team_ids integer[];
  v_org_id integer;
  v_team_org_id integer;
  v_new_player_id integer;
BEGIN
  SELECT s.role, s.team_ids, s.organization_id
  INTO v_role, v_team_ids, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_org_id IS NULL THEN
    RETURN QUERY SELECT NULL::integer, false, 'Geen actieve sessie'::text;
    RETURN;
  END IF;

  SELECT t.organization_id
  INTO v_team_org_id
  FROM public.teams t
  WHERE t.team_id = p_team_id;

  IF NOT FOUND OR v_team_org_id IS DISTINCT FROM v_org_id THEN
    RETURN QUERY SELECT NULL::integer, false, 'Team hoort niet bij deze organisatie'::text;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    NULL;
  ELSIF v_role = 'player_manager' THEN
    IF v_team_ids IS NULL OR NOT (p_team_id = ANY(v_team_ids)) THEN
      RETURN QUERY SELECT NULL::integer, false, 'Geen toegang tot dit team'::text;
      RETURN;
    END IF;
    IF public.is_player_list_locked(v_org_id) THEN
      RETURN QUERY SELECT NULL::integer, false,
        'Spelerslijst is vergrendeld. Wijzigingen zijn momenteel niet toegestaan.'::text;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::integer, false, 'Onvoldoende rechten'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.team_id = p_team_id
      AND p.first_name = p_first_name
      AND p.last_name = p_last_name
      AND p.birth_date = p_birth_date
  ) THEN
    RETURN QUERY SELECT NULL::integer, false, 'Speler staat al op dit team'::text;
    RETURN;
  END IF;

  INSERT INTO public.players (
    first_name,
    last_name,
    birth_date,
    team_id,
    organization_id
  )
  VALUES (
    p_first_name,
    p_last_name,
    p_birth_date,
    p_team_id,
    v_org_id
  )
  RETURNING public.players.player_id INTO v_new_player_id;

  RETURN QUERY SELECT v_new_player_id, true, 'Speler toegevoegd'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_player_for_session(
  p_session_token uuid,
  p_player_id integer,
  p_first_name character varying,
  p_last_name character varying,
  p_birth_date date
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_role text;
  v_team_ids integer[];
  v_org_id integer;
  v_team_id integer;
BEGIN
  SELECT s.role, s.team_ids, s.organization_id
  INTO v_role, v_team_ids, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_org_id IS NULL THEN
    RETURN QUERY SELECT false, 'Geen actieve sessie'::text;
    RETURN;
  END IF;

  SELECT p.team_id
  INTO v_team_id
  FROM public.players p
  WHERE p.player_id = p_player_id
    AND p.organization_id = v_org_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Speler niet gevonden'::text;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    NULL;
  ELSIF v_role = 'player_manager' THEN
    IF v_team_ids IS NULL OR NOT (v_team_id = ANY(v_team_ids)) THEN
      RETURN QUERY SELECT false, 'Geen toegang tot deze speler'::text;
      RETURN;
    END IF;
    IF public.is_player_list_locked(v_org_id) THEN
      RETURN QUERY SELECT false,
        'Spelerslijst is vergrendeld. Wijzigingen zijn momenteel niet toegestaan.'::text;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT false, 'Onvoldoende rechten'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.team_id = v_team_id
      AND p.first_name = p_first_name
      AND p.last_name = p_last_name
      AND p.birth_date = p_birth_date
      AND p.player_id <> p_player_id
  ) THEN
    RETURN QUERY SELECT false, 'Speler staat al op dit team'::text;
    RETURN;
  END IF;

  UPDATE public.players
  SET first_name = p_first_name,
      last_name = p_last_name,
      birth_date = p_birth_date
  WHERE player_id = p_player_id
    AND organization_id = v_org_id;

  RETURN QUERY SELECT true, 'Speler bijgewerkt'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_player_for_session(
  p_session_token uuid,
  p_player_id integer
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_role text;
  v_team_ids integer[];
  v_org_id integer;
  v_team_id integer;
BEGIN
  SELECT s.role, s.team_ids, s.organization_id
  INTO v_role, v_team_ids, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_org_id IS NULL THEN
    RETURN QUERY SELECT false, 'Geen actieve sessie'::text;
    RETURN;
  END IF;

  SELECT p.team_id
  INTO v_team_id
  FROM public.players p
  WHERE p.player_id = p_player_id
    AND p.organization_id = v_org_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Speler niet gevonden'::text;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    NULL;
  ELSIF v_role = 'player_manager' THEN
    IF v_team_ids IS NULL OR NOT (v_team_id = ANY(v_team_ids)) THEN
      RETURN QUERY SELECT false, 'Geen toegang tot deze speler'::text;
      RETURN;
    END IF;
    IF public.is_player_list_locked(v_org_id) THEN
      RETURN QUERY SELECT false,
        'Spelerslijst is vergrendeld. Wijzigingen zijn momenteel niet toegestaan.'::text;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT false, 'Onvoldoende rechten'::text;
    RETURN;
  END IF;

  DELETE FROM public.players
  WHERE player_id = p_player_id
    AND organization_id = v_org_id;

  RETURN QUERY SELECT true, 'Speler verwijderd'::text;
END;
$function$;
