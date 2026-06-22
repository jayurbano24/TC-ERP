-- =============================================================================
-- Población Motor 2 + Motor 3→4 (ejecutar DESPUÉS del DDL de migración 035)
-- =============================================================================
-- Si motor34_refresh devuelve stage_summary_rows = 1, aplicar primero:
--   scripts/repair_stage_summary_refresh.sql
-- Supabase SQL Editor corta a ~20s por defecto; este script sube el límite.
-- Si sigue lento, ejecutar cada SELECT por separado.
-- =============================================================================

SET statement_timeout = '120s';

SELECT public.refresh_service_order_operational_states() AS motor2_refresh;

SELECT public.refresh_service_order_stage_summary() AS motor34_refresh;

SELECT * FROM public.vw_kpi_snapshot_reconciliation;
SELECT * FROM public.vw_kpi_production;
