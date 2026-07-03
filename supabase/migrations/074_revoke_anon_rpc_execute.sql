-- 074: Cerrar vector crítico — RPCs SECURITY DEFINER invocables sin login (anon)
-- La app invoca RPCs vía API routes con service_role o sesión authenticated.
-- Cualquiera con la anon key pública no debe poder llamar finalize_px_reception_tx, etc.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args,
           p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      r.name,
      r.args
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
