-- 222: Conteo OS por módulo operativo (Inventario Activo vs Despachado)
-- Usado por Integración SAP → dashboard (cuadrícula de capacidad instalada).

CREATE OR REPLACE FUNCTION public.count_os_inventory_modules()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH primary_series AS (
  SELECT DISTINCT ON (s.service_order_id)
    s.service_order_id,
    s.current_status::text AS status,
    s.current_box_id
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
  ORDER BY
    s.service_order_id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.service_orders so
        WHERE so.id = s.service_order_id
          AND so.main_serial IS NOT NULL
          AND upper(trim(so.main_serial)) = upper(trim(s.serial_number))
      ) THEN 0
      ELSE 1
    END,
    s.created_at ASC NULLS LAST
),
classified AS (
  SELECT
    service_order_id,
    CASE
      WHEN status = 'dispatched' THEN 'despachado'
      WHEN status IN ('scrapped', 'in_scraps', 'irreparable') THEN 'scrap'
      WHEN status IN ('in_qc', 'in_validation') THEN 'qc'
      WHEN status = 'in_workshop' THEN 'taller'
      WHEN status = 'in_control_warehouse' THEN 'control'
      WHEN status IN ('in_central_warehouse', 'ready_to_dispatch')
        AND current_box_id IS NOT NULL THEN 'bodega_con_caja'
      WHEN status IN ('in_central_warehouse', 'ready_to_dispatch')
        AND current_box_id IS NULL THEN 'bodega_sin_caja'
      WHEN status IN (
        'RECEPCIONADO_BODEGA_GENERAL',
        'INGRESADO',
        'classified',
        'in_backoffice'
      ) THEN 'backoffice'
      ELSE 'otro'
    END AS module
  FROM primary_series
),
counts AS (
  SELECT module, count(*)::bigint AS n
  FROM classified
  GROUP BY module
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
),
with_series AS (
  SELECT count(DISTINCT service_order_id)::bigint AS n
  FROM public.series
  WHERE service_order_id IS NOT NULL
),
pick AS (
  SELECT coalesce((SELECT n FROM counts WHERE module = m.key), 0)::bigint AS n, m.key
  FROM (VALUES
    ('bodega_con_caja'),
    ('bodega_sin_caja'),
    ('backoffice'),
    ('despachado'),
    ('qc'),
    ('scrap'),
    ('taller'),
    ('control'),
    ('otro')
  ) AS m(key)
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT n FROM with_series),
  'sin_series', greatest(
    (SELECT n FROM total_os) - (SELECT n FROM with_series),
    0
  ),
  'bodega_con_caja', (SELECT n FROM pick WHERE key = 'bodega_con_caja'),
  'bodega_sin_caja', (SELECT n FROM pick WHERE key = 'bodega_sin_caja'),
  'backoffice', (SELECT n FROM pick WHERE key = 'backoffice'),
  'despachado', (SELECT n FROM pick WHERE key = 'despachado'),
  'qc', (SELECT n FROM pick WHERE key = 'qc'),
  'scrap', (SELECT n FROM pick WHERE key = 'scrap'),
  'taller', (SELECT n FROM pick WHERE key = 'taller'),
  'control', (SELECT n FROM pick WHERE key = 'control'),
  'otro', (SELECT n FROM pick WHERE key = 'otro'),
  'activas', greatest(
    (SELECT n FROM total_os) - (SELECT n FROM pick WHERE key = 'despachado'),
    0
  )
);
$$;

REVOKE ALL ON FUNCTION public.count_os_inventory_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_os_inventory_modules() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_os_inventory_modules() IS
  'OS por módulo (bodega/taller/QC/scrap/despacho/backoffice). Activas = total − despachado.';
