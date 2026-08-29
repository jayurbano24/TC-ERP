-- =============================================================================
-- 227 — Taller SCRAPS: si la OS ya tiene series en caja Bodega SCRAPS, fuera.
-- Cola/conteo = irreparable sin caja Y sin hermanos ya en BOX-BAD / rack SCRAP.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.series_os_has_scrap_box(p_service_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.series s2
    JOIN public.boxes b ON b.id = s2.current_box_id
    WHERE s2.service_order_id = p_service_order_id
      AND s2.current_box_id IS NOT NULL
      AND (
        upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
        OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
        OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.series_os_has_scrap_box(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_os_has_scrap_box(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_workshop_os_by_status(p_status text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(DISTINCT s.service_order_id)::integer
  FROM public.series s
  WHERE s.current_status::text = p_status
    AND s.service_order_id IS NOT NULL
    AND (
      p_status <> 'irreparable'
      OR (
        s.current_box_id IS NULL
        AND NOT public.series_os_has_scrap_box(s.service_order_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.count_workshop_os_by_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_workshop_os_by_status(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.workshop_list_os_queue_page(
  p_status text,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  service_order_id uuid,
  os_label text,
  series_count integer,
  sample_serial text,
  last_updated timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT s.*
    FROM public.series s
    WHERE s.current_status::text = p_status
      AND s.service_order_id IS NOT NULL
      AND (
        p_status <> 'irreparable'
        OR (
          s.current_box_id IS NULL
          AND NOT public.series_os_has_scrap_box(s.service_order_id)
        )
      )
  ),
  grouped AS (
    SELECT
      e.service_order_id,
      so.os_label,
      count(*)::integer AS series_count,
      min(e.serial_number) AS sample_serial,
      max(e.updated_at) AS last_updated
    FROM eligible e
    JOIN public.service_orders so ON so.id = e.service_order_id
    GROUP BY e.service_order_id, so.os_label
  )
  SELECT g.service_order_id, g.os_label, g.series_count, g.sample_serial, g.last_updated
  FROM grouped g
  WHERE (p_cursor IS NULL OR g.service_order_id > p_cursor)
  ORDER BY g.service_order_id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.workshop_list_os_queue_page(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workshop_list_os_queue_page(text, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_workshop_os_all_tabs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'diagnostico',     (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_workshop' AND service_order_id IS NOT NULL),
    'reparacion',      (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_qc' AND service_order_id IS NOT NULL),
    'qc',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_validation' AND service_order_id IS NOT NULL),
    'reacondicionado', (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'ready_to_dispatch' AND service_order_id IS NOT NULL),
    'l3',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_control_warehouse' AND service_order_id IS NOT NULL),
    'scraps',          (
      SELECT count(DISTINCT s.service_order_id)
      FROM public.series s
      WHERE s.current_status::text = 'irreparable'
        AND s.service_order_id IS NOT NULL
        AND s.current_box_id IS NULL
        AND NOT public.series_os_has_scrap_box(s.service_order_id)
    ),
    'listo', (
      SELECT count(DISTINCT s.service_order_id)::integer
      FROM public.series s
      WHERE s.current_status::text = 'in_central_warehouse'
        AND s.service_order_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.erp_audit_logs al
          WHERE al.record_id = s.id::text
            AND al.action IN (
              'INGRESO A TALLER',
              'DIAGNÓSTICO INICIAL COMPLETADO',
              'REPARACIÓN COMPLETADA',
              'REPARACIÓN L3 COMPLETADA',
              'CONTROL DE CALIDAD COMPLETADO',
              'REACONDICIONADO COMPLETADO',
              'TRASLADO MASIVO A TALLER'
            )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.count_workshop_os_all_tabs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_workshop_os_all_tabs() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_workshop_os_all_tabs() IS
  'SCRAPS = OS irreparable sin caja y sin ninguna serie ya en Bodega SCRAPS.';

NOTIFY pgrst, 'reload schema';
