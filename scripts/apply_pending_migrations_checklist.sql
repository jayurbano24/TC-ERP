-- =============================================================================
-- TC-ERP — Checklist migraciones 050–057 (Supabase SQL Editor)
-- =============================================================================
-- Ejecutar en producción o staging. No modifica datos de negocio (solo tablas temp).
-- Supabase muestra UN solo resultado: usa la tabla final (columna codigo = 050…057).
--
-- Post-055 (si falta): scripts/sync_sap_ingresado_bodega_backfill.sql
-- Post-055 (si hubo sync prematuro): scripts/fix_sap_ingresado_bodega_premature.sql
-- Post-056 (si labels viejos): scripts/fix_cac_tray_backoffice_label_only.sql
-- =============================================================================

DROP FUNCTION IF EXISTS pg_temp.tc_table_has_row(text, text);
DROP FUNCTION IF EXISTS pg_temp.tc_call_text_fn(text, text);
DROP FUNCTION IF EXISTS pg_temp.tc_safe_count(text);
DROP FUNCTION IF EXISTS pg_temp.tc_rbac_can_view(text, text);
DROP FUNCTION IF EXISTS pg_temp.tc_module_perm_granted(text);
DROP FUNCTION IF EXISTS pg_temp.tc_reportes_linked_to_role_modules(text[]);

CREATE OR REPLACE FUNCTION pg_temp.tc_table_has_row(p_table text, p_where text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v boolean;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE %s)',
    p_table,
    p_where
  ) INTO v;
  RETURN coalesce(v, false);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tc_call_text_fn(p_name text, p_arg text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = p_name
  ) THEN
    RETURN NULL;
  END IF;
  EXECUTE format('SELECT public.%I(%L)', p_name, p_arg) INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tc_safe_count(p_sql text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v bigint;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN coalesce(v, 0);
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tc_rbac_can_view(p_role_name text, p_module text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v boolean;
BEGIN
  IF to_regclass('public.erp_role_permissions') IS NULL THEN
    RETURN false;
  END IF;

  IF to_regclass('public.hr_positions') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.erp_role_permissions p
        JOIN public.hr_positions r ON r.id = p.role_id
        WHERE (
          r.name = $1
          OR ($1 = 'Administrador' AND r.name ILIKE '%administrador%')
          OR ($1 = 'Supervisor' AND r.name ILIKE '%supervisor%')
        )
          AND p.module_name = $2
          AND p.can_view = true
      )
    $sql$ INTO v USING p_role_name, p_module;
    RETURN coalesce(v, false);
  END IF;

  IF to_regclass('public.erp_roles') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.erp_role_permissions p
        JOIN public.erp_roles r ON r.id = p.role_id
        WHERE r.name = $1
          AND p.module_name = $2
          AND p.can_view = true
      )
    $sql$ INTO v USING p_role_name, p_module;
    RETURN coalesce(v, false);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tc_module_perm_granted(p_module text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v boolean;
BEGIN
  IF to_regclass('public.erp_role_permissions') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1 FROM public.erp_role_permissions
      WHERE module_name = $1 AND can_view = true
    )
  $sql$ INTO v USING p_module;
  RETURN coalesce(v, false);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tc_reportes_linked_to_role_modules(p_modules text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v boolean;
BEGIN
  IF to_regclass('public.erp_role_permissions') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM public.erp_role_permissions rpt
      JOIN public.erp_role_permissions src ON src.role_id = rpt.role_id
      WHERE rpt.module_name = 'Reportes'
        AND rpt.can_view = true
        AND src.can_view = true
        AND src.module_name = ANY($1::text[])
    )
  $sql$ INTO v USING p_modules;
  RETURN coalesce(v, false);
END;
$$;

DROP TABLE IF EXISTS _tc_migration_checks;
DROP TABLE IF EXISTS _tc_migration_summary;

