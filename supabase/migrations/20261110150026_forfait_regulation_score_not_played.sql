-- Reglementaire forfait-uitslag (10-0 / 0-10) telt niet als "echt gespeeld"
-- voor wedstrijdkosten-onderdrukking. Forfait + forfait-uitslag mag veld/scheids
-- blijven onderdrukken; een echte uitslag (bv. 3-1) blijft beschermd.

CREATE OR REPLACE FUNCTION public.is_forfait_regulation_score(p_home integer, p_away integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT p_home IS NOT NULL
     AND p_away IS NOT NULL
     AND (
       (p_home = 10 AND p_away = 0)
       OR (p_home = 0 AND p_away = 10)
     );
$$;

REVOKE ALL ON FUNCTION public.is_forfait_regulation_score(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_forfait_regulation_score(integer, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_forfait_regulation_score(integer, integer) IS
  'Reglementaire forfait-uitslag 10-0 of 0-10.';

CREATE OR REPLACE FUNCTION public.match_played_with_scores(p_match_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.match_id = p_match_id
      AND m.is_submitted = true
      AND m.home_score IS NOT NULL
      AND m.away_score IS NOT NULL
      AND NOT public.is_forfait_regulation_score(m.home_score, m.away_score)
  );
$$;

COMMENT ON FUNCTION public.match_played_with_scores(integer) IS
  'True als wedstrijd is ingediend met een echte (niet-forfait) uitslag.';
