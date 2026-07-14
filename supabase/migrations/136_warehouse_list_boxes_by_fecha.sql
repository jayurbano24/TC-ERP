-- 136: Listado Bodega ordenado por Fecha Ingreso (más reciente → más antigua).
-- Cursor keyset: (created_at, id) usando el box_id del último ítem de página.

CREATE OR REPLACE FUNCTION public.warehouse_box_is_bodega_operational(p_rack text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    upper(coalesce(trim(p_rack), '')) NOT IN ('ELIMINADO', 'DESPACHO')
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'TALLER%'
    AND upper(coalesce(trim(p_rack), '')) <> 'SCRAP';
$$;

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
      count(*) FILTER (
        WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
      )::bigint AS series_count,
      count(DISTINCT coalesce(s.service_order_id, s.id))
        FILTER (
          WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
        )::bigint AS equipos_count,
      max(s.updated_at) FILTER (
        WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
      ) AS last_movement_at
    FROM public.series s
    WHERE s.current_box_id = b.id
  ) cnt ON cnt.equipos_count > 0
  LEFT JOIN LATERAL (
    SELECT
      s.current_status,
      s.brand_id,
      s.model_id,
      s.service_order_id
    FROM public.series s
    WHERE s.current_box_id = b.id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
    ORDER BY s.created_at ASC
    LIMIT 1
  ) samp ON true
  WHERE public.warehouse_box_is_bodega_operational(b.rack_location)
    AND (
      p_cursor IS NULL
      OR (b.created_at, b.id) < (
        SELECT c.created_at, c.id
        FROM public.boxes c
        WHERE c.id = p_cursor
      )
    )
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
  ORDER BY b.created_at DESC NULLS LAST, b.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 200));
$$;

-- Compat firma 3 args
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
    r.box_id,
    r.rack,
    r.label,
    r.series_count,
    r.sample_status,
    r.sample_brand_id,
    r.sample_model_id,
    r.sample_service_order_id,
    r.last_movement_at
  FROM public.warehouse_list_boxes_page(p_cursor, p_limit, p_search, NULL) r;
$$;

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
GRANT EXECUTE ON FUNCTION public.warehouse_list_boxes_page(uuid, integer, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_list_partial_boxes(integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
