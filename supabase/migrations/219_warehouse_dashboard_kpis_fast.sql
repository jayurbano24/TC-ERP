-- 219: KPI Gestión de Bodega — totales reales y rápidos (sin timeout).
-- Total Cajas / Equipos TC deben contar TODO el stock operativo, no la página de 30.

CREATE OR REPLACE FUNCTION public.warehouse_dashboard_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      s.current_box_id AS box_id,
      coalesce(s.service_order_id, s.id) AS equipo_id,
      m.technology_id,
      upper(coalesce(b.rack_location, '')) AS rack_u,
      b.box_code,
      coalesce(nullif(b.capacity, 0), 1) AS capacity
    FROM public.series s
    INNER JOIN public.boxes b ON b.id = s.current_box_id
    LEFT JOIN public.models m ON m.id = s.model_id
    WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
      AND public.warehouse_box_is_bodega_operational(b.rack_location)
  ),
  box_equipos AS (
    SELECT
      box_id,
      rack_u,
      box_code,
      max(capacity) AS capacity,
      count(DISTINCT equipo_id)::bigint AS equipos,
      (array_agg(technology_id) FILTER (WHERE technology_id IS NOT NULL))[1] AS technology_id
    FROM scoped
    GROUP BY box_id, rack_u, box_code
  ),
  by_tech AS (
    SELECT
      technology_id,
      count(*)::bigint AS total_boxes,
      coalesce(sum(equipos), 0)::bigint AS total_equipos
    FROM box_equipos
    GROUP BY technology_id
  ),
  totals AS (
    SELECT
      count(*)::bigint AS total_boxes,
      coalesce(sum(equipos), 0)::bigint AS total_equipos,
      count(*) FILTER (
        WHERE NOT (rack_u = 'EN_PROCESO' OR box_code ILIKE 'TMP-%')
          AND equipos > 0
      )::bigint AS cajas_completas,
      count(*) FILTER (
        WHERE rack_u = 'EN_PROCESO'
           OR box_code ILIKE 'TMP-%'
      )::bigint AS cajas_parciales
    FROM box_equipos
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'total_boxes', t.total_boxes,
        'total_equipos', t.total_equipos,
        'cajas_completas', t.cajas_completas,
        'cajas_parciales', t.cajas_parciales
      )
      FROM totals t
    ),
    'by_technology', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'technology_id', bt.technology_id,
            'total_boxes', bt.total_boxes,
            'total_equipos', bt.total_equipos
          )
          ORDER BY bt.total_equipos DESC
        )
        FROM by_tech bt
      ),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_dashboard_kpis() TO authenticated, service_role;

-- Totales livianos (fallback si el KPI completo sigue lento)
CREATE OR REPLACE FUNCTION public.warehouse_dashboard_totals_fast()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      s.current_box_id AS box_id,
      coalesce(s.service_order_id, s.id) AS equipo_id,
      upper(coalesce(b.rack_location, '')) AS rack_u,
      b.box_code
    FROM public.series s
    INNER JOIN public.boxes b ON b.id = s.current_box_id
    WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
      AND public.warehouse_box_is_bodega_operational(b.rack_location)
  ),
  box_equipos AS (
    SELECT
      box_id,
      rack_u,
      box_code,
      count(DISTINCT equipo_id)::bigint AS equipos
    FROM scoped
    GROUP BY box_id, rack_u, box_code
  )
  SELECT jsonb_build_object(
    'total_boxes', count(*)::bigint,
    'total_equipos', coalesce(sum(equipos), 0)::bigint,
    'cajas_completas', count(*) FILTER (
      WHERE NOT (rack_u = 'EN_PROCESO' OR box_code ILIKE 'TMP-%') AND equipos > 0
    )::bigint,
    'cajas_parciales', count(*) FILTER (
      WHERE rack_u = 'EN_PROCESO' OR box_code ILIKE 'TMP-%'
    )::bigint
  )
  FROM box_equipos;
$$;

REVOKE ALL ON FUNCTION public.warehouse_dashboard_totals_fast() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_dashboard_totals_fast()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.warehouse_dashboard_totals_fast() IS
  'Totales globales Gestión de Bodega (cajas + equipos OS). Rápido; sin breakdown por tech.';

CREATE INDEX IF NOT EXISTS idx_series_warehouse_box_status
  ON public.series (current_status, current_box_id)
  WHERE current_box_id IS NOT NULL
    AND current_status IN ('in_central_warehouse', 'in_control_warehouse');

NOTIFY pgrst, 'reload schema';

SELECT public.warehouse_dashboard_totals_fast() AS totals_fast;
