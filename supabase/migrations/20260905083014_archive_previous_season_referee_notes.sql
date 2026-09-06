-- Vorig seizoen: scheidsnotities blijven in DB (archief) maar niet meer in actieve admin-lijst.
-- Actieve lijst = alleen huidig seizoen (season_label IS NULL).

CREATE OR REPLACE FUNCTION private.get_admin_referee_notes_for_session(p_session_token uuid)
RETURNS TABLE(
  match_id integer,
  match_date timestamptz,
  referee_notes text,
  referee text,
  speeldag text,
  home_team_name text,
  away_team_name text,
  note_fingerprint text,
  season_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions'
AS $$
DECLARE
  v_role text;
  v_org_id integer;
BEGIN
  IF p_session_token IS NULL THEN
    RETURN;
  END IF;

  SELECT s.role, s.organization_id
  INTO v_role, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS DISTINCT FROM 'admin' OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.match_id,
    m.match_date,
    private.clean_referee_note_for_fingerprint(m.referee_notes)::text AS referee_notes,
    m.referee::text,
    m.speeldag::text,
    COALESCE(ht.team_name, '?')::text AS home_team_name,
    COALESCE(at.team_name, '?')::text AS away_team_name,
    private.referee_note_fingerprint(m.referee_notes)::text AS note_fingerprint,
    m.season_label::text
  FROM public.matches m
  LEFT JOIN public.teams ht ON ht.team_id = m.home_team_id
  LEFT JOIN public.teams at ON at.team_id = m.away_team_id
  WHERE m.organization_id = v_org_id
    AND m.season_label IS NULL
    AND COALESCE(m.is_submitted, false) = true
    AND m.referee_notes IS NOT NULL
    AND private.clean_referee_note_for_fingerprint(m.referee_notes) <> ''
  ORDER BY m.match_date DESC;
END;
$$;

COMMENT ON FUNCTION private.get_admin_referee_notes_for_session(uuid) IS
  'Actieve admin-scheidsnotities huidig seizoen (season_label IS NULL). Gearchiveerde seizoenen buiten scope.';
