-- Scheidsrechter + admin: spelers van de actieve org altijd leesbaar (wedstrijdformulier).
-- public.get_players_for_session (org-scope, 20260709) miste de referee-tak;
-- private had referee maar zonder organization_id. Gelijkgetrokken met get_teams_for_session.

CREATE OR REPLACE FUNCTION private.get_players_for_session(
  p_session_token uuid,
  p_team_id integer DEFAULT NULL
)
RETURNS TABLE(
  player_id integer,
  first_name character varying,
  last_name character varying,
  birth_date date,
  team_id integer,
  yellow_cards integer,
  red_cards integer,
  suspended_matches_remaining integer
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

  IF v_role IN ('admin', 'referee', 'super_admin', 'superadmin') THEN
    RETURN QUERY
    SELECT p.player_id, p.first_name, p.last_name, p.birth_date, p.team_id,
           COALESCE(p.yellow_cards, 0), COALESCE(p.red_cards, 0),
           COALESCE(p.suspended_matches_remaining, 0)
    FROM public.players p
    WHERE p.organization_id = v_org_id
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
    ORDER BY p.last_name, p.first_name;
    RETURN;
  END IF;

  IF v_role = 'player_manager' THEN
    IF v_team_ids IS NULL OR array_length(v_team_ids, 1) IS NULL THEN
      RETURN;
    END IF;

    IF p_team_id IS NOT NULL AND NOT (p_team_id = ANY(v_team_ids)) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT p.player_id, p.first_name, p.last_name, p.birth_date, p.team_id,
           COALESCE(p.yellow_cards, 0), COALESCE(p.red_cards, 0),
           COALESCE(p.suspended_matches_remaining, 0)
    FROM public.players p
    INNER JOIN public.teams t ON t.team_id = p.team_id
    WHERE p.team_id = ANY(v_team_ids)
      AND t.organization_id = v_org_id
      AND p.organization_id = v_org_id
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
    ORDER BY p.last_name, p.first_name;
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_players_for_session(
  p_session_token uuid,
  p_team_id integer DEFAULT NULL
)
RETURNS TABLE(
  player_id integer,
  first_name character varying,
  last_name character varying,
  birth_date date,
  team_id integer,
  yellow_cards integer,
  red_cards integer,
  suspended_matches_remaining integer
)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$
  SELECT * FROM private.get_players_for_session(p_session_token, p_team_id);
$$;

REVOKE ALL ON FUNCTION private.get_players_for_session(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_players_for_session(uuid, integer) TO anon;
REVOKE ALL ON FUNCTION public.get_players_for_session(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_players_for_session(uuid, integer) TO anon;

COMMENT ON FUNCTION public.get_players_for_session(uuid, integer) IS
  'Spelers voor sessie: admin/scheids alle spelers in org; team manager alleen eigen teams.';
