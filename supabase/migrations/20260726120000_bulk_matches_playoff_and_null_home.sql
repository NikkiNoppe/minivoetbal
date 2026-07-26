-- bulk_manage_matches_for_session: play-offkolommen + null home voor beker/play-off placeholders.
-- organization_id komt altijd uit de sessie (Kuurne = 2, Harelbeke = 1).

CREATE OR REPLACE FUNCTION private.bulk_manage_matches_for_session(
  p_session_token uuid,
  p_operation text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_role text;
  v_org_id integer;
  v_rows integer := 0;
  v_item jsonb;
  v_home_id integer;
  v_away_id integer;
  v_home_org integer;
  v_away_org integer;
  v_is_cup boolean;
  v_is_playoff boolean;
BEGIN
  SELECT s.role, s.organization_id
  INTO v_role, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_role <> 'admin' OR v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alleen admins');
  END IF;

  IF p_operation IN (
    'delete_by_unique_numbers',
    'delete_by_match_ids',
    'delete_competition',
    'delete_cup'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      'Wedstrijden mogen niet hard verwijderd worden. Sluit eerst het seizoen af via SuperAdmin → Platform → Seizoen afsluiten.'
    );
  END IF;

  IF p_operation = 'insert' THEN
    IF jsonb_typeof(p_payload) <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'error', 'payload moet een array zijn');
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload)
    LOOP
      v_home_id := NULLIF(v_item->>'home_team_id', '')::integer;
      v_away_id := NULLIF(v_item->>'away_team_id', '')::integer;
      v_is_cup := COALESCE((v_item->>'is_cup_match')::boolean, false);
      v_is_playoff := COALESCE((v_item->>'is_playoff_match')::boolean, false);
      v_home_org := NULL;
      v_away_org := NULL;

      IF v_home_id IS NULL THEN
        -- Placeholder-wedstrijden (latere bekerronde / play-off concept) zonder team-id
        IF NOT v_is_cup AND NOT v_is_playoff THEN
          RETURN jsonb_build_object(
            'success', false,
            'error',
            'home_team_id is verplicht voor competitiewedstrijden'
          );
        END IF;
      ELSE
        SELECT t.organization_id INTO v_home_org
        FROM public.teams t
        WHERE t.team_id = v_home_id;

        IF v_home_org IS DISTINCT FROM v_org_id THEN
          RETURN jsonb_build_object(
            'success', false,
            'error',
            'Wedstrijd hoort niet bij actieve organisatie'
          );
        END IF;
      END IF;

      IF v_away_id IS NOT NULL THEN
        SELECT t.organization_id INTO v_away_org
        FROM public.teams t
        WHERE t.team_id = v_away_id;

        IF v_away_org IS DISTINCT FROM v_org_id THEN
          RETURN jsonb_build_object(
            'success', false,
            'error',
            'Uitploeg hoort niet bij actieve organisatie'
          );
        END IF;
      END IF;

      INSERT INTO public.matches (
        unique_number,
        speeldag,
        home_team_id,
        away_team_id,
        match_date,
        location,
        is_cup_match,
        is_submitted,
        is_locked,
        home_score,
        away_score,
        organization_id,
        is_playoff_match,
        is_playoff_finalized,
        home_position,
        away_position,
        playoff_type
      ) VALUES (
        v_item->>'unique_number',
        v_item->>'speeldag',
        v_home_id,
        v_away_id,
        (v_item->>'match_date')::timestamptz,
        v_item->>'location',
        v_is_cup,
        COALESCE((v_item->>'is_submitted')::boolean, false),
        COALESCE((v_item->>'is_locked')::boolean, false),
        NULLIF(v_item->>'home_score', '')::integer,
        NULLIF(v_item->>'away_score', '')::integer,
        v_org_id,
        v_is_playoff,
        COALESCE((v_item->>'is_playoff_finalized')::boolean, false),
        NULLIF(v_item->>'home_position', '')::integer,
        NULLIF(v_item->>'away_position', '')::integer,
        NULLIF(v_item->>'playoff_type', '')
      );
      v_rows := v_rows + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'inserted', v_rows);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Onbekende operatie');
END;
$$;
