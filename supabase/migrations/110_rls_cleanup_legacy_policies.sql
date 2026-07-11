-- =============================================================================
-- 110 — Cleanup RLS advisor: políticas USING(true) + revoke anon asserts
-- =============================================================================
-- Cierra WARN rls_policy_always_true en catálogos/HR/legacy + anon DEFINER
-- en app_assert_* / app_sync_*.
-- Idempotente. SELECT amplio autenticado; escritura por app_is_admin / roles.
-- zk_ingest_attlog_tx: se mantiene EXECUTE a anon (dispositivos).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: drop policy if table exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.drop_pol(p_table text, p_policy text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_policy, p_table);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Políticas legacy explícitas del advisor
-- ---------------------------------------------------------------------------
SELECT pg_temp.drop_pol('agencies', 'agencies_write');
SELECT pg_temp.drop_pol('brands', 'brands_write');
SELECT pg_temp.drop_pol('models', 'models_write');
SELECT pg_temp.drop_pol('technologies', 'technologies_write');

SELECT pg_temp.drop_pol('cat_reacondicionado_tests', 'Enable delete for authenticated users');
SELECT pg_temp.drop_pol('cat_reacondicionado_tests', 'Enable insert for authenticated users');
SELECT pg_temp.drop_pol('cat_reacondicionado_tests', 'Enable update for authenticated users');

SELECT pg_temp.drop_pol('hr_audit_logs', 'Escritura pública para usuarios autenticados de logs');
SELECT pg_temp.drop_pol('hr_departments', 'Permitir escritura a usuarios');
SELECT pg_temp.drop_pol('hr_departments', 'Permitir escritura a usuarios autenticados');
SELECT pg_temp.drop_pol('hr_employee_types', 'Permitir escritura a usuarios');
SELECT pg_temp.drop_pol('hr_employee_types', 'Permitir escritura a usuarios autenticados');
SELECT pg_temp.drop_pol('hr_payroll_closure_details', 'Escritura pública para usuarios autenticados de details');
SELECT pg_temp.drop_pol('hr_payroll_closures', 'Escritura pública para usuarios autenticados de closures');
SELECT pg_temp.drop_pol('hr_policies_versions', 'Permitir actualizacion');
SELECT pg_temp.drop_pol('hr_policies_versions', 'Permitir insercion');

SELECT pg_temp.drop_pol('kpi_alerts', 'kpi_alerts_ack');

SELECT pg_temp.drop_pol('reception_guides', 'Enable delete for all users');
SELECT pg_temp.drop_pol('reception_guides', 'Enable insert for all users');
SELECT pg_temp.drop_pol('reception_guides', 'Enable update for all users');

SELECT pg_temp.drop_pol('report_runs', 'report_runs_auth');

SELECT pg_temp.drop_pol('return_registry', 'return_registry_auth_fallback');
SELECT pg_temp.drop_pol('return_registry', 'return_registry_write_ops');

SELECT pg_temp.drop_pol('service_orders', 'Permitir todo en service_orders');

SELECT pg_temp.drop_pol('time_justifications', 'Permitir actualización a supervisores/rrhh');
SELECT pg_temp.drop_pol('time_justifications', 'Permitir inserción de justificaciones (Kiosko)');
SELECT pg_temp.drop_pol('time_justifications_audit', 'Permitir escritura a RRHH');
SELECT pg_temp.drop_pol('time_logs', 'Allow Kiosk to insert time logs');

-- ---------------------------------------------------------------------------
-- 2) Catálogos: SELECT auth + write admin/supervisor
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  write_pred text := $p$
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  $p$;
BEGIN
  FOREACH t IN ARRAY ARRAY['agencies', 'brands', 'models', 'technologies']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write_ops', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_write_ops', t, write_pred, write_pred
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) cat_reacondicionado_tests
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cat_reacondicionado_tests') IS NULL THEN RETURN; END IF;
  ALTER TABLE public.cat_reacondicionado_tests ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS cat_reacondicionado_tests_read_auth ON public.cat_reacondicionado_tests;
  DROP POLICY IF EXISTS cat_reacondicionado_tests_write_ops ON public.cat_reacondicionado_tests;
  CREATE POLICY cat_reacondicionado_tests_read_auth ON public.cat_reacondicionado_tests
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY cat_reacondicionado_tests_write_ops ON public.cat_reacondicionado_tests
    FOR ALL TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('tecnico')
      OR public.app_has_role('qc')
    )
    WITH CHECK (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('tecnico')
      OR public.app_has_role('qc')
    );
