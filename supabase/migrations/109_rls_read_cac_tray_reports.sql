-- =============================================================================
-- 109 — RLS SELECT en cac_tray_units + report_definitions (ADR-011 2A)
-- =============================================================================
-- Prepara lecturas con USE_RLS_READS=true. Escritura sigue vía DEFINER/service.
-- Idempotente / tolerante a ausencia.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.cac_tray_units') IS NULL THEN
    RAISE NOTICE '109: skip cac_tray_units';
    RETURN;
  END IF;
  ALTER TABLE public.cac_tray_units ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS cac_tray_units_read_auth ON public.cac_tray_units;
  CREATE POLICY cac_tray_units_read_auth ON public.cac_tray_units
    FOR SELECT TO authenticated USING (true);
END $$;

DO $$
BEGIN
  IF to_regclass('public.report_definitions') IS NULL THEN
    RAISE NOTICE '109: skip report_definitions';
    RETURN;
  END IF;
  ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS report_definitions_read_auth ON public.report_definitions;
  DROP POLICY IF EXISTS report_definitions_select_active ON public.report_definitions;
  CREATE POLICY report_definitions_read_auth ON public.report_definitions
    FOR SELECT TO authenticated
    USING (is_active IS TRUE OR public.app_is_admin());
END $$;

DO $$
BEGIN
  IF to_regclass('public.report_runs') IS NULL THEN
    RAISE NOTICE '109: skip report_runs';
    RETURN;
  END IF;
  ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS report_runs_insert_auth ON public.report_runs;
  DROP POLICY IF EXISTS report_runs_read_ops ON public.report_runs;
  CREATE POLICY report_runs_insert_auth ON public.report_runs
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY report_runs_read_ops ON public.report_runs
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('gerencia')
    );
END $$;

NOTIFY pgrst, 'reload schema';
