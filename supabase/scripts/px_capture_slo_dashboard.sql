-- PX Fase 5–7: consultas SLO + alertas para soporte / monitoreo manual.
-- Ejecutar en Supabase SQL Editor (prod o staging).
-- Runbook: web/docs/modules/recepcion-px/capture-runbook.md

-- 0) Alertas activas (Fase 7)
SELECT alert_id, severity, observed, threshold, description, checked_at
FROM public.px_capture_alerts_firing;

-- 1) Resumen diario (vista agregada)
SELECT *
FROM public.px_capture_slo_daily
WHERE day_gt >= (current_date AT TIME ZONE 'America/Guatemala') - interval '14 days'
ORDER BY day_gt DESC, outcome, error_code;

-- 2) Percentiles SUCCESS últimos 7 días
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50_rpc_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_rpc_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99_rpc_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY client_duration_ms) AS p95_client_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY validation_ms) AS p95_validation_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY lock_section_ms) AS p95_lock_section_ms,
  count(*) AS n
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
  AND outcome = 'success'
  AND created_at >= now() - interval '7 days';

-- 3) Alertas: timeouts capture (57014) últimas 24 h
SELECT count(*) AS timeout_57014_24h
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
  AND sqlstate = '57014'
  AND created_at >= now() - interval '24 hours';

-- 4) Regresión observabilidad: errores sin serial
SELECT id, request_id, error_code, sqlstate, duration_ms, created_at
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
  AND outcome = 'error'
  AND main_serial IS NULL
  AND created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- 5) Forense por request_id
-- SELECT * FROM public.px_capture_metrics WHERE request_id = '...';
