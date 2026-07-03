-- =============================================================================
-- 092 — Índices operativos + materialized views para dashboards (sin COUNT masivo)
-- Complementa 037/046/064/086/087/088. Refresco: cron 5–10 min vía
--   POST /api/internal/refresh-summary-views  (header x-cron-secret)
-- =============================================================================

-- ── series (087 ya cubre status+updated_at, box_id, service_order_id compuesto) ──
CREATE INDEX IF NOT EXISTS idx_series_current_box_id_plain
  ON public.series (current_box_id);

-- ── service_orders ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_service_orders_status
  ON public.service_orders (status);

CREATE INDEX IF NOT EXISTS idx_service_orders_model_id
  ON public.service_orders (model_id)
  WHERE model_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_created_at
  ON public.service_orders (created_at DESC);

-- os_label actúa como número de OS (TC-xxx); no existe columna os_number en schema vivo
CREATE INDEX IF NOT EXISTS idx_service_orders_os_label
  ON public.service_orders (os_label)
  WHERE os_label IS NOT NULL;

-- ── boxes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_boxes_status
  ON public.boxes (status);

CREATE INDEX IF NOT EXISTS idx_boxes_last_dispatch_batch
  ON public.boxes (last_dispatch_batch_id)
  WHERE last_dispatch_batch_id IS NOT NULL;

-- ── px_reception_equipment ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_px_equipment_reception_id
  ON public.px_reception_equipment (reception_id);

CREATE INDEX IF NOT EXISTS idx_px_equipment_box_id
  ON public.px_reception_equipment (box_id);

CREATE INDEX IF NOT EXISTS idx_px_equipment_main_serial_upper
  ON public.px_reception_equipment (upper(trim(main_serial)));

CREATE INDEX IF NOT EXISTS idx_px_equipment_capture_status
  ON public.px_reception_equipment (capture_status);

-- ── mv_dashboard: KPIs transversales (1 fila, refresh CONCURRENTLY) ──────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_dashboard AS
SELECT
  1 AS snapshot_id,
  (SELECT count(*)::bigint FROM public.series
   WHERE current_status::text IN ('in_central_warehouse', 'in_control_warehouse')) AS bodega_series,
  (SELECT count(DISTINCT s.service_order_id)::bigint
   FROM public.series s
   WHERE s.current_status::text = 'in_workshop' AND s.service_order_id IS NOT NULL) AS taller_diagnostico_os,
  (SELECT count(DISTINCT s.service_order_id)::bigint
   FROM public.series s
   WHERE s.current_status::text = 'in_qc' AND s.service_order_id IS NOT NULL) AS taller_reparacion_os,
  (SELECT count(DISTINCT s.service_order_id)::bigint
   FROM public.series s
   WHERE s.current_status::text = 'ready_to_dispatch' AND s.service_order_id IS NOT NULL) AS taller_listo_os,
  (SELECT count(*)::bigint FROM public.receptions
   WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Guatemala')
     AND upper(coalesce(status, '')) NOT IN ('ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO')) AS recepciones_hoy,
  (SELECT count(*)::bigint FROM public.series
   WHERE updated_at >= date_trunc('day', now() AT TIME ZONE 'America/Guatemala')) AS series_movidas_hoy,
  now() AS refreshed_at;

CREATE UNIQUE INDEX IF NOT EXISTS mv_dashboard_snapshot_id
  ON public.mv_dashboard (snapshot_id);

-- ── mv_workshop: colas por estado (pestañas taller) ──────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_workshop AS
SELECT
  s.current_status::text AS status,
  count(DISTINCT s.service_order_id)::integer AS os_count,
  count(*)::integer AS series_count,
  max(s.updated_at) AS last_updated
FROM public.series s
WHERE s.service_order_id IS NOT NULL
  AND s.current_status::text IN (
    'in_workshop', 'in_qc', 'in_validation', 'ready_to_dispatch',
    'in_control_warehouse', 'irreparable', 'scrapped'
  )
GROUP BY s.current_status::text;

CREATE UNIQUE INDEX IF NOT EXISTS mv_workshop_status
  ON public.mv_workshop (status);

-- ── mv_bodega: inventario por ubicación de rack ──────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_bodega AS
SELECT
  coalesce(b.rack_location, 'SIN_UBICACION') AS rack_location,
  count(DISTINCT b.id)::integer AS box_count,
  count(s.id)::integer AS series_count,
  max(s.updated_at) AS last_series_update
FROM public.boxes b
LEFT JOIN public.series s ON s.current_box_id = b.id
WHERE upper(coalesce(b.rack_location, '')) NOT IN ('DESPACHO', 'ELIMINADO')
GROUP BY coalesce(b.rack_location, 'SIN_UBICACION');

