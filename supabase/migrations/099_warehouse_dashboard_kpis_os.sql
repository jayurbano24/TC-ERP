-- 099: KPIs Bodega por Equipos TC (OS), no por filas de serie.
-- Homogénea: un equipo (service_order_id) puede tener S1–S4; se cuenta 1 vez.

CREATE OR REPLACE FUNCTION public.warehouse_dashboard_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH series_in_boxes AS (
    SELECT
      s.id AS series_id,
      s.service_order_id,
      s.current_box_id,
      s.model_id,
      s.created_at
    FROM public.series s
    INNER JOIN public.boxes b ON b.id = s.current_box_id
    WHERE coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  ),
  box_equipos AS (
    SELECT
      b.id AS box_id,
      coalesce(nullif(b.capacity, 0), 1) AS capacity,
      count(DISTINCT coalesce(sib.service_order_id, sib.series_id))::bigint AS equipos,
      (
        SELECT m.technology_id
        FROM series_in_boxes x
        LEFT JOIN public.models m ON m.id = x.model_id
        WHERE x.current_box_id = b.id
        ORDER BY x.created_at ASC NULLS LAST
        LIMIT 1
      ) AS technology_id
    FROM public.boxes b
    INNER JOIN series_in_boxes sib ON sib.current_box_id = b.id
    GROUP BY b.id, b.capacity
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
      count(*) FILTER (WHERE equipos >= capacity)::bigint AS cajas_completas,
      count(*) FILTER (WHERE equipos > 0 AND equipos < capacity)::bigint AS cajas_parciales
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

-- Compat: misma semántica OS para consumidores del RPC viejo
CREATE OR REPLACE FUNCTION public.warehouse_stats_by_technology()
RETURNS TABLE (
  technology_id uuid,
  total_boxes bigint,
  total_units bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (x.elem->>'technology_id')::uuid AS technology_id,
    (x.elem->>'total_boxes')::bigint AS total_boxes,
    (x.elem->>'total_equipos')::bigint AS total_units
  FROM jsonb_array_elements(
    coalesce((public.warehouse_dashboard_kpis()->'by_technology'), '[]'::jsonb)
  ) AS x(elem);
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_dashboard_kpis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_stats_by_technology() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
