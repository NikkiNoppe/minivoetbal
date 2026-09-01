-- Per-admin afhandeling scheidsnotities (sync laptop/gsm), tenant-scoped.

CREATE TABLE IF NOT EXISTS public.admin_referee_note_acknowledgements (
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  match_id integer NOT NULL REFERENCES public.matches(match_id) ON DELETE CASCADE,
  note_fingerprint text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_referee_note_acks_org_user
  ON public.admin_referee_note_acknowledgements (organization_id, user_id);

ALTER TABLE public.admin_referee_note_acknowledgements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_referee_note_acknowledgements FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_referee_note_acknowledgements TO service_role;

CREATE OR REPLACE FUNCTION private.clean_referee_note_for_fingerprint(p_notes text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  line text;
  result text := '';
BEGIN
  IF p_notes IS NULL THEN
    RETURN '';
  END IF;

  FOR line IN SELECT unnest(string_to_array(p_notes, E'\n'))
  LOOP
    IF NOT (trim(line) LIKE '⚠️ BOETE:%') THEN
      IF result <> '' THEN
        result := result || E'\n';
      END IF;
      result := result || line;
    END IF;
  END LOOP;

  RETURN trim(result);
END;
$function$;

CREATE OR REPLACE FUNCTION private.referee_note_fingerprint(p_notes text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT encode(digest(private.clean_referee_note_for_fingerprint(p_notes), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_referee_note_acks(p_session_token uuid)
 RETURNS TABLE(match_id integer, note_fingerprint text, acknowledged_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_user_id integer;
  v_role text;
  v_org_id integer;
BEGIN
  SELECT s.user_id, s.role, s.organization_id
  INTO v_user_id, v_role, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS DISTINCT FROM 'admin' OR v_org_id IS NULL OR v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.match_id,
    a.note_fingerprint,
    a.acknowledged_at
  FROM public.admin_referee_note_acknowledgements a
  WHERE a.organization_id = v_org_id
    AND a.user_id = v_user_id
  ORDER BY a.acknowledged_at DESC;
END;
$function$;

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

REVOKE ALL ON FUNCTION public.get_admin_referee_note_acks(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_referee_note_ack(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_referee_note_acks(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_referee_note_ack(uuid, integer, boolean) TO anon, authenticated;

COMMENT ON TABLE public.admin_referee_note_acknowledgements IS
  'Per admin: afgehandelde scheidsnotities (sync over devices), scoped op organization_id.';
