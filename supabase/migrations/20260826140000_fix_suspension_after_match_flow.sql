-- Fix automatic suspensions after match submit:
-- 1) Trigger was missing on production (functions existed, never fired)
-- 2) apply_suspension used dropped is_active column + only first yellow threshold (+1 always)
-- 3) Card recount must run before yellow threshold checks
-- 4) Manual suspension RPC checks still referenced is_active

-- ---------------------------------------------------------------------------
-- apply_suspension_after_match: org rules, threshold crossing, red default
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_suspension_after_match(match_id_param integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  match_record RECORD;
  player_record RECORD;
  rules_json jsonb;
  red_card_suspension integer := 1;
  yellow_total integer;
  yellows_this_match integer;
  prev_yellow integer;
  rule_item jsonb;
  threshold integer;
  rule_matches integer;
BEGIN
  SELECT
    m.home_players,
    m.away_players,
    m.is_submitted,
    m.organization_id
  INTO match_record
  FROM public.matches m
  WHERE m.match_id = match_id_param;

  IF NOT FOUND OR NOT match_record.is_submitted THEN
    RETURN;
  END IF;

  SELECT s.setting_value
  INTO rules_json
  FROM public.application_settings s
  WHERE s.setting_category = 'suspension_rules'
    AND s.setting_name = 'default_rules'
    AND (
      match_record.organization_id IS NULL
      OR s.organization_id = match_record.organization_id
    )
  ORDER BY CASE WHEN s.organization_id = match_record.organization_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF rules_json IS NOT NULL THEN
    red_card_suspension := COALESCE(
      (rules_json->'red_card_rules'->>'default_suspension_matches')::integer,
      1
    );
  END IF;

  FOR player_record IN
    SELECT
      side.team_side,
      (COALESCE(player->>'playerId', player->>'player_id', player->>'id'))::integer AS player_id,
      LOWER(COALESCE(
        player->>'cardType',
        player->>'card',
        player->>'card_type',
        player->>'kaart',
        'none'
      )) AS card_type
    FROM (
      SELECT match_record.home_players AS players, 'home'::text AS team_side
      UNION ALL
      SELECT match_record.away_players, 'away'
    ) side
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(side.players, '[]'::jsonb)) AS player
    WHERE COALESCE(player->>'playerId', player->>'player_id', player->>'id') IS NOT NULL
      AND LOWER(COALESCE(
        player->>'cardType',
        player->>'card',
        player->>'card_type',
        player->>'kaart',
        'none'
      )) NOT IN ('none', '')
  LOOP
    -- Rood: schorsing voor volgende N wedstrijden (teller)
    IF player_record.card_type IN ('red', 'rood') THEN
      UPDATE public.players
      SET suspended_matches_remaining =
        COALESCE(suspended_matches_remaining, 0) + red_card_suspension
      WHERE player_id = player_record.player_id;
      CONTINUE;
    END IF;

    -- Geel / 2x geel: alleen bij overschrijden van een drempel
    IF player_record.card_type IN (
      'yellow', 'geel', 'double_yellow', '2x geel', 'double-yellow'
    ) THEN
      yellows_this_match := CASE
        WHEN player_record.card_type IN ('double_yellow', '2x geel', 'double-yellow') THEN 2
        ELSE 1
      END;

      SELECT COALESCE(p.yellow_cards, 0)
      INTO yellow_total
      FROM public.players p
      WHERE p.player_id = player_record.player_id;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      prev_yellow := GREATEST(0, yellow_total - yellows_this_match);

      IF rules_json IS NOT NULL AND jsonb_typeof(rules_json->'yellow_card_rules') = 'array' THEN
        FOR rule_item IN
          SELECT value
          FROM jsonb_array_elements(rules_json->'yellow_card_rules')
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
             AND yellow_total >= threshold
          THEN
            UPDATE public.players
            SET suspended_matches_remaining =
              COALESCE(suspended_matches_remaining, 0) + rule_matches
            WHERE player_id = player_record.player_id;
          END IF;
        END LOOP;
      ELSE
        -- Fallback: 2→1
        IF prev_yellow < 2 AND yellow_total >= 2 THEN
          UPDATE public.players
          SET suspended_matches_remaining =
            COALESCE(suspended_matches_remaining, 0) + 1
          WHERE player_id = player_record.player_id;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- reduce: first submit only — recount cards, serve existing, apply new
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reduce_suspension_after_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_submitted = true AND OLD.is_submitted = false THEN
    -- Kaartentellers eerst bijwerken (gele drempels gebruiken actuele totalen)
    PERFORM public.update_player_cards();

    -- Bestaande schorsing "uitzitten" voor ALLE spelers van beide ploegen
    -- (speler hoeft niet in selectie te staan)
    UPDATE public.players
    SET suspended_matches_remaining = GREATEST(0, suspended_matches_remaining - 1)
    WHERE team_id = NEW.home_team_id
      AND COALESCE(suspended_matches_remaining, 0) > 0;

    UPDATE public.players
    SET suspended_matches_remaining = GREATEST(0, suspended_matches_remaining - 1)
    WHERE team_id = NEW.away_team_id
      AND COALESCE(suspended_matches_remaining, 0) > 0;

    -- Nieuwe schorsingen uit deze wedstrijd (starten vanaf volgende)
    PERFORM public.apply_suspension_after_match(NEW.match_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger opnieuw aanhangen (ontbrak op remote)
DROP TRIGGER IF EXISTS trigger_process_suspensions ON public.matches;
CREATE TRIGGER trigger_process_suspensions
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.reduce_suspension_after_match();

-- Cards-trigger: skip second full recount when suspensions already recounted on first submit
CREATE OR REPLACE FUNCTION public.trigger_update_player_cards()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_submitted = true AND (
    OLD.is_submitted = false
    OR OLD.home_players IS DISTINCT FROM NEW.home_players
    OR OLD.away_players IS DISTINCT FROM NEW.away_players
  ) THEN
    -- Op eerste submit doet reduce_suspension_after_match al update_player_cards()
    -- (alfabetisch vóór deze trigger). Alleen her-tellen bij latere kaartwijzigingen.
    IF NOT (NEW.is_submitted = true AND OLD.is_submitted = false) THEN
      PERFORM public.update_player_cards();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Eligibility RPCs: is_active column dropped from application_settings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_player_suspended(
  p_session_token uuid,
  player_id_param integer,
  match_date_param timestamp with time zone
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, private
AS $function$
DECLARE
  v_role text;
  suspension_count integer;
  player_cards RECORD;
BEGIN
  SELECT s.role INTO v_role
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_role = '' THEN
    RETURN NULL;
  END IF;

  SELECT yellow_cards, red_cards, suspended_matches_remaining
  INTO player_cards
  FROM public.players
  WHERE player_id = player_id_param;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(player_cards.suspended_matches_remaining, 0) > 0 THEN
    RETURN true;
  END IF;

  SELECT COUNT(*) INTO suspension_count
  FROM public.application_settings
  WHERE setting_category = 'manual_suspensions'
    AND setting_name = player_id_param::text
    AND (setting_value->>'end_date')::timestamptz >= match_date_param;

  RETURN suspension_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION private.check_batch_players_suspended(
  p_session_token uuid,
  player_ids integer[],
  match_date_param timestamp with time zone
)
RETURNS TABLE(player_id integer, is_suspended boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, private
AS $$
DECLARE
  v_role text;
  player_record RECORD;
  suspension_count integer;
  player_cards RECORD;
BEGIN
  SELECT s.role INTO v_role
  FROM private.resolve_app_session(p_session_token) s
  LIMIT 1;

  IF v_role IS NULL OR v_role = '' THEN
    RETURN;
  END IF;

  FOR player_record IN
    SELECT unnest(player_ids) AS pid
  LOOP
    SELECT yellow_cards, red_cards, suspended_matches_remaining
    INTO player_cards
    FROM public.players
    WHERE public.players.player_id = player_record.pid;

    IF NOT FOUND THEN
      player_id := player_record.pid;
      is_suspended := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF COALESCE(player_cards.suspended_matches_remaining, 0) > 0 THEN
      player_id := player_record.pid;
      is_suspended := true;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO suspension_count
    FROM public.application_settings
    WHERE setting_category = 'manual_suspensions'
      AND setting_name = player_record.pid::text
      AND (setting_value->>'end_date')::timestamptz >= match_date_param;

    player_id := player_record.pid;
    is_suspended := suspension_count > 0;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_suspension_after_match(integer) IS
  'Na indienen wedstrijd: rode/gele drempels → suspended_matches_remaining (geldt vanaf volgende wedstrijd).';
COMMENT ON FUNCTION public.reduce_suspension_after_match() IS
  'Op first submit: kaartentellers, -1 voor actieve schorsingen beide teams, daarna nieuwe schorsingen.';
