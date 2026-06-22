-- Motor 1: Libro mayor (service_orders) — inmutable por diseño.
-- Motor 2: Estado actual — 1 fila por OS, 1 ubicación operativa.
-- Motor 3: Timeline (erp_audit_logs / domain_events) — eventos crudos.
-- Motor 4: KPI — solo lee vistas / tablas consolidadas (nunca timeline directo).

-- =============================================================================
-- Motor 2 — Estado operativo actual (snapshot)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.service_order_operational_state (
  service_order_id UUID PRIMARY KEY REFERENCES public.service_orders(id) ON DELETE CASCADE,
  state_code       TEXT NOT NULL,
  state_label      TEXT NOT NULL,
  source_channel   TEXT, -- cac | px | unknown
  series_status    TEXT, -- current_status de la serie primaria (si aplica)
  tray_active      BOOLEAN,
  tray_excluded    TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_ops_state_code
  ON public.service_order_operational_state(state_code);

COMMENT ON TABLE public.service_order_operational_state IS
  'Motor 2: ubicación operativa actual. Exactamente 1 fila por OS. Debe sumar COUNT(service_orders).';

-- =============================================================================
-- Motor 3→4 — Resumen por OS + etapa (visitas / producción / retrabajo)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.service_order_stage_summary (
  service_order_id   UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  stage_code         TEXT NOT NULL,
  first_entered_at   TIMESTAMPTZ,
  last_entered_at    TIMESTAMPTZ,
  visit_count        INTEGER NOT NULL DEFAULT 0,
  rework_count       INTEGER NOT NULL DEFAULT 0, -- visit_count - 1 cuando visit_count > 0
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_order_id, stage_code)
);

CREATE INDEX IF NOT EXISTS idx_so_stage_summary_stage
  ON public.service_order_stage_summary(stage_code);

COMMENT ON TABLE public.service_order_stage_summary IS
  'Consolidado por OS+etapa. Producción = visit_count en 1ª visita; Calidad = rework_count.';

