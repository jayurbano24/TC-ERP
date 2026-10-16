-- 267 — Fix ETL: public.dispatches no tiene created_at (usar dispatched_at + dispatch_items.created_at)

BEGIN;

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

COMMIT;
