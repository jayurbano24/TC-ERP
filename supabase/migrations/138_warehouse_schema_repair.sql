-- 138: Reparación esquema bodega / operator UUID / sin CREATE VIEW.
-- Ejecutar SOLO en SQL Editor (sesión writable). No usar RPC STABLE ni conn read-only.
--
-- Corrige:
--   * 25006 — evita CREATE VIEW
--   * 42703 — alias operator_id / operator_name como columnas generadas
--   * 42883 — garantiza warehouse_box_is_bodega_operational(text)
--   * historial caja con nombre desde profiles

-- ---------------------------------------------------------------------------
-- 1) Helper rack operacional (firma text)
-- ---------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.warehouse_box_is_bodega_operational(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Alias de columnas (sin vista): operator_id / operator_name
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_movements'
      AND column_name = 'operator_id'
  ) THEN
    ALTER TABLE public.warehouse_movements
      ADD COLUMN operator_id uuid
      GENERATED ALWAYS AS (performed_by) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_movements'
      AND column_name = 'operator_name'
  ) THEN
    ALTER TABLE public.warehouse_movements
      ADD COLUMN operator_name text
      GENERATED ALWAYS AS (performed_by_name) STORED;
  END IF;
END $$;

-- Si quedó la vista a medias de 137, no bloquea; se puede dropear con seguridad
DROP VIEW IF EXISTS public.warehouse_movements_with_operator;

-- ---------------------------------------------------------------------------
-- 3) Historial de caja (jsonb) — performed_by + profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_get_box_history(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(m) ORDER BY m.ts DESC)
  INTO v_history
  FROM (
    SELECT
      wm.movement_type,
      wm.source_module,
      wm.target_module,
      wm.source_location,
      wm.target_location,
      coalesce(
        nullif(trim(wm.performed_by_name), ''),
        nullif(trim(wm.operator_name), ''),
        nullif(trim(p.full_name), ''),
        nullif(trim(p.email), ''),
        'Sistema'
      ) AS user_name,
      wm.performed_by,
      wm.performed_by_name,
      wm.operator_id,
      wm.operator_name,
      wm.created_at AS ts,
      wm.created_at AS timestamp,
      wm.series_count,
      wm.reason,
      wm.guide_number
    FROM public.warehouse_movements wm
    LEFT JOIN public.profiles p ON p.id = wm.performed_by
    WHERE wm.box_id = p_box_id
  ) m;

  RETURN coalesce(v_history, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_get_box_history(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Listado bodega por fecha (inline + helper) — por si 136 no aplicó
-- ---------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.warehouse_list_boxes_page(uuid, integer, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5) (Opcional) Asignar rol bodega al usuario actual — descomentar y poner UUID
-- ---------------------------------------------------------------------------
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('TU-USER-UUID'::uuid, 'bodega'::public.app_role)
-- ON CONFLICT DO NOTHING;
