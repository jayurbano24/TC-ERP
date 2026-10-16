-- 265 — Warranty Pack ETL (snapshot en Postgres; UI lee agregados sin N round-trips)

BEGIN;

CREATE TABLE IF NOT EXISTS public.warranty_pack_meta (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refreshed_at timestamptz,
  refresh_ms int,
  row_count int NOT NULL DEFAULT 0
);

INSERT INTO public.warranty_pack_meta (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.warranty_pack_os_snapshot (
  service_order_id uuid PRIMARY KEY REFERENCES public.service_orders(id) ON DELETE CASCADE,
  os_label text,
  main_serial text,
  model_id uuid,
  brand_id uuid,
  technology_id uuid,
  technology_name text NOT NULL DEFAULT 'Sin tecnología',
  brand_name text NOT NULL DEFAULT '—',
  model_name text NOT NULL DEFAULT 'Sin modelo',
  dispatched_at timestamptz,
  warranty_ends_at timestamptz,
  warranty_profile text CHECK (warranty_profile IS NULL OR warranty_profile IN ('listo', 'bueno')),
  warranty_status text NOT NULL DEFAULT 'na'
    CHECK (warranty_status IN ('en_garantia', 'vencida', 'na')),
  elegible boolean NOT NULL DEFAULT false,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_pack_os_snapshot_status_idx
  ON public.warranty_pack_os_snapshot (warranty_status, elegible);
CREATE INDEX IF NOT EXISTS warranty_pack_os_snapshot_tech_idx
  ON public.warranty_pack_os_snapshot (technology_id);
CREATE INDEX IF NOT EXISTS warranty_pack_os_snapshot_model_idx
  ON public.warranty_pack_os_snapshot (model_id);

ALTER TABLE public.warranty_pack_os_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_pack_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_pack_os_snapshot_select ON public.warranty_pack_os_snapshot;
CREATE POLICY warranty_pack_os_snapshot_select
  ON public.warranty_pack_os_snapshot FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS warranty_pack_meta_select ON public.warranty_pack_meta;
CREATE POLICY warranty_pack_meta_select
  ON public.warranty_pack_meta FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.warranty_pack_os_snapshot TO authenticated;
GRANT SELECT ON public.warranty_pack_meta TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_warranty_pack_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  v_ms int;
  v_rows int;
  v_period_days int := 90;
BEGIN
  -- Invocado desde API (service_role) o usuario autenticado (botón Actualizar).
  PERFORM set_config('statement_timeout', '180000', true);

  TRUNCATE public.warranty_pack_os_snapshot;

  INSERT INTO public.warranty_pack_os_snapshot (
    service_order_id,
    os_label,
    main_serial,
    model_id,
    brand_id,
    technology_id,
    technology_name,
    brand_name,
    model_name,
    dispatched_at,
    warranty_ends_at,
    warranty_profile,
    warranty_status,
    elegible,
    refreshed_at
  )
  WITH dispatched_os AS (
    SELECT
      so.id,
      so.os_label,
      so.main_serial,
      so.model_id,
      so.brand_id,
      so.closed_at,
      so.status
    FROM public.service_orders so
    WHERE upper(trim(coalesce(so.status, ''))) NOT IN (
        'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
      )
      AND (
        upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
        OR upper(trim(coalesce(so.status, ''))) LIKE '%DESPACHADO%'
        OR EXISTS (
          SELECT 1 FROM public.series s
          WHERE s.service_order_id = so.id
            AND s.current_status::text = 'dispatched'
        )
      )
  ),
  dispatch_at AS (
    SELECT
      d.id AS service_order_id,
      coalesce(
        (
          SELECT max(coalesce(disp.dispatched_at, di.created_at))
          FROM public.series s
          JOIN public.dispatch_items di ON di.series_id = s.id
          JOIN public.dispatches disp ON disp.id = di.dispatch_id
          WHERE s.service_order_id = d.id
        ),
        d.closed_at
      ) AS dispatched_at
    FROM dispatched_os d
  ),
  audit_flags AS (
    SELECT
      s.service_order_id,
      bool_or(
        upper(coalesce(al.action, '')) LIKE '%REPARACI%N COMPLETADA%'
        OR upper(coalesce(al.action, '')) LIKE '%REPARACION COMPLETADA%'
      ) AS had_repair,
      bool_or(
        upper(coalesce(al.action, '')) LIKE '%CONTROL DE CALIDAD COMPLETADO%'
        OR upper(coalesce(al.action, '')) LIKE '%REACONDICIONADO COMPLETADO%'
        OR upper(coalesce(al.action, '')) LIKE '%REACONDICI%N COMPLETADA%'
      ) AS had_qc_reacond
    FROM public.series s
    JOIN public.erp_audit_logs al ON al.record_id = s.id::text
    WHERE s.service_order_id IN (SELECT id FROM dispatched_os)
    GROUP BY s.service_order_id
  ),
  enriched AS (
    SELECT
      d.id AS service_order_id,
      d.os_label,
      d.main_serial,
      d.model_id,
      d.brand_id,
      m.technology_id,
      coalesce(t.name, 'Sin tecnología') AS technology_name,
      coalesce(b.name, '—') AS brand_name,
      coalesce(m.name, 'Sin modelo') AS model_name,
      da.dispatched_at,
      CASE
        WHEN upper(coalesce(p.clase_carcasa, '')) = 'B' THEN 'bueno'
        WHEN coalesce(af.had_repair, false) = false
          AND (
            coalesce(af.had_qc_reacond, false)
            OR coalesce(p.dictamen, '') ILIKE '%reacond%'
          ) THEN 'listo'
        ELSE NULL
      END AS warranty_profile,
      p.clase_carcasa,
      af.had_repair,
      af.had_qc_reacond,
      p.dictamen
    FROM dispatched_os d
    LEFT JOIN dispatch_at da ON da.service_order_id = d.id
    LEFT JOIN public.prediagnosticos p ON p.service_order_id = d.id
    LEFT JOIN audit_flags af ON af.service_order_id = d.id
    LEFT JOIN public.models m ON m.id = d.model_id
    LEFT JOIN public.brands b ON b.id = coalesce(d.brand_id, m.brand_id)
    LEFT JOIN public.technologies t ON t.id = m.technology_id
  )
  SELECT
    e.service_order_id,
    e.os_label,
    e.main_serial,
    e.model_id,
    e.brand_id,
    e.technology_id,
    e.technology_name,
    e.brand_name,
    e.model_name,
    e.dispatched_at,
    CASE
      WHEN e.dispatched_at IS NOT NULL AND e.warranty_profile IS NOT NULL
        THEN e.dispatched_at + make_interval(days => v_period_days)
      ELSE NULL
    END AS warranty_ends_at,
    e.warranty_profile,
    CASE
      WHEN e.dispatched_at IS NULL OR e.warranty_profile IS NULL THEN 'na'
      WHEN now() <= e.dispatched_at + make_interval(days => v_period_days) THEN 'en_garantia'
      ELSE 'vencida'
    END AS warranty_status,
    (e.warranty_profile IS NOT NULL) AS elegible,
    now()
  FROM enriched e;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_ms := (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::int;

  UPDATE public.warranty_pack_meta
  SET refreshed_at = now(), refresh_ms = v_ms, row_count = v_rows
  WHERE id = 1;

  RETURN jsonb_build_object(
    'row_count', v_rows,
    'refresh_ms', v_ms,
    'refreshed_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_warranty_pack_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH meta AS (
    SELECT refreshed_at, refresh_ms, row_count FROM public.warranty_pack_meta WHERE id = 1
  ),
  base AS (
    SELECT * FROM public.warranty_pack_os_snapshot
  ),
  counts AS (
    SELECT
      count(*)::int AS total_os_despachadas,
      count(*) FILTER (WHERE dispatched_at IS NOT NULL)::int AS os_con_fecha,
      count(*) FILTER (WHERE dispatched_at IS NULL)::int AS os_sin_fecha,
      count(*) FILTER (WHERE elegible AND warranty_status = 'en_garantia')::int AS en_garantia,
      count(*) FILTER (WHERE elegible AND warranty_status = 'vencida')::int AS vencida,
      count(*) FILTER (WHERE elegible)::int AS elegibles
    FROM base
  ),
  by_tech AS (
    SELECT
      coalesce(technology_id::text, 'unknown') AS id,
      technology_name AS label,
      count(*) FILTER (WHERE warranty_status = 'en_garantia')::int AS en_garantia,
      count(*) FILTER (WHERE warranty_status = 'vencida')::int AS vencida,
      count(*)::int AS total
    FROM base
    WHERE elegible
    GROUP BY technology_id, technology_name
    ORDER BY total DESC, label
  ),
  by_model AS (
    SELECT
      coalesce(model_id::text, 'unknown') AS id,
      model_name AS label,
      count(*) FILTER (WHERE warranty_status = 'en_garantia')::int AS en_garantia,
      count(*) FILTER (WHERE warranty_status = 'vencida')::int AS vencida,
      count(*)::int AS total
    FROM base
    WHERE elegible
    GROUP BY model_id, model_name
    ORDER BY total DESC, label
  ),
  reing AS (
    SELECT
      (SELECT count(*)::int FROM public.service_orders WHERE ingress_kind = 'garantia') AS reingresos_garantia,
      (SELECT count(*)::int FROM public.service_orders so
       WHERE so.reentry_count > 1
         AND so.warranty_basis_dispatch_at IS NOT NULL
         AND so.created_at >= so.warranty_basis_dispatch_at
         AND so.created_at <= so.warranty_basis_dispatch_at + interval '90 days'
      ) AS reingresos_en_ventana_90
  )
  SELECT jsonb_build_object(
    'periodDays', 90,
    'totalOsDespachadas', (SELECT total_os_despachadas FROM counts),
    'osConFechaDespacho', (SELECT os_con_fecha FROM counts),
    'osSinFechaDespacho', (SELECT os_sin_fecha FROM counts),
    'enGarantia', (SELECT en_garantia FROM counts),
    'vencida', (SELECT vencida FROM counts),
    'elegiblesDespachados', (SELECT elegibles FROM counts),
    'reingresosGarantia', (SELECT reingresos_garantia FROM reing),
    'reingresosEnVentana90', (SELECT reingresos_en_ventana_90 FROM reing),
    'byTechnology', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'enGarantia', en_garantia, 'vencida', vencida, 'total', total
    )) FROM by_tech), '[]'::jsonb),
    'byModel', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'enGarantia', en_garantia, 'vencida', vencida, 'total', total
    )) FROM by_model), '[]'::jsonb),
    'snapshotRefreshedAt', (SELECT refreshed_at FROM meta),
    'snapshotRefreshMs', (SELECT refresh_ms FROM meta),
    'snapshotRowCount', (SELECT row_count FROM meta),
    'computedAt', now()
  );
$$;

REVOKE ALL ON FUNCTION public.refresh_warranty_pack_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_warranty_pack_snapshot() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_warranty_pack_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warranty_pack_summary() TO authenticated, service_role;

COMMIT;
