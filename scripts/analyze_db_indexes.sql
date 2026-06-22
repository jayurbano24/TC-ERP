-- =============================================================================
-- TC-ERP — Análisis de índices y salud de BD (Supabase SQL Editor)
-- =============================================================================
-- Ejecutar sección por sección. No modifica datos.
-- Tras revisar resultados, aplicar migración 037 si faltan índices críticos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tamaño de tablas calientes (¿dónde crece el volumen?)
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  relname AS tabla,
  pg_size_pretty(pg_total_relation_size(relid)) AS tamano_total,
  n_live_tup AS filas_estimadas,
  seq_scan AS escaneos_secuenciales,
  idx_scan AS escaneos_indice,
  CASE WHEN seq_scan + idx_scan > 0
    THEN round(100.0 * idx_scan / (seq_scan + idx_scan), 1)
    ELSE NULL
  END AS pct_uso_indice
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN (
    'series', 'service_orders', 'erp_audit_logs', 'cac_tray_units',
    'receptions', 'reception_guides', 'service_order_operational_state',
    'service_order_stage_summary', 'domain_events', 'sap_transfer_documents'
  )
ORDER BY pg_total_relation_size(relid) DESC;

-- -----------------------------------------------------------------------------
-- 2) Índices existentes en tablas críticas
-- -----------------------------------------------------------------------------
SELECT
  t.relname AS tabla,
  i.relname AS indice,
  pg_size_pretty(pg_relation_size(i.oid)) AS tamano,
  ix.indisunique AS es_unico,
  pg_get_indexdef(ix.indexrelid) AS definicion
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN (
    'series', 'service_orders', 'erp_audit_logs', 'cac_tray_units',
    'receptions', 'reception_guides', 'domain_events'
  )
ORDER BY t.relname, i.relname;

-- -----------------------------------------------------------------------------
-- 3) Índices recomendados — ¿faltan en tu BD?
-- (true = ya existe, false = candidato a crear)
-- -----------------------------------------------------------------------------
SELECT * FROM (
  VALUES
    ('series', 'idx_series_service_order_id',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_service_order_id ON public.series(service_order_id) WHERE service_order_id IS NOT NULL'),
    ('series', 'idx_series_current_status',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_current_status ON public.series(current_status)'),
    ('series', 'idx_series_status_so',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_status_so ON public.series(current_status, service_order_id)'),
    ('series', 'idx_series_serial_normalized',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_serial_normalized ON public.series(upper(trim(serial_number)))'),
    ('service_orders', 'idx_so_main_serial_normalized',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_main_serial_normalized ON public.service_orders(upper(trim(main_serial))) WHERE main_serial IS NOT NULL'),
    ('erp_audit_logs', 'idx_audit_action_created',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_action_created ON public.erp_audit_logs(action, created_at DESC)'),
    ('erp_audit_logs', 'idx_audit_record_id',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_record_id ON public.erp_audit_logs(record_id)'),
    ('receptions', 'idx_receptions_created_at',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receptions_created_at ON public.receptions(created_at DESC)'),
    ('service_orders', 'idx_service_orders_reception_id',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_orders_reception_id ON public.service_orders(reception_id)'),
    ('reception_guides', 'idx_rg_reception_classified',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rg_reception_classified ON public.reception_guides(reception_id, classified_at DESC NULLS LAST)'),
    ('cac_tray_units', 'idx_cac_tray_active_status',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cac_tray_active_status ON public.cac_tray_units(is_active, unit_status) WHERE is_active = true')
) AS rec(tabla, indice, ddl)
LEFT JOIN pg_indexes pi
  ON pi.schemaname = 'public' AND pi.tablename = rec.tabla AND pi.indexname = rec.indice
ORDER BY rec.tabla, rec.indice;

-- -----------------------------------------------------------------------------
-- 4) Índices poco usados (candidatos a revisar, NO borrar sin análisis)
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  relname AS tabla,
  indexrelname AS indice,
  idx_scan AS veces_usado,
  pg_size_pretty(pg_relation_size(indexrelid)) AS tamano
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan < 50
  AND pg_relation_size(indexrelid) > 8192
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 30;

-- -----------------------------------------------------------------------------
-- 5) EXPLAIN — consultas típicas del ERP (post-migración 037)
-- Bueno: Index Scan / Bitmap Index Scan
-- Malo:  Seq Scan en tablas grandes con muchas "Rows Removed by Filter"
-- -----------------------------------------------------------------------------

-- KPI bodega: audit por acción + periodo (kpi-engine.ts)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT user_id, action, record_id, created_at
FROM public.erp_audit_logs
WHERE action IN ('INGRESO BODEGA', 'DESPACHO CREADO', 'TRASLADO', 'TRASLADO BODEGA')
  AND created_at >= now() - interval '30 days'
  AND created_at <= now();

-- KPI taller: audit por acción + periodo (kpi-engine.ts)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT user_id, action, new_values, record_id, created_at
FROM public.erp_audit_logs
WHERE action IN (
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO'
)
  AND created_at >= now() - interval '30 days'
  AND created_at <= now();

-- KPI taller: series por estado WIP bodega
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, service_order_id, current_status
FROM public.series
WHERE current_status = 'RECEPCIONADO_BODEGA_GENERAL';

-- Bandeja CAC: cola operativa
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM public.cac_tray_units
WHERE is_active = true
  AND unit_status = 'RECEPCIONADO_BODEGA_GENERAL';

-- Motor 2: snapshot por estado
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT state_code, count(*)
FROM public.service_order_operational_state
GROUP BY state_code;

-- Resolver OS desde serial (Motor 4 / resolve_audit_log_os_id)
-- ANTES de índice: Seq Scan ~1ms con 1.4k filas → malo a escala.
-- DESPUÉS de idx_series_serial_normalized: debe mostrar Index Scan.
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT service_order_id
FROM public.series
WHERE upper(trim(serial_number)) = upper(trim('E8:38:83:00:00:00'))
LIMIT 1;

-- -----------------------------------------------------------------------------
-- 6) Conexión Supabase (referencia — ejecutar en cliente psql, no SQL Editor)
-- -----------------------------------------------------------------------------
-- Pooler (app / serverless):  postgresql://...@aws-0-....pooler.supabase.com:6543/postgres
-- Directa (migraciones DDL):  postgresql://...@aws-0-....supabase.co:5432/postgres
-- Dashboard → Settings → Database → Connection string
