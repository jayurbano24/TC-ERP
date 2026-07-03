-- 070: Stats bodega más rápidos — agregar por caja, no por cada serie

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
    count(*)::bigint AS total_boxes,
    coalesce(sum(cnt.series_count), 0)::bigint AS total_units
  FROM public.boxes b
  INNER JOIN LATERAL (
    SELECT count(*)::bigint AS series_count
    FROM public.series s
    WHERE s.current_box_id = b.id
  ) cnt ON cnt.series_count > 0
  LEFT JOIN LATERAL (
    SELECT s.model_id
    FROM public.series s
    WHERE s.current_box_id = b.id
    ORDER BY s.created_at ASC
    LIMIT 1
  ) samp ON true
  LEFT JOIN public.models m ON m.id = samp.model_id
  WHERE coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
  GROUP BY m.technology_id;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_stats_by_technology() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
