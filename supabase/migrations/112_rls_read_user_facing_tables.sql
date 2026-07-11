-- =============================================================================
-- 112 — RLS SELECT en tablas de lectura usuario (cierra INFO + prep USE_RLS_READS)
-- =============================================================================
-- RLS ON sin política = deny-all para authenticated (INFO advisor).
-- Aquí solo SELECT en tablas que la app lee vía JWT / resolveReadClient.
-- Escritura sigue vía SECURITY DEFINER / service_role (sin policy write).
--
-- A propósito SIN policy (deny browser): audit_logs, kpi_event_ledger,
-- kpi_invalidation_queue, outbox_event, sync_process_config, sync_run_log,
-- sync_watermarks.
-- =============================================================================

DO $$
DECLARE
  t text;
  read_tables text[] := ARRAY[
    'clients',
    'feature_flag',
    'log_equipo',
    'log_orden_servicio',
    'service_order_operational_state',
    'service_order_stage_summary'
  ];
BEGIN
  FOREACH t IN ARRAY read_tables
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '112: skip % (missing)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read_auth', t
    );
  END LOOP;
END $$;

-- SAP: lectura ops (dashboard / history / query)
DO $$
DECLARE
  t text;
  sap_tables text[] := ARRAY[
    'sap_uploads',
    'sap_validation_details',
    'sap_validation_logs',
    'sap_validation_sessions'
  ];
  pred text := $p$
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  $p$;
BEGIN
  FOREACH t IN ARRAY sap_tables
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '112: skip % (missing)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_ops', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_read_ops', t, pred
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Smoke:
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN (
--       'clients','feature_flag','log_equipo','log_orden_servicio',
--       'sap_uploads','service_order_operational_state'
--     );
-- =============================================================================
