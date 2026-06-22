-- =============================================================================
-- Motor 4 — Parche v2: refresh_service_order_stage_summary
-- =============================================================================
-- Problema: stage_summary_rows = 1 aunque audit_logs_with_os >> 1.
-- Causa:   el refresh solo leía audits de taller; el histórico CAC vive en
--          cac_tray_units (clasificación), no en acciones de audit enlazadas.
--
-- Ejecutar TODO este archivo en Supabase SQL Editor (una vez).
-- Luego: SELECT public.refresh_service_order_stage_summary();
-- Validar: scripts/validate_digital_twin_snapshot.sql §3-4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Diagnóstico rápido (opcional)
-- -----------------------------------------------------------------------------
SELECT action, count(*) AS n
FROM public.erp_audit_logs
GROUP BY action
ORDER BY n DESC
LIMIT 20;

SELECT
  count(*) AS tray_total,
  count(*) FILTER (WHERE is_active) AS tray_active,
  count(DISTINCT service_order_id) AS tray_os_distinct
FROM public.cac_tray_units;

-- -----------------------------------------------------------------------------
-- Resolver OS desde record_id (UUID serie, SN, UUID OS, main_serial)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_audit_log_os_id(p_record_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT s.service_order_id FROM public.series s
     WHERE s.id::text = trim(p_record_id) AND s.service_order_id IS NOT NULL
     LIMIT 1),
    (SELECT s.service_order_id FROM public.series s
     WHERE upper(trim(s.serial_number)) = upper(trim(p_record_id))
       AND s.service_order_id IS NOT NULL
     ORDER BY s.created_at DESC
     LIMIT 1),
    (SELECT so.id FROM public.service_orders so
     WHERE so.id::text = trim(p_record_id)
     LIMIT 1),
    (SELECT so.id FROM public.service_orders so
     WHERE upper(trim(so.main_serial)) = upper(trim(p_record_id))
     ORDER BY so.created_at DESC
     LIMIT 1),
    (SELECT so.id FROM public.series s
     JOIN public.service_orders so
       ON upper(trim(so.main_serial)) = upper(trim(s.serial_number))
     WHERE s.id::text = trim(p_record_id)
     ORDER BY so.created_at DESC
     LIMIT 1)
  );
$$;

-- -----------------------------------------------------------------------------
-- Refresh consolidado: audit (taller/bodega) + seed bandeja CAC + PX
-- RECEPCIÓN CAC omitido: audit ruidoso; producción backoffice = clasificacion_cac.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_service_order_stage_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
  v_tray_seed integer := 0;
  v_tray_active integer := 0;
  v_audit_with_os integer := 0;
