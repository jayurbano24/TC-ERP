-- 129: Listado de cajas Full/Parcial (semántica OS = warehouse_dashboard_kpis).
-- Agrega overload de 4 args + helper dedicado para "Cajas en Proceso".
-- No rompe la firma vieja de 3 args (coexisten).

CREATE OR REPLACE FUNCTION public.warehouse_list_boxes_page(
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_search text DEFAULT NULL,
  p_fill_status text DEFAULT NULL
)
RETURNS TABLE (
  box_id uuid,
  rack text,
  label text,
  series_count bigint,
  equipos_count bigint,
  capacity integer,
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
    cnt.equipos_count,
    b.capacity,
    samp.current_status::text,
    samp.brand_id,
    samp.model_id,
    samp.service_order_id,
    cnt.last_movement_at
  FROM public.boxes b
  INNER JOIN LATERAL (
    SELECT
      count(*)::bigint AS series_count,
      count(DISTINCT coalesce(s.service_order_id, s.id))
        FILTER (
          WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
        )::bigint AS equipos_count,
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
    AND (
      p_fill_status IS NULL
      OR lower(trim(p_fill_status)) IN ('', 'all')
      OR (
        lower(trim(p_fill_status)) IN ('partial', 'parcial')
        AND cnt.equipos_count > 0
        AND cnt.equipos_count < coalesce(nullif(b.capacity, 0), 1)
      )
      OR (
        lower(trim(p_fill_status)) IN ('full', 'completa', 'completas')
        AND cnt.equipos_count >= coalesce(nullif(b.capacity, 0), 1)
      )
    )
  ORDER BY b.id ASC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 200));
$$;

-- Helper explícito para la tarjeta "Cajas en Proceso"
CREATE OR REPLACE FUNCTION public.warehouse_list_partial_boxes(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  box_id uuid,
  rack text,
  label text,
  series_count bigint,
  equipos_count bigint,
  capacity integer,
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
  SELECT *
  FROM public.warehouse_list_boxes_page(
    NULL,
    greatest(1, least(coalesce(p_limit, 50), 200)),
    NULL,
    'partial'
  );
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_list_boxes_page(uuid, integer, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_list_partial_boxes(integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
