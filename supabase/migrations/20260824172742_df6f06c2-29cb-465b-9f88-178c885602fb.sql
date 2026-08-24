CREATE OR REPLACE FUNCTION private.get_latest_season_backup_for_session(p_session_token uuid, p_season_label text DEFAULT '2025-2026'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_user_id integer;
  v_role text;
  v_org_id integer;
  v_row jsonb;
  v_label text;
  v_name text;
BEGIN
  SELECT s.user_id, s.role, s.organization_id
  INTO v_user_id, v_role, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_user_id IS DISTINCT FROM -1 OR v_role IS DISTINCT FROM 'admin' OR v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alleen SuperAdmin');
  END IF;

  v_name := trim(COALESCE(p_season_label, '')) || '-interim-latest';

  SELECT setting_value INTO v_row
  FROM public.application_settings
  WHERE organization_id = v_org_id
    AND setting_category = 'season_backups'
    AND setting_name = v_name
  LIMIT 1;

  -- Fallback: meest recente backup van deze organisatie, ongeacht label
  IF v_row IS NULL THEN
    SELECT setting_value INTO v_row
    FROM public.application_settings
    WHERE organization_id = v_org_id
      AND setting_category = 'season_backups'
    ORDER BY (setting_value->>'exported_at')::timestamptz DESC NULLS LAST, id DESC
    LIMIT 1;
  END IF;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nog geen tussentijdse backup gevonden. Klik eerst op "Tussentijds bewaren".'
    );
  END IF;

  v_label := COALESCE(NULLIF(trim(v_row->>'season_label'), ''), trim(COALESCE(p_season_label, 'seizoen')));

  RETURN jsonb_build_object(
    'success', true,
    'season_label', v_label,
    'full_export', v_row->'full_export',
    'exported_at', v_row->>'exported_at',
    'download_filename', COALESCE(
      (SELECT slug FROM public.organizations WHERE id = v_org_id),
      'org'
    ) || '-seizoen-' || v_label || '-backup-latest.json'
  );
END;
$function$;