-- PX Fase 7: vista de alertas operativas para monitoreo / cron manual.

CREATE OR REPLACE VIEW public.px_capture_alerts_current AS
WITH
  bounds AS (
    SELECT now() AS checked_at
  ),
  timeout_1h AS (
    SELECT count(*)::integer AS n
    FROM public.px_capture_metrics
    WHERE action = 'capture_px_equipment'
      AND (sqlstate = '57014' OR error_code = 'CAPTURE_TIMEOUT')
      AND created_at >= now() - interval '1 hour'
  ),
  timeout_24h AS (
    SELECT count(*)::integer AS n
    FROM public.px_capture_metrics
    WHERE action = 'capture_px_equipment'
      AND (sqlstate = '57014' OR error_code = 'CAPTURE_TIMEOUT')
      AND created_at >= now() - interval '24 hours'
  ),
  missing_serial_24h AS (
    SELECT count(*)::integer AS n
    FROM public.px_capture_metrics
    WHERE action = 'capture_px_equipment'
      AND outcome = 'error'
      AND main_serial IS NULL
      AND created_at >= now() - interval '24 hours'
  ),
  success_p95_24h AS (
    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric AS p95
    FROM public.px_capture_metrics
    WHERE action = 'capture_px_equipment'
      AND outcome = 'success'
      AND duration_ms IS NOT NULL
      AND created_at >= now() - interval '24 hours'
  ),
  success_n_24h AS (
    SELECT count(*)::integer AS n
    FROM public.px_capture_metrics
    WHERE action = 'capture_px_equipment'
      AND outcome = 'success'
      AND created_at >= now() - interval '24 hours'
  ),
  box_busy_1h AS (
    SELECT count(*)::integer AS n
    FROM public.px_capture_metrics
    WHERE action = 'capture_px_equipment'
      AND error_code = 'BOX_BUSY'
      AND created_at >= now() - interval '1 hour'
  )
SELECT
  b.checked_at,
  v.alert_id,
  v.severity,
  v.observed,
  v.threshold,
  v.description
FROM bounds b
CROSS JOIN timeout_1h t
CROSS JOIN timeout_24h t24
CROSS JOIN missing_serial_24h ms
CROSS JOIN success_p95_24h sp
CROSS JOIN success_n_24h sn
CROSS JOIN box_busy_1h bb
CROSS JOIN LATERAL (
  VALUES
    (
      'capture_timeout_1h'::text,
      CASE
        WHEN t.n > 3 THEN 'critical'
        WHEN t.n > 0 THEN 'warning'
        ELSE 'ok'
      END,
      t.n::numeric,
      3::numeric,
      'Capturas con timeout (57014 / CAPTURE_TIMEOUT) en la última hora'::text
    ),
    (
      'capture_timeout_24h'::text,
      CASE
        WHEN t24.n > 5 THEN 'critical'
        WHEN t24.n > 2 THEN 'warning'
        ELSE 'ok'
      END,
      t24.n::numeric,
      5::numeric,
      'Capturas con timeout en las últimas 24 h (SLO diario)'::text
    ),
    (
      'success_p95_rpc_24h'::text,
      CASE
        WHEN sn.n < 20 THEN 'ok'
        WHEN sp.p95 IS NULL THEN 'ok'
        WHEN sp.p95 > 3000 THEN 'critical'
        WHEN sp.p95 > 1500 THEN 'warning'
        ELSE 'ok'
      END,
      coalesce(sp.p95, 0),
      3000::numeric,
      'P95 RPC SUCCESS captura — últimas 24 h (ms); warning >1500, critical >3000'::text
    ),
    (
      'errors_missing_serial_24h'::text,
      CASE
        WHEN ms.n > 0 THEN 'critical'
        ELSE 'ok'
      END,
      ms.n::numeric,
      0::numeric,
      'Errores de captura sin main_serial (regresión observabilidad TS)'::text
    ),
    (
      'box_busy_spike_1h'::text,
      CASE
        WHEN bb.n > 30 THEN 'warning'
        ELSE 'ok'
      END,
      bb.n::numeric,
      30::numeric,
      'BOX_BUSY en 1 h — pistoleo rápido o cola cliente desactivada'::text
    )
) AS v(alert_id, severity, observed, threshold, description);

COMMENT ON VIEW public.px_capture_alerts_current IS
  'Alertas PX capture en tiempo casi real. Filtrar severity <> ok para paging manual/cron.';

-- Solo alertas activas (warning/critical) — conveniente para cron y scripts.
CREATE OR REPLACE VIEW public.px_capture_alerts_firing AS
SELECT *
FROM public.px_capture_alerts_current
WHERE severity IN ('warning', 'critical')
ORDER BY
  CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
  alert_id;

COMMENT ON VIEW public.px_capture_alerts_firing IS
  'Subconjunto de px_capture_alerts_current con alertas warning/critical únicamente.';

NOTIFY pgrst, 'reload schema';
