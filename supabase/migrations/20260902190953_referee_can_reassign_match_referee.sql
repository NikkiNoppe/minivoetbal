-- Last-minute scheids-wissel: bij wijzigen van referee-naam ook assigned_referee_id
-- bijwerken. Scheids mag die swap zelf doen via het wedstrijdformulier.

CREATE OR REPLACE FUNCTION private.resolve_referee_user_id(
  p_username text,
  p_organization_id integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT u.user_id
  FROM public.users u
  WHERE p_username IS NOT NULL
    AND length(trim(p_username)) > 0
    AND lower(trim(u.username)) = lower(trim(p_username))
    AND u.role = 'referee'::public.user_role
    AND (p_organization_id IS NULL OR u.organization_id = p_organization_id)
  ORDER BY CASE WHEN u.organization_id = p_organization_id THEN 0 ELSE 1 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.resolve_referee_user_id(text, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.update_match_for_session(
  p_session_token uuid,
  p_match_id integer,
  p_update_data jsonb
)
RETURNS TABLE(match_id integer, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_user_id integer;
  v_role text;
  v_username text;
  v_team_ids integer[];
  v_org_id integer;
  v_home_team_id integer;
  v_away_team_id integer;
  v_match_org_id integer;
  v_can_update boolean := false;
  v_is_submitted boolean;
  v_new_referee text;
  v_new_assigned_id integer;
  v_sync_assigned boolean := false;
BEGIN
  SELECT s.user_id, s.role, s.username, s.team_ids, s.organization_id
  INTO v_user_id, v_role, v_username, v_team_ids, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_org_id IS NULL THEN
    RETURN QUERY SELECT p_match_id, false, 'Geen actieve sessie'::text;
    RETURN;
  END IF;

  SELECT m.home_team_id, m.away_team_id, m.is_submitted, m.organization_id
  INTO v_home_team_id, v_away_team_id, v_is_submitted, v_match_org_id
  FROM public.matches m
  WHERE m.match_id = p_match_id;

  IF NOT FOUND OR v_home_team_id IS NULL THEN
    RETURN QUERY SELECT p_match_id, false, 'Wedstrijd niet gevonden'::text;
    RETURN;
  END IF;

  IF v_match_org_id IS DISTINCT FROM v_org_id THEN
    RETURN QUERY SELECT p_match_id, false, 'Wedstrijd hoort niet bij deze organisatie'::text;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    v_can_update := true;
  ELSIF v_role = 'player_manager' THEN
    v_can_update := v_team_ids IS NOT NULL
      AND (v_home_team_id = ANY(v_team_ids) OR v_away_team_id = ANY(v_team_ids));
    IF v_can_update AND v_is_submitted = true THEN
      IF p_update_data ? 'home_players' OR p_update_data ? 'away_players' THEN
        RETURN QUERY SELECT p_match_id, false,
          'Spelerslijst kan niet meer gewijzigd worden na indiening. Contacteer een admin.'::text;
        RETURN;
      END IF;
    END IF;
  ELSIF v_role = 'referee' THEN
    v_can_update := EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.match_id = p_match_id
        AND m.organization_id = v_org_id
        AND (m.assigned_referee_id = v_user_id OR m.referee = v_username)
    );
  END IF;

  IF NOT v_can_update THEN
    RETURN QUERY SELECT p_match_id, false, 'Geen toegang tot deze wedstrijd'::text;
    RETURN;
  END IF;

  -- Sync assigned_referee_id wanneer referee-naam wijzigt (last-minute wissel)
  IF p_update_data ? 'assigned_referee_id' THEN
    v_sync_assigned := true;
    IF p_update_data->>'assigned_referee_id' IS NULL
       OR trim(p_update_data->>'assigned_referee_id') = '' THEN
      v_new_assigned_id := NULL;
    ELSE
      v_new_assigned_id := (p_update_data->>'assigned_referee_id')::integer;
    END IF;
  ELSIF p_update_data ? 'referee' THEN
    v_sync_assigned := true;
    v_new_referee := NULLIF(trim(COALESCE(p_update_data->>'referee', '')), '');
    IF v_new_referee IS NULL THEN
      v_new_assigned_id := NULL;
    ELSE
      v_new_assigned_id := private.resolve_referee_user_id(v_new_referee, v_org_id);
      IF v_new_assigned_id IS NULL THEN
        RETURN QUERY SELECT p_match_id, false, 'Onbekende scheidsrechter'::text;
        RETURN;
      END IF;
    END IF;
  END IF;

  IF v_role = 'referee' THEN
    UPDATE public.matches SET
      home_score = CASE WHEN p_update_data ? 'home_score' THEN (p_update_data->>'home_score')::integer ELSE home_score END,
      away_score = CASE WHEN p_update_data ? 'away_score' THEN (p_update_data->>'away_score')::integer ELSE away_score END,
      is_submitted = CASE WHEN p_update_data ? 'is_submitted' THEN (p_update_data->>'is_submitted')::boolean ELSE is_submitted END,
      is_locked = CASE WHEN p_update_data ? 'is_locked' THEN (p_update_data->>'is_locked')::boolean ELSE is_locked END,
      referee = CASE
        WHEN p_update_data ? 'referee' THEN NULLIF(trim(COALESCE(p_update_data->>'referee', '')), '')
        ELSE referee
      END,
      assigned_referee_id = CASE WHEN v_sync_assigned THEN v_new_assigned_id ELSE assigned_referee_id END,
      referee_notes = CASE WHEN p_update_data ? 'referee_notes' THEN p_update_data->>'referee_notes' ELSE referee_notes END,
      home_players = CASE WHEN p_update_data ? 'home_players' THEN (p_update_data->'home_players')::jsonb ELSE home_players END,
      away_players = CASE WHEN p_update_data ? 'away_players' THEN (p_update_data->'away_players')::jsonb ELSE away_players END
    WHERE matches.match_id = p_match_id
      AND matches.organization_id = v_org_id;
    RETURN QUERY SELECT p_match_id, true, 'Wedstrijd succesvol bijgewerkt'::text;
    RETURN;
  END IF;

  UPDATE public.matches SET
    home_score = CASE WHEN p_update_data ? 'home_score' THEN (p_update_data->>'home_score')::integer ELSE home_score END,
    away_score = CASE WHEN p_update_data ? 'away_score' THEN (p_update_data->>'away_score')::integer ELSE away_score END,
    home_players = CASE WHEN p_update_data ? 'home_players' THEN (p_update_data->'home_players')::jsonb ELSE home_players END,
    away_players = CASE WHEN p_update_data ? 'away_players' THEN (p_update_data->'away_players')::jsonb ELSE away_players END,
    is_submitted = CASE WHEN p_update_data ? 'is_submitted' THEN (p_update_data->>'is_submitted')::boolean ELSE is_submitted END,
    is_locked = CASE WHEN p_update_data ? 'is_locked' THEN (p_update_data->>'is_locked')::boolean ELSE is_locked END,
    location = CASE WHEN p_update_data ? 'location' THEN p_update_data->>'location' ELSE location END,
    referee = CASE
      WHEN p_update_data ? 'referee' THEN NULLIF(trim(COALESCE(p_update_data->>'referee', '')), '')
      ELSE referee
    END,
    referee_notes = CASE WHEN p_update_data ? 'referee_notes' THEN p_update_data->>'referee_notes' ELSE referee_notes END,
    assigned_referee_id = CASE WHEN v_sync_assigned THEN v_new_assigned_id ELSE assigned_referee_id END,
    match_date = CASE WHEN p_update_data ? 'match_date' THEN (p_update_data->>'match_date')::timestamptz ELSE match_date END,
    speeldag = CASE WHEN p_update_data ? 'speeldag' THEN p_update_data->>'speeldag' ELSE speeldag END
  WHERE matches.match_id = p_match_id
    AND matches.organization_id = v_org_id;

  RETURN QUERY SELECT p_match_id, true, 'Wedstrijd succesvol bijgewerkt'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_match_for_session(
  p_session_token uuid,
  p_match_id integer,
  p_update_data jsonb
)
RETURNS TABLE(match_id integer, success boolean, message text)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$
  SELECT * FROM private.update_match_for_session(p_session_token, p_match_id, p_update_data);
$$;

REVOKE ALL ON FUNCTION private.update_match_for_session(uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.update_match_for_session(uuid, integer, jsonb) TO anon;
REVOKE ALL ON FUNCTION public.update_match_for_session(uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_match_for_session(uuid, integer, jsonb) TO anon;

COMMENT ON FUNCTION public.update_match_for_session(uuid, integer, jsonb) IS
  'Wedstrijd bijwerken; scheids mag referee + assigned_referee_id omzetten (last-minute wissel).';