BEGIN
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE is_active)::integer
  INTO v_tray_seed, v_tray_active
  FROM public.cac_tray_units
  WHERE service_order_id IS NOT NULL;

  SELECT count(*)::integer INTO v_audit_with_os
  FROM public.erp_audit_logs al
  WHERE public.resolve_audit_log_os_id(al.record_id) IS NOT NULL;

  TRUNCATE public.service_order_stage_summary;

  WITH resolved AS (
    SELECT
      al.action,
      al.created_at,
      al.new_values,
      public.resolve_audit_log_os_id(al.record_id) AS os_id
    FROM public.erp_audit_logs al
  ),
  audit_stage_events AS (
    SELECT os_id, 'clasificacion_cac'::text AS stage_code, created_at
    FROM resolved
    WHERE os_id IS NOT NULL
      AND action IN (
        'SERIES_CLASSIFIED', 'CLASSIFY_BATCH', 'CLASSIFY_UNIT', 'RECEPTION_CLASSIFIED'
      )
    UNION ALL
    SELECT os_id, 'ingreso_bodega', created_at
    FROM resolved WHERE os_id IS NOT NULL AND action = 'INGRESO BODEGA'
    UNION ALL
    SELECT os_id, 'despacho', created_at
    FROM resolved WHERE os_id IS NOT NULL AND action = 'DESPACHO CREADO'
    UNION ALL
    SELECT os_id, 'diagnostico', created_at
    FROM resolved WHERE os_id IS NOT NULL AND action = 'DIAGNÓSTICO INICIAL COMPLETADO'
    UNION ALL
    SELECT os_id, 'reacondicionado', created_at
    FROM resolved WHERE os_id IS NOT NULL AND action = 'REACONDICIONADO COMPLETADO'
    UNION ALL
    SELECT os_id, 'reparacion', created_at
    FROM resolved WHERE os_id IS NOT NULL AND action = 'REPARACIÓN COMPLETADA'
    UNION ALL
    SELECT os_id, 'qc', created_at
    FROM resolved WHERE os_id IS NOT NULL AND action = 'CONTROL DE CALIDAD COMPLETADO'
    UNION ALL
    SELECT os_id, 'listo', created_at
    FROM resolved
    WHERE os_id IS NOT NULL AND coalesce(new_values->>'result', '') = 'listo'
    UNION ALL
    SELECT os_id, 'l3', created_at
    FROM resolved
    WHERE os_id IS NOT NULL AND coalesce(new_values->>'result', '') = 'l3'
    UNION ALL
    SELECT os_id, 'scrap', created_at
    FROM resolved
    WHERE os_id IS NOT NULL AND coalesce(new_values->>'result', '') = 'scraps'
  ),
  tray_clasificacion AS (
    SELECT
      t.service_order_id AS os_id,
      'clasificacion_cac'::text AS stage_code,
      coalesce(t.classified_at, t.updated_at, t.created_at, now()) AS created_at
    FROM public.cac_tray_units t
    WHERE t.service_order_id IS NOT NULL
  ),
  px_clasificacion AS (
    SELECT
      so.id AS os_id,
      'clasificacion_px'::text AS stage_code,
      coalesce(so.created_at, now()) AS created_at
    FROM public.service_orders so
    JOIN public.receptions r ON r.id = so.reception_id
    WHERE lower(coalesce(r.source::text, '')) = 'px'
  ),
  all_stage_events AS (
    SELECT os_id, stage_code, created_at FROM audit_stage_events
    UNION ALL
    SELECT os_id, stage_code, created_at FROM tray_clasificacion
    UNION ALL
    SELECT os_id, stage_code, created_at FROM px_clasificacion
  ),
  visits AS (
    SELECT
      os_id,
      stage_code,
      created_at,
      row_number() OVER (PARTITION BY os_id, stage_code ORDER BY created_at) AS visit_n
    FROM all_stage_events
    WHERE os_id IS NOT NULL
  ),
  agg AS (
    SELECT
      os_id,
      stage_code,
      min(created_at) FILTER (WHERE visit_n = 1) AS first_entered_at,
      max(created_at) AS last_entered_at,
      count(*)::integer AS visit_count,
      greatest(count(*) - 1, 0)::integer AS rework_count
    FROM visits
    GROUP BY os_id, stage_code
  )
  INSERT INTO public.service_order_stage_summary (
    service_order_id, stage_code, first_entered_at, last_entered_at,
    visit_count, rework_count, updated_at
  )
  SELECT os_id, stage_code, first_entered_at, last_entered_at,
         visit_count, rework_count, now()
  FROM agg;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'stage_summary_rows', v_rows,
    'tray_clasificacion_seed', v_tray_seed,
    'tray_active', v_tray_active,
    'audit_logs_with_os', v_audit_with_os
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_audit_log_os_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_service_order_stage_summary() TO authenticated, service_role;

SELECT public.refresh_service_order_stage_summary();

-- Esperado tras parche:
--   stage_summary_rows  >> 1  (típico ~477+ con bandeja CAC)
--   tray_clasificacion_seed ≈ 472
--   clasificacion_cac en vw_kpi_production ≈ produccion_os de bandeja