-- =============================================================================
-- Derivar estado operativo (1 OS → 1 bucket)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.derive_os_operational_state(p_os_id uuid)
RETURNS TABLE (
  state_code text,
  state_label text,
  source_channel text,
  series_status text,
  tray_active boolean,
  tray_excluded text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_os public.service_orders%ROWTYPE;
  v_rec public.receptions%ROWTYPE;
  v_tray public.cac_tray_units%ROWTYPE;
  v_status text;
  v_channel text;
BEGIN
  SELECT * INTO v_os FROM public.service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_os.reception_id IS NOT NULL THEN
    SELECT * INTO v_rec FROM public.receptions WHERE id = v_os.reception_id;
  END IF;

  v_channel := lower(coalesce(v_rec.source::text, 'unknown'));

  SELECT * INTO v_tray FROM public.cac_tray_units WHERE service_order_id = p_os_id;

  -- PX sin bandeja CAC activa
  IF v_channel = 'px' AND (v_tray IS NULL OR NOT v_tray.is_active) THEN
    RETURN QUERY SELECT
      'px_operativo'::text, 'PX · pipeline'::text, 'px'::text,
      NULL::text, v_tray.is_active, v_tray.excluded_reason;
    RETURN;
  END IF;

  -- CAC sin bandeja activa (clasificación incompleta / excluida)
  IF v_channel = 'cac' AND (v_tray IS NULL OR NOT v_tray.is_active) THEN
    RETURN QUERY SELECT
      'pendiente_clasificacion_cac'::text,
      'Pendiente clasificación CAC'::text,
      'cac'::text,
      NULL::text,
      coalesce(v_tray.is_active, false),
      v_tray.excluded_reason;
    RETURN;
  END IF;

  -- Serie primaria con marca (1 OS = 1 equipo)
  SELECT s.current_status::text INTO v_status
  FROM public.series s
  WHERE s.service_order_id = p_os_id AND s.brand_id IS NOT NULL
  ORDER BY
    CASE WHEN upper(trim(s.serial_number)) = upper(trim(v_os.main_serial)) THEN 0 ELSE 1 END,
    s.created_at
  LIMIT 1;

  IF v_status IS NULL THEN
    RETURN QUERY SELECT
      'pendiente_clasificacion_cac'::text,
      'Pendiente clasificación CAC'::text,
      v_channel,
      NULL::text,
      coalesce(v_tray.is_active, false),
      coalesce(v_tray.excluded_reason, 'no_series');
    RETURN;
  END IF;

  -- Mapa snapshot (una sola ubicación)
  IF v_status = 'RECEPCIONADO_BODEGA_GENERAL' THEN
    RETURN QUERY SELECT 'pendiente_ingreso_bodega'::text, 'Pendiente ingreso bodega'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSIF v_status IN ('in_central_warehouse', 'in_control_warehouse') THEN
    RETURN QUERY SELECT 'bodega'::text, 'Bodega'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSIF v_status = 'ready_to_dispatch' THEN
    RETURN QUERY SELECT 'despacho'::text, 'Despacho / listo salida'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSIF v_status = 'dispatched' THEN
    RETURN QUERY SELECT 'despachado'::text, 'Despachado'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSIF v_status IN ('scrapped', 'in_scraps', 'irreparable') THEN
    RETURN QUERY SELECT 'scrap'::text, 'Scrap / irreparable'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSIF v_status = 'returned' THEN
    RETURN QUERY SELECT 'devuelto'::text, 'Devuelto'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSIF v_status IN (
    'in_workshop', 'in_qc', 'in_validation', 'in_control_warehouse'
  ) THEN
    RETURN QUERY SELECT 'taller'::text, 'Taller'::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  ELSE
    RETURN QUERY SELECT 'otro'::text, ('Otro · ' || v_status)::text,
      v_channel, v_status, v_tray.is_active, v_tray.excluded_reason;
  END IF;
END;
$$;

-- =============================================================================
-- Refrescar Motor 2 (todas las OS del libro mayor)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_service_order_operational_states()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  INSERT INTO public.service_order_operational_state (
    service_order_id, state_code, state_label, source_channel,
    series_status, tray_active, tray_excluded, updated_at
  )
  SELECT
    so.id,
    d.state_code,
    d.state_label,
    d.source_channel,
    d.series_status,
    d.tray_active,
    d.tray_excluded,
    now()
  FROM public.service_orders so
  CROSS JOIN LATERAL public.derive_os_operational_state(so.id) d
  ON CONFLICT (service_order_id) DO UPDATE SET
    state_code = EXCLUDED.state_code,
    state_label = EXCLUDED.state_label,
    source_channel = EXCLUDED.source_channel,
    series_status = EXCLUDED.series_status,
    tray_active = EXCLUDED.tray_active,
    tray_excluded = EXCLUDED.tray_excluded,
    updated_at = now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('operational_states_upserted', v_updated);
END;
$$;

-- =============================================================================
-- Refrescar resumen por etapa (taller + bodega desde audit)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_service_order_stage_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  TRUNCATE public.service_order_stage_summary;

  WITH raw_events AS (
    SELECT
      s.service_order_id AS os_id,
      CASE
        WHEN al.action = 'INGRESO BODEGA' THEN 'ingreso_bodega'
        WHEN al.action = 'DESPACHO CREADO' THEN 'despacho'
        WHEN al.action = 'DIAGNÓSTICO INICIAL COMPLETADO' THEN 'diagnostico'
        WHEN al.action = 'REACONDICIONADO COMPLETADO' THEN 'reacondicionado'
        WHEN al.action = 'REPARACIÓN COMPLETADA' THEN 'reparacion'
        WHEN al.action = 'CONTROL DE CALIDAD COMPLETADO' THEN 'qc'
        WHEN al.new_values->>'result' = 'listo' THEN 'listo'
        WHEN al.new_values->>'result' = 'l3' THEN 'l3'
        WHEN al.new_values->>'result' = 'scraps' THEN 'scrap'
        ELSE NULL
      END AS stage_code,
      al.created_at
    FROM public.erp_audit_logs al
    JOIN public.series s ON s.id::text = al.record_id
    WHERE s.service_order_id IS NOT NULL
  ),
  filtered AS (
    SELECT * FROM raw_events WHERE stage_code IS NOT NULL
  ),
  visits AS (
    SELECT
      os_id,
      stage_code,
      created_at,
      row_number() OVER (PARTITION BY os_id, stage_code ORDER BY created_at) AS visit_n
    FROM filtered
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
  RETURN jsonb_build_object('stage_summary_rows', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_service_order_operational_states() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_service_order_stage_summary() TO authenticated;

-- =============================================================================
-- Motor 4 — Vistas KPI (no leen timeline crudo)
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_kpi_ledger AS
SELECT count(*)::bigint AS os_total FROM public.service_orders;

CREATE OR REPLACE VIEW public.vw_kpi_snapshot AS
SELECT
  state_code,
  state_label,
  count(*)::bigint AS os_count
FROM public.service_order_operational_state
GROUP BY state_code, state_label
ORDER BY os_count DESC;

CREATE OR REPLACE VIEW public.vw_kpi_snapshot_reconciliation AS
SELECT
  l.os_total AS ledger_total,
  coalesce(s.snapshot_total, 0) AS snapshot_total,
  l.os_total - coalesce(s.snapshot_total, 0) AS delta
FROM public.vw_kpi_ledger l
LEFT JOIN (
  SELECT sum(os_count)::bigint AS snapshot_total FROM public.vw_kpi_snapshot
) s ON true;

CREATE OR REPLACE VIEW public.vw_kpi_production AS
SELECT
  stage_code,
  count(*) FILTER (WHERE visit_count >= 1)::bigint AS produccion_os,
  sum(rework_count)::bigint AS retrabajos_eventos,
  sum(visit_count)::bigint AS eventos_totales
FROM public.service_order_stage_summary
GROUP BY stage_code
ORDER BY stage_code;

CREATE OR REPLACE VIEW public.vw_kpi_production_today AS
SELECT
  stage_code,
  count(*) FILTER (
    WHERE first_entered_at >= date_trunc('day', now())
      AND first_entered_at < date_trunc('day', now()) + interval '1 day'
  )::bigint AS produccion_hoy
FROM public.service_order_stage_summary
GROUP BY stage_code;

CREATE OR REPLACE VIEW public.vw_kpi_quality AS
SELECT
  stage_code,
  sum(rework_count)::bigint AS retrabajos,
  count(*) FILTER (WHERE rework_count > 0)::bigint AS os_con_retrabajo
FROM public.service_order_stage_summary
WHERE rework_count > 0
GROUP BY stage_code;

COMMENT ON VIEW public.vw_kpi_ledger IS 'Motor 1 — Libro mayor: COUNT(service_orders).';
COMMENT ON VIEW public.vw_kpi_snapshot IS 'Motor 2 — Snapshot: debe sumar vw_kpi_ledger.os_total.';
COMMENT ON VIEW public.vw_kpi_production IS 'Motor 4 — Producción por etapa (1ª visita) vs eventos/retrabajos.';

-- Población inicial
SELECT public.refresh_service_order_operational_states();
SELECT public.refresh_service_order_stage_summary();