CREATE UNIQUE INDEX IF NOT EXISTS mv_bodega_rack_location
  ON public.mv_bodega (rack_location);

-- ── mv_rrhh: marcaciones ZKTeco (últimos 90 días) si existe zk_raw_logs ──────
DO $$
BEGIN
  IF to_regclass('public.zk_raw_logs') IS NOT NULL THEN
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_rrhh AS
      SELECT
        date_trunc('day', check_time AT TIME ZONE 'America/Guatemala')::date AS work_day,
        count(*)::integer AS punch_count,
        count(DISTINCT user_pin)::integer AS distinct_pins
      FROM public.zk_raw_logs
      WHERE check_time >= now() - interval '90 days'
      GROUP BY 1
    $mv$;
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS mv_rrhh_work_day
        ON public.mv_rrhh (work_day)
    $idx$;
  ELSE
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_rrhh AS
      SELECT
        current_date AS work_day,
        0::integer AS punch_count,
        0::integer AS distinct_pins
      WHERE false
    $mv$;
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS mv_rrhh_work_day
        ON public.mv_rrhh (work_day)
    $idx$;
  END IF;
END $$;

-- ── mv_sap: resumen cargas/validaciones SAP ──────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.sap_uploads') IS NOT NULL
     AND to_regclass('public.sap_validation_sessions') IS NOT NULL THEN
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_sap AS
      SELECT
        date_trunc('day', u.fecha AT TIME ZONE 'America/Guatemala')::date AS upload_day,
        count(DISTINCT u.id)::integer AS uploads,
        count(DISTINCT vs.id)::integer AS validation_sessions,
        count(DISTINCT vs.id) FILTER (WHERE coalesce(vs.activa, false))::integer AS active_sessions
      FROM public.sap_uploads u
      LEFT JOIN public.sap_validation_sessions vs ON vs.upload_id = u.id
      WHERE u.fecha >= now() - interval '180 days'
      GROUP BY 1
    $mv$;
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS mv_sap_upload_day
        ON public.mv_sap (upload_day)
    $idx$;
  ELSE
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_sap AS
      SELECT
        current_date AS upload_day,
        0::integer AS uploads,
        0::integer AS validation_sessions,
        0::integer AS active_sessions
      WHERE false
    $mv$;
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS mv_sap_upload_day
        ON public.mv_sap (upload_day)
    $idx$;
  END IF;
END $$;

-- ── Refresh unificado (088 + 092); CONCURRENTLY requiere índice UNIQUE ────────
-- 088 declaró RETURNS void; hay que dropear antes de cambiar a jsonb.
DROP FUNCTION IF EXISTS public.refresh_enterprise_summary_views();

CREATE OR REPLACE FUNCTION public.refresh_enterprise_summary_views()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_views text[] := ARRAY[
    'mv_bodega_inventory',
    'mv_workshop_diagnostico',
    'mv_dashboard',
    'mv_workshop',
    'mv_bodega',
    'mv_rrhh',
    'mv_sap'
  ];
  v_view text;
  v_refreshed text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_view IN ARRAY v_views LOOP
    IF to_regclass('public.' || v_view) IS NULL THEN
      v_skipped := array_append(v_skipped, v_view);
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', v_view);
    EXCEPTION
      WHEN OTHERS THEN
        EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', v_view);
    END;

    v_refreshed := array_append(v_refreshed, v_view);
  END LOOP;

  RETURN jsonb_build_object(
    'refreshed_at', now(),
    'duration_ms', (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
    'refreshed', to_jsonb(v_refreshed),
    'skipped', to_jsonb(v_skipped)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_enterprise_summary_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_enterprise_summary_views() TO service_role;

-- Lectura autenticada (dashboards vía API server-side)
DO $$
BEGIN
  IF to_regclass('public.mv_dashboard') IS NOT NULL THEN
    GRANT SELECT ON public.mv_dashboard TO authenticated, service_role;
  END IF;
  IF to_regclass('public.mv_workshop') IS NOT NULL THEN
    GRANT SELECT ON public.mv_workshop TO authenticated, service_role;
  END IF;
  IF to_regclass('public.mv_bodega') IS NOT NULL THEN
    GRANT SELECT ON public.mv_bodega TO authenticated, service_role;
  END IF;
  IF to_regclass('public.mv_rrhh') IS NOT NULL THEN
    GRANT SELECT ON public.mv_rrhh TO authenticated, service_role;
  END IF;
  IF to_regclass('public.mv_sap') IS NOT NULL THEN
    GRANT SELECT ON public.mv_sap TO authenticated, service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
