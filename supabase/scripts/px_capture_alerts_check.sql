-- PX Fase 7: chequeo de alertas ( ejecutar cada 15–60 min vía cron manual / SQL Editor ).
-- Si px_capture_alerts_firing devuelve filas → revisar runbook docs/modules/recepcion-px/capture-runbook.md

-- 1) Alertas activas
SELECT alert_id, severity, observed, threshold, description, checked_at
FROM public.px_capture_alerts_firing;

-- 2) Snapshot completo (incluye ok)
SELECT alert_id, severity, observed, threshold, description
FROM public.px_capture_alerts_current
ORDER BY alert_id;

-- 3) Top errores última hora (contexto)
SELECT
  coalesce(error_code, 'NONE') AS error_code,
  coalesce(sqlstate, '—') AS sqlstate,
  count(*) AS n,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
  AND created_at >= now() - interval '1 hour'
GROUP BY 1, 2
ORDER BY n DESC
LIMIT 15;

-- 4) Forense reciente con request_id
SELECT
  created_at,
  request_id,
  main_serial,
  box_id,
  outcome,
  error_code,
  sqlstate,
  duration_ms,
  client_duration_ms,
  validation_ms,
  lock_section_ms
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
  AND created_at >= now() - interval '1 hour'
ORDER BY created_at DESC
LIMIT 30;