CREATE TEMP TABLE _tc_migration_checks AS
WITH migration_checks AS (
  -- -------------------------------------------------------------------------
  -- 050 — platform_events_phase_a
  -- -------------------------------------------------------------------------
  SELECT
    '050' AS migration,
    '050_platform_events_phase_a.sql' AS file_name,
    'Fase 2 Eventos' AS phase,
    'domain_events' AS check_id,
    'Tabla domain_events' AS check_label,
    to_regclass('public.domain_events') IS NOT NULL AS ok
  UNION ALL
  SELECT '050', '050_platform_events_phase_a.sql', 'Fase 2 Eventos',
    'emit_domain_event', 'Función emit_domain_event',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'emit_domain_event'
    )
  UNION ALL
  SELECT '050', '050_platform_events_phase_a.sql', 'Fase 2 Eventos',
    'outbox_attempts', 'outbox_event.attempts (worker retry)',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbox_event'
        AND column_name = 'attempts'
    )

  -- -------------------------------------------------------------------------
  -- 051 — production_orders
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '051', '051_production_orders.sql', 'Fase 2A',
    'production_orders', 'Tabla production_orders',
    to_regclass('public.production_orders') IS NOT NULL
  UNION ALL
  SELECT '051', '051_production_orders.sql', 'Fase 2A',
    'po_create_tx', 'RPC production_order_create_tx',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'production_order_create_tx'
    )
  UNION ALL
  SELECT '051', '051_production_orders.sql', 'Fase 2A',
    'so_po_fk', 'service_orders.production_order_id',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'service_orders'
        AND column_name = 'production_order_id'
    )

  -- -------------------------------------------------------------------------
  -- 052 — accessories_dispatch_batches
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '052', '052_accessories_dispatch_batches.sql', 'Fase 2A',
    'am_dispatch_batch', 'accessory_movements.dispatch_batch_id',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'accessory_movements'
        AND column_name = 'dispatch_batch_id'
    )
  UNION ALL
  SELECT '052', '052_accessories_dispatch_batches.sql', 'Fase 2A',
    'am_dispatch_mode', 'accessory_movements.dispatch_mode',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'accessory_movements'
        AND column_name = 'dispatch_mode'
    )
  UNION ALL
  SELECT '052', '052_accessories_dispatch_batches.sql', 'Fase 2A',
    'accessory_dispatch_out_tx', 'RPC accessory_dispatch_out_tx (lote opcional)',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'accessory_dispatch_out_tx'
    )

  -- -------------------------------------------------------------------------
  -- 053 — report_definitions
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '053', '053_report_definitions.sql', 'Fase 2B',
    'report_definitions', 'Tabla report_definitions',
    to_regclass('public.report_definitions') IS NOT NULL
  UNION ALL
  SELECT '053', '053_report_definitions.sql', 'Fase 2B',
    'report_runs', 'Tabla report_runs',
    to_regclass('public.report_runs') IS NOT NULL
  UNION ALL
  SELECT '053', '053_report_definitions.sql', 'Fase 2B',
    'seed_cac_historico', 'Seed CAC_CLASIFICACION_HISTORICO',
    pg_temp.tc_table_has_row(
      'report_definitions',
      'code = ''CAC_CLASIFICACION_HISTORICO'' AND is_active = true'
    )

  -- -------------------------------------------------------------------------
  -- 054 — nav_reportes_permissions
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '054', '054_nav_reportes_permissions.sql', 'Fase 2B',
    'perm_reportes', 'Al menos un puesto con módulo Reportes',
    pg_temp.tc_module_perm_granted('Reportes')
  UNION ALL
  SELECT '054', '054_nav_reportes_permissions.sql', 'Fase 2B',
    'perm_accesorios', 'Al menos un puesto con módulo Accesorios',
    pg_temp.tc_module_perm_granted('Accesorios')
  UNION ALL
  SELECT '054', '054_nav_reportes_permissions.sql', 'Fase 2B',
    'perm_integracion_sap', 'Al menos un puesto con Integración SAP',
    pg_temp.tc_module_perm_granted('Integración SAP')

  -- -------------------------------------------------------------------------
  -- 055 — warehouse_sap_sync_chg002 (requiere current_box_id en sync SAP)
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '055', '055_warehouse_sap_sync_chg002.sql', 'Fase 2A / CHG-002',
    'sap_sync_box_gate', 'warehouse_sync_sap_transfer_ingresado exige caja',
    COALESCE((
      SELECT pg_get_functiondef(p.oid) ILIKE '%current_box_id IS NOT NULL%'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'warehouse_sync_sap_transfer_ingresado'
      LIMIT 1
    ), false)
  UNION ALL
  SELECT '055', '055_warehouse_sap_sync_chg002.sql', 'Fase 2A / CHG-002',
    'sap_sync_for_series', 'Función warehouse_sync_sap_for_series',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'warehouse_sync_sap_for_series'
    )
  UNION ALL
  SELECT '055', '055_warehouse_sap_sync_chg002.sql', 'Fase 2A / CHG-002',
    'ingreso_calls_sync', 'warehouse_ingreso_tx llama sync SAP',
    COALESCE((
      SELECT pg_get_functiondef(p.oid) ILIKE '%warehouse_sync_sap_for_series%'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'warehouse_ingreso_tx'
      LIMIT 1
    ), false)

  -- -------------------------------------------------------------------------
  -- 056 — cac_tray_backoffice_status_label
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '056', '056_cac_tray_backoffice_status_label.sql', 'Fase 2A / CAC UI',
    'label_fn_exists', 'Función cac_tray_status_label',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'cac_tray_status_label'
    )
  UNION ALL
  SELECT '056', '056_cac_tray_backoffice_status_label.sql', 'Fase 2A / CAC UI',
    'label_backoffice_text', 'Label RECEPCIONADO_BODEGA_GENERAL → Ingresado a Backoffice',
    COALESCE(
      pg_temp.tc_call_text_fn('cac_tray_status_label', 'RECEPCIONADO_BODEGA_GENERAL')
        = 'Ingresado a Backoffice',
      false
    )
  UNION ALL
  SELECT '056', '056_cac_tray_backoffice_status_label.sql', 'Fase 2A / CAC UI',
    'label_no_sap_concat', 'Sin concatenar código SAP en label backoffice',
    COALESCE(
      pg_temp.tc_call_text_fn('cac_tray_status_label', 'RECEPCIONADO_BODEGA_GENERAL')
        NOT ILIKE '%PENDIENTE_INGRESO%',
      false
    )

  -- -------------------------------------------------------------------------
  -- 057 — reception_received_by
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '057', '057_reception_received_by.sql', 'Fase 2A / Recepción',
    'receptions_received_by', 'Columna receptions.received_by',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'receptions'
        AND column_name = 'received_by'
    )
  UNION ALL
  SELECT '057', '057_reception_received_by.sql', 'Fase 2A / Recepción',
    'px_join_sets_received_by', 'join_or_start_px_reception_tx persiste received_by',
    COALESCE((
      SELECT pg_get_functiondef(p.oid) ILIKE '%received_by%'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'join_or_start_px_reception_tx'
      LIMIT 1
    ), false)
  UNION ALL
  SELECT '057', '057_reception_received_by.sql', 'Fase 2A / Recepción',
    'px_finalize_received_by', 'finalize_px_reception_tx coalesce received_by',
    COALESCE((
      SELECT pg_get_functiondef(p.oid) ILIKE '%received_by = coalesce%'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'finalize_px_reception_tx'
      LIMIT 1
    ), false)

  -- -------------------------------------------------------------------------
  -- 058 — classify_domain_event_dual_write
  -- -------------------------------------------------------------------------
  UNION ALL
  SELECT '058', '058_classify_domain_event_dual_write.sql', 'Fase 2 Eventos',
    'classify_correlation_param', 'classify_equipment_batch_tx acepta p_correlation_id',
    COALESCE((
      SELECT pg_get_function_arguments(p.oid) ILIKE '%p_correlation_id%'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'classify_equipment_batch_tx'
      LIMIT 1
    ), false)
  UNION ALL
  SELECT '058', '058_classify_domain_event_dual_write.sql', 'Fase 2 Eventos',
    'classify_emits_event', 'classify emite equipment.classified vía emit_domain_event',
    COALESCE((
      SELECT pg_get_functiondef(p.oid) ILIKE '%equipment.classified%'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'classify_equipment_batch_tx'
      LIMIT 1
    ), false)
)
SELECT migration, file_name, phase, check_id, check_label, ok
FROM migration_checks;

