-- Herbereken automatic remaining vanuit kaarten + org-regels.
-- Kuurne-rood werd geteld maar apply_suspension liep niet na latere kaart-edit
-- (alleen bij eerste submit). Daardoor bleven spelers selecteerbaar.

CREATE OR REPLACE FUNCTION private.recalculate_automatic_suspensions(p_organization_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules_json jsonb;
  red_matches integer := 1;
  player_rec RECORD;
  match_rec RECORD;
  card_rec RECORD;
  roster jsonb;
  v_remaining integer;
  v_yellow integer;
  yellows_this integer;
  prev_yellow integer;
  rule_item jsonb;
  threshold integer;
  rule_matches integer;
  v_updated integer := 0;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT s.setting_value
  INTO rules_json
  FROM public.application_settings s
  WHERE s.organization_id = p_organization_id
    AND s.setting_category = 'suspension_rules'
    AND s.setting_name = 'default_rules'
  LIMIT 1;

  IF rules_json IS NOT NULL THEN
    red_matches := COALESCE(
      (rules_json->'red_card_rules'->>'default_suspension_matches')::integer,
      1
    );
  END IF;

  FOR player_rec IN
    SELECT p.player_id, p.team_id
    FROM public.players p
    WHERE p.organization_id = p_organization_id
      AND p.team_id IS NOT NULL
      AND (
        COALESCE(p.red_cards, 0) > 0
        OR COALESCE(p.yellow_cards, 0) > 0
        OR COALESCE(p.suspended_matches_remaining, 0) > 0
      )
  LOOP
    v_remaining := 0;
    v_yellow := 0;

    FOR match_rec IN
      SELECT
        m.match_id,
        m.match_date,
        m.home_team_id,
        m.away_team_id,
        m.home_players,
        m.away_players
      FROM public.matches m
      WHERE m.organization_id = p_organization_id
        AND m.is_submitted = true
        AND m.season_label IS NULL
        AND (m.home_team_id = player_rec.team_id OR m.away_team_id = player_rec.team_id)
      ORDER BY m.match_date, m.match_id
    LOOP
      IF v_remaining > 0 THEN
        v_remaining := v_remaining - 1;
      END IF;

      roster := CASE
        WHEN match_rec.home_team_id = player_rec.team_id THEN
          CASE WHEN jsonb_typeof(match_rec.home_players) = 'array' THEN match_rec.home_players ELSE '[]'::jsonb END
        ELSE
          CASE WHEN jsonb_typeof(match_rec.away_players) = 'array' THEN match_rec.away_players ELSE '[]'::jsonb END
      END;

      FOR card_rec IN
        SELECT LOWER(COALESCE(
          player->>'cardType',
          player->>'card',
          player->>'card_type',
          player->>'kaart',
          'none'
        )) AS card_type
        FROM jsonb_array_elements(roster) AS player
        WHERE COALESCE(player->>'playerId', player->>'player_id', player->>'id') ~ '^[0-9]+$'
          AND COALESCE(player->>'playerId', player->>'player_id', player->>'id')::integer = player_rec.player_id
          AND LOWER(COALESCE(
            player->>'cardType',
            player->>'card',
            player->>'card_type',
            player->>'kaart',
            'none'
          )) NOT IN ('none', '')
      LOOP
        IF card_rec.card_type IN ('red', 'rood') THEN
          v_remaining := v_remaining + red_matches;
        ELSIF card_rec.card_type IN (
          'yellow', 'geel', 'double_yellow', '2x geel', 'double-yellow'
        ) THEN
          yellows_this := CASE
            WHEN card_rec.card_type IN ('double_yellow', '2x geel', 'double-yellow') THEN 2
            ELSE 1
          END;
          prev_yellow := v_yellow;
          v_yellow := v_yellow + yellows_this;

          IF rules_json IS NOT NULL AND jsonb_typeof(rules_json->'yellow_card_rules') = 'array' THEN
            FOR rule_item IN
              SELECT value FROM jsonb_array_elements(rules_json->'yellow_card_rules')
            LOOP
              threshold := COALESCE(
                (rule_item->>'card_count')::integer,
                (rule_item->>'min_cards')::integer,
                0
              );
              rule_matches := COALESCE((rule_item->>'suspension_matches')::integer, 0);

              IF threshold > 0
                 AND rule_matches > 0
                 AND prev_yellow < threshold
                 AND v_yellow >= threshold
              THEN
                v_remaining := v_remaining + rule_matches;
              END IF;
            END LOOP;
          ELSIF prev_yellow < 2 AND v_yellow >= 2 THEN
            v_remaining := v_remaining + 1;
          END IF;
        END IF;
      END LOOP;
    END LOOP;

    UPDATE public.players
    SET suspended_matches_remaining = v_remaining
    WHERE player_id = player_rec.player_id
      AND COALESCE(suspended_matches_remaining, 0) IS DISTINCT FROM v_remaining;

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION private.recalculate_automatic_suspensions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.recalculate_automatic_suspensions(integer) TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.recalculate_automatic_suspensions_for_session(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_role text;
  v_org_id integer;
  v_updated integer;
BEGIN
  SELECT s.role, s.organization_id
  INTO v_role, v_org_id
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_role <> 'admin' OR v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alleen admins');
  END IF;

  v_updated := private.recalculate_automatic_suspensions(v_org_id);
  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

SELECT private.create_public_invoker_wrapper(
  'private.recalculate_automatic_suspensions_for_session(uuid)'::regprocedure
);

REVOKE ALL ON FUNCTION public.recalculate_automatic_suspensions_for_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_automatic_suspensions_for_session(uuid) TO anon, authenticated;

COMMENT ON FUNCTION private.recalculate_automatic_suspensions(integer) IS
  'Zet suspended_matches_remaining per org vanuit ingediende kaarten en schorsingsregels.';

CREATE OR REPLACE FUNCTION public.trigger_update_player_cards()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NEW.is_submitted = true AND (
    OLD.is_submitted = false
    OR OLD.home_players IS DISTINCT FROM NEW.home_players
    OR OLD.away_players IS DISTINCT FROM NEW.away_players
  ) THEN
    -- Eerste submit: reduce_suspension_after_match doet recount + apply.
    -- Latere kaartwijziging: recount + herbereken remaining (anders rood zonder schorsing).
    IF NOT (NEW.is_submitted = true AND OLD.is_submitted = false) THEN
      PERFORM public.update_player_cards();
      IF NEW.organization_id IS NOT NULL THEN
        PERFORM private.recalculate_automatic_suspensions(NEW.organization_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Kuurne: bestaande rode kaarten (nog geen volgende ingediende wedstrijd) krijgen nu remaining.
SELECT private.recalculate_automatic_suspensions(2);
