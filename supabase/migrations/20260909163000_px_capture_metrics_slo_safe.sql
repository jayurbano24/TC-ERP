-- PX Fase 5 (safe): columnas SLO + vista diaria.
-- NO reemplaza capture_px_equipment_tx (60000/61000/62000 ya aplicadas).

ALTER TABLE public.px_capture_metrics
  ADD COLUMN IF NOT EXISTS validation_ms integer,
  ADD COLUMN IF NOT EXISTS lock_section_ms integer;

COMMENT ON COLUMN public.px_capture_metrics.validation_ms IS
  'Sub-span RPC: validaciones de serial/OS antes del lock de caja.';

COMMENT ON COLUMN public.px_capture_metrics.lock_section_ms IS
  'Sub-span RPC: sección crítica post lock (INSERT + UPDATE).';

CREATE OR REPLACE VIEW public.px_capture_slo_daily AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Guatemala') AS day_gt,
  outcome,
  coalesce(error_code, 'NONE') AS error_code,
  count(*) AS n,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)
    FILTER (WHERE duration_ms IS NOT NULL) AS p50_rpc_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
    FILTER (WHERE duration_ms IS NOT NULL) AS p95_rpc_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)
    FILTER (WHERE duration_ms IS NOT NULL) AS p99_rpc_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY client_duration_ms)
    FILTER (WHERE client_duration_ms IS NOT NULL) AS p95_client_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY validation_ms)
    FILTER (WHERE validation_ms IS NOT NULL) AS p95_validation_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY lock_wait_ms)
    FILTER (WHERE lock_wait_ms IS NOT NULL) AS p95_lock_wait_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY lock_section_ms)
    FILTER (WHERE lock_section_ms IS NOT NULL) AS p95_lock_section_ms,
  count(*) FILTER (WHERE sqlstate = '57014' OR error_code = 'CAPTURE_TIMEOUT') AS timeout_count,
  count(*) FILTER (WHERE main_serial IS NULL AND outcome = 'error') AS errors_missing_serial
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.px_capture_slo_daily IS
  'Agregado diario (GT) SLOs captura PX. Objetivos: SUCCESS p95 rpc < 1500ms, timeouts → 0.';

NOTIFY pgrst, 'reload schema';
