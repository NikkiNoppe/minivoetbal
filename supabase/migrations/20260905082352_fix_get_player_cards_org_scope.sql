-- Fix: private.get_player_cards_for_admin had geen organization_id-filter
-- → Harelbeke-admins zagen Kuurne-spelers (Frituur De Beke, IG Vloerwerken, …).
-- Scope op sessie-org (SuperAdmin via acting_organization_id).

CREATE OR REPLACE FUNCTION private.get_player_cards_for_admin(p_session_token uuid)
RETURNS TABLE(
  player_id integer,
  first_name character varying,
  last_name character varying,
  team_id integer,
  team_name character varying,
  yellow_cards integer,
  red_cards integer,
  suspended_matches_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_user_id integer;
  v_role text;
  v_team_ids integer[];
  v_org_id integer;
BEGIN
  IF p_session_token IS NULL THEN
    RETURN;
  END IF;

  SELECT s.user_id, s.role, s.team_ids, s.organization_id
  INTO v_user_id, v_role, v_team_ids, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF v_role IN ('admin', 'superadmin', 'super_admin') THEN
    RETURN QUERY
    SELECT
      p.player_id,
      p.first_name,
      p.last_name,
      p.team_id,
      t.team_name,
      COALESCE(p.yellow_cards, 0),
      COALESCE(p.red_cards, 0),
      COALESCE(p.suspended_matches_remaining, 0)
    FROM public.players p
    LEFT JOIN public.teams t ON t.team_id = p.team_id
    WHERE p.organization_id = v_org_id
      AND (t.team_id IS NULL OR t.organization_id = v_org_id)
    ORDER BY COALESCE(p.yellow_cards, 0) DESC NULLS LAST, p.last_name, p.first_name;
    RETURN;
  END IF;

  IF v_role = 'player_manager' THEN
    IF v_team_ids IS NULL OR array_length(v_team_ids, 1) IS NULL THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      p.player_id,
      p.first_name,
      p.last_name,
      p.team_id,
      t.team_name,
      COALESCE(p.yellow_cards, 0),
      COALESCE(p.red_cards, 0),
      COALESCE(p.suspended_matches_remaining, 0)
    FROM public.players p
    LEFT JOIN public.teams t ON t.team_id = p.team_id
    WHERE p.team_id = ANY(v_team_ids)
      AND p.organization_id = v_org_id
      AND (t.team_id IS NULL OR t.organization_id = v_org_id)
    ORDER BY COALESCE(p.yellow_cards, 0) DESC NULLS LAST, p.last_name, p.first_name;
    RETURN;
  END IF;
END;
$$;

-- Public INVOKER-wrapper → private DEFINER (lint 0028)
SELECT private.create_public_invoker_wrapper(
  'private.get_player_cards_for_admin(uuid)'::regprocedure
);

REVOKE ALL ON FUNCTION public.get_player_cards_for_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_cards_for_admin(uuid) TO anon, authenticated;

COMMENT ON FUNCTION private.get_player_cards_for_admin(uuid) IS
  'Kaartenoverzicht binnen actieve tenant; SuperAdmin via acting_organization_id.';
COMMENT ON FUNCTION public.get_player_cards_for_admin(uuid) IS
  'INVOKER wrapper → private.get_player_cards_for_admin (org-scoped).';
