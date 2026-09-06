-- Teammanagers konden manual_suspensions niet lezen (manage_application_settings = admin-only).
-- Read-RPC: admin = hele org; player_manager = spelers van eigen teams.

CREATE OR REPLACE FUNCTION private.get_manual_suspensions_for_session(p_session_token uuid)
RETURNS TABLE(
  id integer,
  player_id integer,
  setting_value jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_role text;
  v_team_ids integer[];
  v_org_id integer;
BEGIN
  IF p_session_token IS NULL THEN
    RETURN;
  END IF;

  SELECT s.role, s.team_ids, s.organization_id
  INTO v_role, v_team_ids, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF v_role IN ('admin', 'superadmin', 'super_admin') THEN
    RETURN QUERY
    SELECT
      a.id,
      NULLIF(a.setting_name, '')::integer AS player_id,
      a.setting_value
    FROM public.application_settings a
    WHERE a.organization_id = v_org_id
      AND a.setting_category = 'manual_suspensions'
      AND a.setting_name ~ '^[0-9]+$'
    ORDER BY a.id DESC;
    RETURN;
  END IF;

  IF v_role = 'player_manager' THEN
    IF v_team_ids IS NULL OR cardinality(v_team_ids) = 0 THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      a.id,
      NULLIF(a.setting_name, '')::integer AS player_id,
      a.setting_value
    FROM public.application_settings a
    INNER JOIN public.players p
      ON p.player_id = NULLIF(a.setting_name, '')::integer
     AND p.organization_id = v_org_id
    WHERE a.organization_id = v_org_id
      AND a.setting_category = 'manual_suspensions'
      AND a.setting_name ~ '^[0-9]+$'
      AND p.team_id = ANY(v_team_ids)
    ORDER BY a.id DESC;
    RETURN;
  END IF;
END;
$$;

SELECT private.create_public_invoker_wrapper(
  'private.get_manual_suspensions_for_session(uuid)'::regprocedure
);

REVOKE ALL ON FUNCTION public.get_manual_suspensions_for_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_manual_suspensions_for_session(uuid) TO anon, authenticated;

COMMENT ON FUNCTION private.get_manual_suspensions_for_session(uuid) IS
  'Handmatige schorsingen voor actieve org; team managers alleen eigen teams.';
