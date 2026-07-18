-- =============================================================================
-- 148 — Security Advisor: higiene EXECUTE en SECURITY DEFINER (Fase 1)
-- =============================================================================
-- 1) REVOKE PUBLIC/anon en todo DEFINER de public; GRANT authenticated+service_role
-- 2) Allowlist anon: ZKTeco + kiosco biométrico
-- 3) Triggers / *_tg / trg_*: sin EXECUTE para roles de API
-- 4) Vista de auditoría security_definer_execute_audit
--
-- Dashboard (manual, CHG-013): Auth → Email → Leaked password protection = ON
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Higiene masiva DEFINER
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        r.name,
        r.args
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;

    BEGIN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
        r.name,
        r.args
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Allowlist anon (dispositivos / kiosco sin sesión ERP)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.zk_ingest_attlog_tx(text, jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.zk_ingest_attlog_tx(text, jsonb) TO anon;
  END IF;

  IF to_regprocedure('public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text) TO anon;
  END IF;

  IF to_regprocedure('public.kiosk_deactivate_face_embeddings(uuid, text, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_deactivate_face_embeddings(uuid, text, text) TO anon;
  END IF;

  IF to_regprocedure('public.kiosk_log_face_recognition(jsonb, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_log_face_recognition(jsonb, text) TO anon;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Triggers / funciones internas: no deben ser RPC REST
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proname LIKE '%\_tg' ESCAPE '\'
        OR p.proname LIKE 'trg\_%' ESCAPE '\'
        OR p.proname LIKE '%\_trigger' ESCAPE '\'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
        r.name,
        r.args
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
        r.name,
        r.args
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- PIN helper del kiosco: solo callable por DEFINER owner / service_role
DO $$
BEGIN
  IF to_regprocedure('public.app_kiosk_biometric_pin()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.app_kiosk_biometric_pin()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.app_kiosk_biometric_pin() TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Vista de auditoría (Security Advisor / ops)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.security_definer_execute_audit
WITH (security_invoker = true)
AS
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname, 3;

COMMENT ON VIEW public.security_definer_execute_audit IS
  'CHG-013: inventario EXECUTE de SECURITY DEFINER en public (auditoría advisor).';

REVOKE ALL ON public.security_definer_execute_audit FROM PUBLIC, anon;
GRANT SELECT ON public.security_definer_execute_audit TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
