-- PX 6A/6B/6C — EXPLAIN ANALYZE rutas críticas (SQL Editor).
--
-- RECOMENDADO: usar archivos separados en supabase/scripts/px_explain/
--   01_fixtures.sql … 06_recent_timings.sql (uno por pestaña, Run completo).
--
-- IMPORTANTE:
--   • Ejecuta cada bloque COMPLETO (desde SELECT/EXPLAIN hasta el ; final).
--   • No ejecutes líneas sueltas tipo "ORDER BY ..." — dan error 42601.
--   • Sección G usa metadata JSON (no requiere migración 50000).

-- =============================================================================
-- 0) Fixtures resueltos
-- =============================================================================
SELECT
  coalesce(
    (SELECT upper(trim(sl.serial_number))
     FROM public.px_reception_serial_lines sl
     ORDER BY sl.equipment_id DESC
     LIMIT 1),
    'PXTEST001'
  ) AS sample_serial,
  coalesce(
    (SELECT r.id
     FROM public.receptions r
     WHERE r.source = 'px'
     ORDER BY r.created_at DESC
     LIMIT 1),
    (SELECT r.id FROM public.receptions r ORDER BY r.created_at DESC LIMIT 1)
  ) AS sample_reception_id,
  coalesce(
    (SELECT b.id
     FROM public.boxes b
     JOIN public.receptions r ON r.id = b.reception_id
     WHERE r.source = 'px'
     ORDER BY b.id DESC
     LIMIT 1),
    (SELECT b.id FROM public.boxes b ORDER BY b.id DESC LIMIT 1)
  ) AS sample_box_id;

-- =============================================================================
-- A) Settings
-- =============================================================================
SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('statement_timeout', 'lock_timeout');

-- =============================================================================
-- B) px_find_active_serial_capture
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.px_find_active_serial_capture(
  coalesce(
    (SELECT upper(trim(sl.serial_number))
     FROM public.px_reception_serial_lines sl
     ORDER BY sl.equipment_id DESC
     LIMIT 1),
    'PXTEST001'
  )
);

-- =============================================================================
-- C) px_find_open_os_for_serial
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.px_find_open_os_for_serial(
  coalesce(
    (SELECT upper(trim(sl.serial_number))
     FROM public.px_reception_serial_lines sl
     ORDER BY sl.equipment_id DESC
     LIMIT 1),
    'PXTEST001'
  ),
  coalesce(
    (SELECT r.id
     FROM public.receptions r
     WHERE r.source = 'px'
     ORDER BY r.created_at DESC
     LIMIT 1),
    (SELECT r.id FROM public.receptions r ORDER BY r.created_at DESC LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  )
);

-- =============================================================================
-- D) Count activos por box_id
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)::integer
FROM public.px_reception_equipment
WHERE box_id = coalesce(
        (SELECT b.id
         FROM public.boxes b
         JOIN public.receptions r ON r.id = b.reception_id
         WHERE r.source = 'px'
         ORDER BY b.id DESC
         LIMIT 1),
        (SELECT b.id FROM public.boxes b ORDER BY b.id DESC LIMIT 1),
        '00000000-0000-0000-0000-000000000000'::uuid
      )
  AND capture_status = 'active';

-- =============================================================================
-- E) Índices relevantes (post 6C)
-- =============================================================================
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname IN (
      'idx_px_serial_lines_serial_upper',
      'idx_px_serial_lines_reception_serial_upper',
      'idx_px_equipment_box_active_count',
      'idx_service_orders_main_serial_upper_trim',
      'idx_series_serial_number_upper_trim',
      'idx_series_serial_upper_trim_so'
    )
    OR tablename IN (
      'px_reception_serial_lines',
      'px_reception_equipment',
      'boxes',
      'service_orders',
      'series'
    )
  )
ORDER BY tablename, indexname;

-- Checklist planes (manual):
--   px_find_active_serial_capture → Index Scan idx_px_serial_lines_serial_upper
--   px_find_open_os_for_serial    → Index Scan idx_service_orders_main_serial_upper_trim
--                                 o idx_series_serial_upper_trim_so
--   count activos por box         → Index Scan idx_px_equipment_box_active_count

-- =============================================================================
-- F) Locks en vivo (durante T8/T9 en otra sesión)
-- =============================================================================
SELECT
  a.pid,
  a.state,
  a.wait_event_type,
  a.wait_event,
  now() - a.query_start AS query_age,
  l.locktype,
  l.mode,
  l.granted,
  l.relation::regclass AS relation,
  bl.pid AS blocked_by_pid,
  left(a.query, 160) AS query_snip
FROM pg_stat_activity a
LEFT JOIN pg_locks l ON l.pid = a.pid AND NOT l.granted
LEFT JOIN pg_locks bl ON bl.pid = ANY(pg_blocking_pids(a.pid)) AND bl.granted
WHERE a.datname = current_database()
  AND a.pid <> pg_backend_pid()
  AND (
    a.query ILIKE '%capture_px_equipment%'
    OR a.wait_event_type = 'Lock'
  )
ORDER BY a.query_start;

-- =============================================================================
-- G) Timings recientes (desde metadata — compatible sin migración 50000)
-- =============================================================================
SELECT
  m.created_at,
  coalesce(m.metadata->>'main_serial', m.metadata->>'serial') AS main_serial,
  m.outcome,
  m.error_code,
  m.duration_ms AS rpc_ms,
  coalesce(
    (m.metadata->'timings'->>'preflight_ms')::integer,
    (m.metadata->>'preflight_ms')::integer
  ) AS preflight_ms,
  coalesce(
    (m.metadata->'timings'->>'validation_ms')::integer,
    (m.metadata->>'validation_ms')::integer
  ) AS validation_ms,
  coalesce(
    (m.metadata->'timings'->>'lock_wait_ms')::integer,
    (m.metadata->>'lock_wait_ms')::integer
  ) AS lock_wait_ms,
  coalesce(
    (m.metadata->'timings'->>'lock_section_ms')::integer,
    (m.metadata->>'lock_section_ms')::integer
  ) AS lock_section_ms,
  coalesce(m.metadata->'timings', m.metadata) AS timing_source
FROM public.px_capture_metrics m
WHERE m.action = 'capture_px_equipment'
ORDER BY m.created_at DESC
LIMIT 25;
