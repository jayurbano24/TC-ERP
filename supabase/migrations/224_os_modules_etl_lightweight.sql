-- 224: Inventario OS liviano (ETL / bajo egress).
-- Quita Equipo Listo (scan audit) e Historial Backoffice (doble conteo con cola).

CREATE OR REPLACE FUNCTION public.count_os_inventory_modules()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH agg AS (
  SELECT
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('in_central_warehouse', 'ready_to_dispatch')
        AND s.current_box_id IS NOT NULL
    )::bigint AS bodega_con_caja,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('in_central_warehouse', 'ready_to_dispatch')
        AND s.current_box_id IS NULL
    )::bigint AS bodega_sin_caja,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN (
        'RECEPCIONADO_BODEGA_GENERAL',
        'INGRESADO',
        'classified',
        'in_backoffice'
      )
    )::bigint AS backoffice,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'dispatched'
    )::bigint AS despachado,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('in_qc', 'in_validation')
    )::bigint AS qc,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('scrapped', 'in_scraps', 'irreparable')
    )::bigint AS scrap,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('in_workshop', 'in_control_warehouse')
    )::bigint AS taller,
    count(DISTINCT s.service_order_id)::bigint AS con_serie
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT con_serie FROM agg),
  'sin_series', greatest(
    (SELECT n FROM total_os) - (SELECT con_serie FROM agg),
    0
  ),
  'bodega_con_caja', (SELECT bodega_con_caja FROM agg),
  'bodega_sin_caja', (SELECT bodega_sin_caja FROM agg),
  'backoffice', (SELECT backoffice FROM agg),
  'historial_backoffice', 0,
  'equipo_listo', 0,
  'despachado', (SELECT despachado FROM agg),
  'qc', (SELECT qc FROM agg),
  'scrap', (SELECT scrap FROM agg),
  'taller', (SELECT taller FROM agg),
  'control', 0,
  'otro', 0,
  'activas', greatest(
    (SELECT n FROM total_os) - (SELECT despachado FROM agg),
    0
  )
);
$$;

REVOKE ALL ON FUNCTION public.count_os_inventory_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_os_inventory_modules() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_os_inventory_modules() IS
  'ETL liviano: OS por módulo con un solo scan de series (sin audit ni historial BO).';

NOTIFY pgrst, 'reload schema';
