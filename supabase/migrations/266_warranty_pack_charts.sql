-- 266 — Warranty Pack: tendencia mensual + cobertura (gráficos UI)

BEGIN;

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
      count(*) FILTER (WHERE elegible)::int AS elegibles,
      count(*) FILTER (WHERE NOT elegible)::int AS no_elegibles
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
  by_month AS (
    SELECT
      to_char(date_trunc('month', dispatched_at AT TIME ZONE 'America/Guatemala'), 'YYYY-MM') AS period,
      count(*)::int AS despachadas,
      count(*) FILTER (WHERE elegible)::int AS elegibles,
      count(*) FILTER (WHERE elegible AND warranty_status = 'en_garantia')::int AS en_garantia,
      count(*) FILTER (WHERE elegible AND warranty_status = 'vencida')::int AS vencida
    FROM base
    WHERE dispatched_at IS NOT NULL
      AND dispatched_at >= (now() - interval '12 months')
    GROUP BY 1
    ORDER BY 1
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
    'noElegiblesPerfil', (SELECT no_elegibles FROM counts),
    'reingresosGarantia', (SELECT reingresos_garantia FROM reing),
    'reingresosEnVentana90', (SELECT reingresos_en_ventana_90 FROM reing),
    'byTechnology', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'enGarantia', en_garantia, 'vencida', vencida, 'total', total
    )) FROM by_tech), '[]'::jsonb),
    'byModel', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'enGarantia', en_garantia, 'vencida', vencida, 'total', total
    )) FROM by_model), '[]'::jsonb),
    'trendByMonth', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'period', period,
      'despachadas', despachadas,
      'elegibles', elegibles,
      'enGarantia', en_garantia,
      'vencida', vencida
    ) ORDER BY period) FROM by_month), '[]'::jsonb),
    'snapshotRefreshedAt', (SELECT refreshed_at FROM meta),
    'snapshotRefreshMs', (SELECT refresh_ms FROM meta),
    'snapshotRowCount', (SELECT row_count FROM meta),
    'computedAt', now()
  );
$$;

COMMIT;
