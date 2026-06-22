-- Gemelo digital — reconciliación Motor 1 vs Motor 2
-- Para validación SE-1 completa usar: scripts/validate_state_engine.sql
-- Si stage_summary_rows = 1 → ejecutar scripts/repair_stage_summary_refresh.sql primero
-- Ejecutar después de migración 035 (+ parche 036 si aplica):
--   SELECT public.refresh_service_order_operational_states();
--   SELECT public.refresh_service_order_stage_summary();

-- =============================================================================
-- 1) Libro mayor vs snapshot (debe ser delta = 0)
-- =============================================================================
SELECT * FROM public.vw_kpi_snapshot_reconciliation;

-- =============================================================================
-- 2) Snapshot operativo (Tipo A — ¿dónde está AHORA cada OS?)
-- =============================================================================
SELECT * FROM public.vw_kpi_snapshot;

-- =============================================================================
-- 3) Producción vs eventos por etapa (Tipo B / C)
-- =============================================================================
SELECT * FROM public.vw_kpi_production;

-- Desglose por etapa (esperado: clasificacion_cac ~472, clasificacion_px ~5)
SELECT stage_code, count(*) AS os_en_etapa, sum(visit_count) AS eventos
FROM public.service_order_stage_summary
GROUP BY stage_code
ORDER BY os_en_etapa DESC;

-- =============================================================================
-- 4) Muestra retrabajos (NO es el total de filas en stage_summary)
-- Solo OS con visit_count > 1 o rework_count > 0 — típico: 1 fila (taller).
-- Para el panorama completo usar §3 desglose o:
--   SELECT stage_code, count(*) FROM service_order_stage_summary GROUP BY 1;
-- =============================================================================
SELECT
  so.os_label,
  ss.stage_code,
  ss.first_entered_at,
  ss.visit_count,
  ss.rework_count
FROM public.service_order_stage_summary ss
JOIN public.service_orders so ON so.id = ss.service_order_id
WHERE ss.visit_count > 1 OR ss.rework_count > 0
ORDER BY ss.last_entered_at DESC
LIMIT 30;
