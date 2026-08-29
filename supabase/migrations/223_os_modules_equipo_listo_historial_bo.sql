-- 223: Ajuste módulos OS — Equipo Listo + Historial Backoffice; sin duplicar Control/QC.
-- Reemplaza count_os_inventory_modules (migración 222).

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
    s.id AS series_id,
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
listo_os AS (
  SELECT DISTINCT s.service_order_id
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
),
classified AS (
  SELECT
    p.service_order_id,
    CASE
      WHEN p.status = 'dispatched' THEN 'despachado'
      WHEN p.status IN ('scrapped', 'in_scraps', 'irreparable') THEN 'scrap'
      -- Ctrl. Calidad (única tarjeta QC; no duplicar con "Control")
      WHEN p.status IN ('in_qc', 'in_validation') THEN 'qc'
      -- Taller piso (diagnóstico + L3/control warehouse)
      WHEN p.status IN ('in_workshop', 'in_control_warehouse') THEN 'taller'
      -- Equipo Listo (bodega central post-taller) antes que bodega genérica
      WHEN p.status = 'in_central_warehouse'
        AND EXISTS (SELECT 1 FROM listo_os l WHERE l.service_order_id = p.service_order_id)
        THEN 'equipo_listo'
      WHEN p.status IN ('in_central_warehouse', 'ready_to_dispatch')
        AND p.current_box_id IS NOT NULL THEN 'bodega_con_caja'
      WHEN p.status IN ('in_central_warehouse', 'ready_to_dispatch')
        AND p.current_box_id IS NULL THEN 'bodega_sin_caja'
      -- Cola Backoffice (pendiente ingreso)
      WHEN p.status IN (
        'RECEPCIONADO_BODEGA_GENERAL',
        'INGRESADO',
        'classified',
        'in_backoffice'
      ) THEN 'backoffice'
      ELSE 'otro'
    END AS module
  FROM primary_series p
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
-- Historial Backoffice: OS que ya salieron de la bandeja activa
historial_bo AS (
  SELECT count(DISTINCT service_order_id)::bigint AS n
  FROM public.cac_tray_units
  WHERE is_active IS NOT TRUE
    AND service_order_id IS NOT NULL
),
-- Cola activa Backoffice vía bandeja (complementa status RECEPCIONADO)
backoffice_tray AS (
  SELECT count(DISTINCT service_order_id)::bigint AS n
  FROM public.cac_tray_units
  WHERE is_active IS TRUE
    AND service_order_id IS NOT NULL
),
pick AS (
  SELECT coalesce((SELECT n FROM counts WHERE module = m.key), 0)::bigint AS n, m.key
  FROM (VALUES
    ('bodega_con_caja'),
    ('bodega_sin_caja'),
    ('backoffice'),
    ('equipo_listo'),
    ('despachado'),
    ('qc'),
    ('scrap'),
    ('taller'),
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
  'backoffice', greatest(
    (SELECT n FROM pick WHERE key = 'backoffice'),
    (SELECT n FROM backoffice_tray)
  ),
  'historial_backoffice', (SELECT n FROM historial_bo),
  'equipo_listo', (SELECT n FROM pick WHERE key = 'equipo_listo'),
  'despachado', (SELECT n FROM pick WHERE key = 'despachado'),
  'qc', (SELECT n FROM pick WHERE key = 'qc'),
  'scrap', (SELECT n FROM pick WHERE key = 'scrap'),
  'taller', (SELECT n FROM pick WHERE key = 'taller'),
  'control', 0,
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
  'OS por módulo: bodega, backoffice, historial BO, equipo listo, QC, taller, scrap, despachado. Sin tarjeta Control duplicada.';

NOTIFY pgrst, 'reload schema';
