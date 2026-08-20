-- Login: trim + case-insensitive username/e-mail, duidelijke rate-limit fout.
-- Geen stille lege return bij te veel pogingen (dat leek op verkeerd wachtwoord).

CREATE OR REPLACE FUNCTION public.login_user(
  input_username_or_email text,
  input_password text,
  p_organization_id integer DEFAULT NULL
)
RETURNS TABLE(
  user_id integer,
  username character varying,
  email character varying,
  role text,
  session_token uuid,
  team_ids integer[],
  organization_id integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'private'
AS $$
DECLARE
  v_user record;
  v_token uuid;
  v_team_ids integer[];
  v_team_ids_text text;
  v_rate_key text;
  v_input text;
BEGIN
  v_input := lower(trim(COALESCE(input_username_or_email, '')));
  v_rate_key := 'login_user:' || v_input;

  IF NOT private.consume_auth_rate_limit(v_rate_key, 5, 15) THEN
    RAISE EXCEPTION 'Te veel inlogpogingen. Probeer over 15 minuten opnieuw.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT u.user_id, u.username, u.email, u.role::text, u.organization_id
  INTO v_user
  FROM public.users u
  WHERE (
      lower(trim(u.username::text)) = v_input
      OR (
        u.email IS NOT NULL
        AND lower(trim(u.email::text)) = v_input
      )
    )
    AND u.password = extensions.crypt(input_password, u.password)
    AND (
      p_organization_id IS NULL
      OR u.organization_id = p_organization_id
    );

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM private.clear_auth_rate_limit(v_rate_key);

  v_token := gen_random_uuid();
  INSERT INTO public.user_sessions (session_id, user_id, expires_at)
  VALUES (v_token, v_user.user_id, now() + interval '24 hours');

  SELECT array_agg(tu.team_id ORDER BY tu.team_id) INTO v_team_ids
  FROM public.team_users tu
  WHERE tu.user_id = v_user.user_id;

  v_team_ids_text := COALESCE(array_to_string(v_team_ids, ','), '');
  PERFORM public.apply_app_user_context(
    v_user.role,
    v_user.user_id,
    v_team_ids_text,
    v_user.username::text,
    v_user.organization_id
  );

  RETURN QUERY
  SELECT
    v_user.user_id,
    v_user.username,
    v_user.email,
    v_user.role,
    v_token,
    v_team_ids,
    v_user.organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.login_user(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_user(text, text, integer) TO anon, authenticated;
