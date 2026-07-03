-- 069: Evitar statement timeout en Bodega V2
-- La vista warehouse_box_summary agrega TODA la tabla series en cada consulta.
-- Estas RPC paginan primero las cajas y solo agregan las series de cada página.

CREATE OR REPLACE FUNCTION public.warehouse_list_boxes_page(
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  box_id uuid,
  rack text,
  label text,
  series_count bigint,
  sample_status text,
  sample_brand_id uuid,
  sample_model_id uuid,
  sample_service_order_id uuid,
  last_movement_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.rack_location,
    b.box_code,
    cnt.series_count,
    samp.current_status::text,
    samp.brand_id,
    samp.model_id,
    samp.service_order_id,
    cnt.last_movement_at
  FROM public.boxes b
  INNER JOIN LATERAL (
    SELECT
      count(*)::bigint AS series_count,
      max(s.updated_at) AS last_movement_at
    FROM public.series s
    WHERE s.current_box_id = b.id
  ) cnt ON cnt.series_count > 0
  LEFT JOIN LATERAL (
    SELECT
      s.current_status,
      s.brand_id,
      s.model_id,
      s.service_order_id
    FROM public.series s
    WHERE s.current_box_id = b.id
    ORDER BY s.created_at ASC
    LIMIT 1
  ) samp ON true
  WHERE coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
    AND (p_cursor IS NULL OR b.id > p_cursor)
    AND (
      p_search IS NULL
      OR trim(p_search) = ''
      OR b.box_code ILIKE '%' || trim(p_search) || '%'
      OR coalesce(b.rack_location, '') ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY b.id ASC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 200));
$$;

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
    m.technology_id,
    count(DISTINCT b.id)::bigint AS total_boxes,
    count(s.id)::bigint AS total_units
  FROM public.boxes b
  INNER JOIN public.series s ON s.current_box_id = b.id
  LEFT JOIN public.models m ON m.id = s.model_id
  WHERE coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
  GROUP BY m.technology_id;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_list_boxes_page(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_stats_by_technology() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