CREATE TEMP TABLE _tc_migration_summary AS
SELECT
  migration,
  file_name,
  phase,
  count(*) AS total_checks,
  count(*) FILTER (WHERE ok) AS passed_checks,
  CASE
    WHEN count(*) FILTER (WHERE ok) = count(*) THEN 'APPLIED'
    WHEN count(*) FILTER (WHERE ok) = 0 THEN 'MISSING'
    ELSE 'PARTIAL'
  END AS status
FROM _tc_migration_checks
GROUP BY migration, file_name, phase;

-- =============================================================================
-- RESULTADO ÚNICO (Supabase solo muestra el último SELECT)
-- Columnas: orden | tipo | codigo | estado | checks | archivo_sql | fase | accion
-- =============================================================================
SELECT
  1 AS orden,
  'MIGRACION' AS tipo,
  s.migration AS codigo,
  s.status AS estado,
  s.passed_checks || '/' || s.total_checks AS checks,
  s.file_name AS archivo_sql,
  s.phase AS fase,
  CASE s.migration
    WHEN '055' THEN 'Aplicar: supabase/migrations/055_warehouse_sap_sync_chg002.sql'
    WHEN '053' THEN 'Aplicar: supabase/migrations/053_report_definitions.sql'
    WHEN '054' THEN 'Aplicar: supabase/migrations/054_nav_reportes_permissions.sql'
    WHEN '056' THEN 'Backfill opcional: scripts/fix_cac_tray_backoffice_label_only.sql'
    ELSE NULL
  END AS accion
