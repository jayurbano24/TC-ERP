-- 134: Bodega no lista cajas ya transferidas a Taller (TALLER-*).
-- BOX-1 en TALLER-DIAGNOSTICO no debe aparecer en Gestión de Bodega / KPIs.

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

-- Compat firma 3 args (sin fill_status)
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
    WHERE public.warehouse_box_is_bodega_operational(b.rack_location)
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  ),
  box_equipos AS (
    SELECT
      b.id AS box_id,
      coalesce(nullif(b.capacity, 0), 1) AS capacity,
      upper(coalesce(b.rack_location, '')) AS rack_u,
      b.status::text AS box_status,
      b.box_code,
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
    GROUP BY b.id, b.capacity, b.rack_location, b.status, b.box_code
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
          AND equipos >= capacity
      )::bigint AS cajas_completas,
      count(*) FILTER (
        WHERE rack_u = 'EN_PROCESO'
           OR box_code ILIKE 'TMP-%'
           OR (equipos > 0 AND equipos < capacity)
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

GRANT EXECUTE ON FUNCTION public.warehouse_box_is_bodega_operational(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_list_boxes_page(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_list_boxes_page(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_dashboard_kpis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_stats_by_technology() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