END $$;

-- ---------------------------------------------------------------------------
-- 4) HR: lectura autenticados; escritura admin
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_departments',
    'hr_employee_types',
    'hr_payroll_closures',
    'hr_payroll_closure_details',
    'hr_policies_versions',
    'hr_audit_logs'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_auth', t);

    IF t = 'hr_audit_logs' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.app_is_admin() OR public.app_has_role(''admin'') OR public.app_has_role(''supervisor'') OR public.app_has_role(''gerencia'')
         )',
        t || '_read_auth', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)',
        t || '_insert_auth', t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        t || '_read_auth', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.app_is_admin() OR public.app_has_role(''admin'') OR public.app_has_role(''gerencia''))
         WITH CHECK (public.app_is_admin() OR public.app_has_role(''admin'') OR public.app_has_role(''gerencia''))',
        t || '_write_admin', t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) kpi_alerts — ack solo roles ops
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.kpi_alerts') IS NULL THEN RETURN; END IF;
  ALTER TABLE public.kpi_alerts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS kpi_alerts_read_auth ON public.kpi_alerts;
  DROP POLICY IF EXISTS kpi_alerts_ack_ops ON public.kpi_alerts;
  CREATE POLICY kpi_alerts_read_auth ON public.kpi_alerts
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY kpi_alerts_ack_ops ON public.kpi_alerts
    FOR UPDATE TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('gerencia')
    )
    WITH CHECK (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('gerencia')
    );
END $$;

-- ---------------------------------------------------------------------------
-- 6) return_registry
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.return_registry') IS NULL THEN RETURN; END IF;
  ALTER TABLE public.return_registry ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS return_registry_read_auth ON public.return_registry;
  DROP POLICY IF EXISTS return_registry_write_ops ON public.return_registry;
  CREATE POLICY return_registry_read_auth ON public.return_registry
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY return_registry_write_ops ON public.return_registry
    FOR ALL TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('bodega')
    )
    WITH CHECK (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('bodega')
    );
END $$;

-- ---------------------------------------------------------------------------
-- 7) time_logs / time_justifications — sesión real, no USING(true)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.time_logs') IS NOT NULL THEN
    ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS time_logs_insert_kiosk ON public.time_logs;
    CREATE POLICY time_logs_insert_kiosk ON public.time_logs
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF to_regclass('public.time_justifications') IS NOT NULL THEN
    ALTER TABLE public.time_justifications ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS time_justifications_insert_auth ON public.time_justifications;
    DROP POLICY IF EXISTS time_justifications_update_ops ON public.time_justifications;
    CREATE POLICY time_justifications_insert_auth ON public.time_justifications
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
    CREATE POLICY time_justifications_update_ops ON public.time_justifications
      FOR UPDATE TO authenticated
      USING (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('gerencia')
      )
      WITH CHECK (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('gerencia')
      );
  END IF;

  IF to_regclass('public.time_justifications_audit') IS NOT NULL THEN
    ALTER TABLE public.time_justifications_audit ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS time_justifications_audit_insert ON public.time_justifications_audit;
    CREATE POLICY time_justifications_audit_insert ON public.time_justifications_audit
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8) Avatars: quitar SELECT amplio (listing). Bucket público sigue sirviendo URL.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_public_select ON storage.objects;

-- ---------------------------------------------------------------------------
-- 9) Revoke anon en asserts / sync (PUBLIC hereda a anon)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'app_assert_any_role',
        'app_assert_bodega',
        'app_assert_recepcion',
        'app_sync_operational_role_from_position'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.proname, r.args
    );
  END LOOP;
END $$;

-- app_sync: solo service_role (no browser)
DO $$
BEGIN
  IF to_regprocedure('public.app_sync_operational_role_from_position(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.app_sync_operational_role_from_position(uuid)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.app_sync_operational_role_from_position(uuid)
      TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Manual (no SQL): Auth → Email → Leaked password protection = ON
-- WARN authenticated *_tx DEFINER: esperado (modelo RPC); no se revoca en masa.
-- =============================================================================