FROM _tc_migration_summary s

UNION ALL

SELECT
  2,
  'CHECK_FAIL',
  c.migration,
  'FAIL',
  c.check_id,
  c.check_label,
  c.file_name,
  'Revisar check en migración ' || c.migration
FROM _tc_migration_checks c
WHERE NOT c.ok

UNION ALL

SELECT
  3 AS orden,
  'ALERTA' AS tipo,
  'sap_premature_ingresado' AS codigo,
  pg_temp.tc_safe_count($sql$
    SELECT count(DISTINCT std.id)
    FROM public.sap_transfer_documents std
    JOIN public.series s ON s.sap_transfer_id = std.id
    WHERE std.status = 'INGRESADO_BODEGA'
      AND s.current_status::text = 'in_central_warehouse'
      AND s.current_box_id IS NULL
  $sql$)::text AS estado,
  NULL::text AS checks,
  'SAP INGRESADO_BODEGA con series sin caja' AS archivo_sql,
  NULL::text AS fase,
  'Tras 055: scripts/fix_sap_ingresado_bodega_premature.sql' AS accion

UNION ALL

SELECT
  3,
  'ALERTA',
  'cac_old_backoffice_labels',
  pg_temp.tc_safe_count($sql$
    SELECT count(*)
    FROM public.cac_tray_units
    WHERE unit_status = 'RECEPCIONADO_BODEGA_GENERAL'
      AND unit_status_label IN (
        'Pendiente de Ingreso a Bodega General',
        'Ingresado a Backoffice, PENDIENTE_INGRESO_BODEGA'
      )
  $sql$)::text,
  NULL,
  'cac_tray_units con label backoffice antiguo',
  NULL,
  'scripts/fix_cac_tray_backoffice_label_only.sql'

UNION ALL

SELECT
  3,
  'ALERTA',
  'receptions_without_receiver',
  pg_temp.tc_safe_count($sql$
    SELECT count(*)
    FROM public.receptions r
    WHERE r.created_at > now() - interval '30 days'
      AND r.received_by IS NULL
      AND coalesce(r.notes, '') NOT ILIKE '%Recibido Por:%'
  $sql$)::text,
  NULL,
  'Recepciones 30d sin received_by ni nota Recibido Por',
  NULL,
  'Histórico esperado; nuevas recepciones usan 057'

UNION ALL

SELECT
  4 AS orden,
  'TOTAL' AS tipo,
  'applied' AS codigo,
  count(*) FILTER (WHERE status = 'APPLIED')::text AS estado,
  NULL::text AS checks,
  'Migraciones 050-057 completas' AS archivo_sql,
  NULL::text AS fase,
  NULL::text AS accion
FROM _tc_migration_summary

UNION ALL

SELECT
  4,
  'TOTAL',
  'partial',
  count(*) FILTER (WHERE status = 'PARTIAL')::text,
  NULL,
  'Migraciones incompletas',
  NULL,
  NULL
FROM _tc_migration_summary

UNION ALL

SELECT
  4,
  'TOTAL',
  'missing',
  count(*) FILTER (WHERE status = 'MISSING')::text,
  NULL,
  'Migraciones sin aplicar',
  NULL,
  NULL
FROM _tc_migration_summary

ORDER BY orden, codigo;
