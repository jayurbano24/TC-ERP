-- =============================================================================
-- 270 — GRANT SELECT en materialized views de dashboard (42501 mv_workshop)
-- =============================================================================
-- Síntoma: permission denied for materialized view mv_workshop (42501)
-- Causa: MV creada/recreada sin repetir GRANT de 092 (PostgREST + JWT authenticated).
-- Consumidores: kpi-engine (browser), syncPipelineWip (service), dashboard.
-- No relacionado con authz 269.
-- =============================================================================

DO $$
DECLARE
  v_mv text;
  v_mvs text[] := ARRAY[
    'mv_dashboard',
    'mv_workshop',
    'mv_workshop_diagnostico',
    'mv_bodega',
    'mv_bodega_inventory',
    'mv_rrhh',
    'mv_sap'
  ];
BEGIN
  FOREACH v_mv IN ARRAY v_mvs LOOP
    IF to_regclass('public.' || v_mv) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT ON public.%I TO authenticated, service_role',
        v_mv
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación (solo lectura):
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'mv_workshop';
