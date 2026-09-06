-- Scheidsnotities verdwenen na seizoensarchief: get_matches_for_forms filtert
-- season_label IS NULL, terwijl alle notities op season_label = '2025-2026' staan.
-- Dedicated admin-RPC: org-scoped, inclusief gearchiveerde seizoenen.
-- SuperAdmin (user_id = -1) bestaat niet in users → FK blokkeerde acks.

ALTER TABLE public.admin_referee_note_acknowledgements
  DROP CONSTRAINT IF EXISTS admin_referee_note_acknowledgements_user_id_fkey;

COMMENT ON COLUMN public.admin_referee_note_acknowledgements.user_id IS
  'Admin user_id; SuperAdmin = -1 (geen FK naar users).';

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
SET search_path TO 'public', 'private'
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
    AND COALESCE(m.is_submitted, false) = true
    AND m.referee_notes IS NOT NULL
    AND private.clean_referee_note_for_fingerprint(m.referee_notes) <> ''
  ORDER BY m.match_date DESC;
END;
$$;

SELECT private.create_public_invoker_wrapper(
  'private.get_admin_referee_notes_for_session(uuid)'::regprocedure
);

REVOKE ALL ON FUNCTION public.get_admin_referee_notes_for_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_referee_notes_for_session(uuid) TO anon, authenticated;

-- Ack mag ook op gearchiveerde seizoenen (geen season_label-filter)
CREATE OR REPLACE FUNCTION public.set_admin_referee_note_ack(
  p_session_token uuid,
  p_match_id integer,
  p_acknowledged boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_user_id integer;
  v_role text;
  v_org_id integer;
  v_notes text;
  v_fp text;
BEGIN
  SELECT s.user_id, s.role, s.organization_id
  INTO v_user_id, v_role, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS DISTINCT FROM 'admin' OR v_org_id IS NULL OR v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alleen admins');
  END IF;

  IF p_match_id IS NULL OR p_match_id <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ongeldige wedstrijd');
  END IF;

  IF COALESCE(p_acknowledged, true) = false THEN
    DELETE FROM public.admin_referee_note_acknowledgements a
    WHERE a.organization_id = v_org_id
      AND a.user_id = v_user_id
      AND a.match_id = p_match_id;

    RETURN jsonb_build_object('success', true, 'acknowledged', false);
  END IF;

  SELECT m.referee_notes
  INTO v_notes
  FROM public.matches m
  WHERE m.match_id = p_match_id
    AND m.organization_id = v_org_id
    AND COALESCE(m.is_submitted, false) = true
  LIMIT 1;

  IF v_notes IS NULL OR private.clean_referee_note_for_fingerprint(v_notes) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geen scheidsnotitie voor deze wedstrijd');
  END IF;

  v_fp := private.referee_note_fingerprint(v_notes);

  INSERT INTO public.admin_referee_note_acknowledgements (
    organization_id,
    user_id,
    match_id,
    note_fingerprint,
    acknowledged_at
  )
  VALUES (v_org_id, v_user_id, p_match_id, v_fp, now())
  ON CONFLICT (organization_id, user_id, match_id)
  DO UPDATE SET
    note_fingerprint = EXCLUDED.note_fingerprint,
    acknowledged_at = EXCLUDED.acknowledged_at;

  RETURN jsonb_build_object(
    'success', true,
    'acknowledged', true,
    'match_id', p_match_id,
    'note_fingerprint', v_fp
  );
END;
$function$;

COMMENT ON FUNCTION private.get_admin_referee_notes_for_session(uuid) IS
  'Admin scheidsnotities (echte tekst, geen BOETE-only) voor actieve org, inclusief gearchiveerde seizoenen.';
