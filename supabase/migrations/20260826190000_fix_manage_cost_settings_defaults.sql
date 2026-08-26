-- PostgREST PGRST202: delete/insert omitted optional args; public wrapper had no DEFAULTs.
DROP FUNCTION IF EXISTS public.manage_cost_settings_for_session(uuid, text, integer, text, numeric, text, boolean);

CREATE OR REPLACE FUNCTION public.manage_cost_settings_for_session(
  p_session_token uuid,
  p_operation text,
  p_id integer DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_cascade_amount boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$
  SELECT private.manage_cost_settings_for_session(
    p_session_token,
    p_operation,
    p_id,
    p_name,
    p_amount,
    p_category,
    p_cascade_amount
  );
$$;

REVOKE ALL ON FUNCTION public.manage_cost_settings_for_session(uuid, text, integer, text, numeric, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_cost_settings_for_session(uuid, text, integer, text, numeric, text, boolean) TO anon, authenticated;
