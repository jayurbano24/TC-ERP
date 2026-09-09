-- PX EXPLAIN 6/6 — Timings desde metadata (no requiere columna validation_ms)
SELECT
  m.created_at,
  coalesce(m.metadata->>'main_serial', m.metadata->>'serial') AS main_serial,
  m.outcome,
  m.error_code,
  m.duration_ms AS rpc_ms,
  coalesce(
    (m.metadata->'timings'->>'validation_ms')::integer,
    (m.metadata->>'validation_ms')::integer
  ) AS validation_ms,
  coalesce(
    (m.metadata->'timings'->>'lock_wait_ms')::integer,
    (m.metadata->>'lock_wait_ms')::integer
  ) AS lock_wait_ms,
  coalesce(m.metadata->'timings', m.metadata) AS timing_source
FROM public.px_capture_metrics m
WHERE m.action = 'capture_px_equipment'
ORDER BY m.created_at DESC
LIMIT 25;
