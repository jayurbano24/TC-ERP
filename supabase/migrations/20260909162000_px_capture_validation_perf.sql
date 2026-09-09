-- PX 6C: validation_ms — alinear expresiones con índices + rutas index-friendly.
-- Problema: px_find_active_serial_capture usaba upper(sl.serial_number) sin trim → seq scan.
--           px_find_open_os_for_serial usaba OR + EXISTS → bitmap heap scan masivo.

-- Índice compuesto para lookup serie → OS (ruta by_series)
CREATE INDEX IF NOT EXISTS idx_series_serial_upper_trim_so
  ON public.series (upper(trim(serial_number)), service_order_id);

COMMENT ON INDEX public.idx_series_serial_upper_trim_so IS
  'PX capture: px_find_open_os_for_serial ruta by_series (index-only path).';

-- ---------------------------------------------------------------------------
-- px_find_active_serial_capture: expresión = idx_px_serial_lines_serial_upper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.px_find_active_serial_capture(p_serial text)
RETURNS TABLE (
  reception_id uuid,
  guide_number text,
  sap_document text,
  box_id uuid,
  box_code text,
  equipment_id uuid,
  main_serial text,
  slot smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    e.reception_id,
    r.guide_number,
    r.sap_document,
    e.box_id,
    b.box_code,
    e.id AS equipment_id,
    e.main_serial,
    sl.slot
  FROM public.px_reception_serial_lines sl
  JOIN public.px_reception_equipment e
    ON e.id = sl.equipment_id
   AND e.capture_status = 'active'
  JOIN public.receptions r ON r.id = e.reception_id
  JOIN public.boxes b ON b.id = e.box_id
  WHERE upper(trim(sl.serial_number)) = upper(trim(p_serial))
    AND upper(coalesce(r.status, '')) NOT IN (
      'ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO', 'DEVUELTO'
    )
  ORDER BY e.captured_at NULLS LAST
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- px_find_open_os_for_serial: UNION index-friendly (sin OR sobre service_orders)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.px_find_open_os_for_serial(
  p_serial text,
  p_current_reception_id uuid
)
RETURNS TABLE (
  existing_os_id uuid,
  existing_os_number text,
  existing_os_status text,
  existing_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH normalized AS (
    SELECT upper(trim(p_serial)) AS serial
    WHERE public.is_valid_equipment_serial(p_serial)
  ),
  by_main AS (
    SELECT
      so.id,
      so.os_label,
      so.status,
      so.created_at,
      so.reception_id
    FROM normalized n
    JOIN public.service_orders so
      ON upper(trim(so.main_serial)) = n.serial
  ),
  by_series AS (
    SELECT
      so.id,
      so.os_label,
      so.status,
      so.created_at,
      so.reception_id
    FROM normalized n
    JOIN public.series sx
      ON upper(trim(sx.serial_number)) = n.serial
    JOIN public.service_orders so
      ON so.id = sx.service_order_id
  ),
  combined AS (
    SELECT DISTINCT ON (u.id)
      u.id,
      u.os_label,
      u.status,
      u.created_at,
      u.reception_id
    FROM (
      SELECT * FROM by_main
      UNION ALL
      SELECT * FROM by_series
    ) u
    ORDER BY u.id, u.created_at DESC
  ),
  candidates AS (
    SELECT
      c.id,
      c.os_label,
      c.status,
      c.created_at,
      matched.current_status AS matched_series_status,
      coalesce(
        matched.entry_source,
        r.source::text,
        'unknown'
      ) AS source
    FROM combined c
    LEFT JOIN LATERAL (
      SELECT
        s.current_status::text AS current_status,
        s.entry_source::text AS entry_source
      FROM public.series s
      WHERE s.service_order_id = c.id
        AND upper(trim(s.serial_number)) = (SELECT serial FROM normalized)
      ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
      LIMIT 1
    ) matched ON true
    LEFT JOIN public.receptions r ON r.id = c.reception_id
    WHERE c.reception_id IS DISTINCT FROM p_current_reception_id
      AND NOT (
        upper(trim(coalesce(c.status, ''))) IN ('DESPACHADO', 'CERRADO')
        OR public.series_status_is_terminal(matched.current_status)
      )
  )
  SELECT
    c.id,
    c.os_label,
    c.status,
    c.source
  FROM candidates c
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.px_find_active_serial_capture(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.px_find_active_serial_capture(text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.px_find_open_os_for_serial(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.px_find_open_os_for_serial(text, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
