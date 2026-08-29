-- 226: Activas = suma de módulos visibles (no total−despachado con residual oculto).
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (
              upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%'
            )
        )
    )::bigint AS bodega_con_caja,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_box_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (
              upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%'
            )
        )
    )::bigint AS pistoleo_en_curso,
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
),
mods AS (
  SELECT
    bodega_con_caja,
    pistoleo_en_curso,
    backoffice,
    despachado,
    qc,
    scrap,
    taller,
    con_serie,
    (
      bodega_con_caja
      + pistoleo_en_curso
      + backoffice
      + qc
      + scrap
      + taller
    )::bigint AS activas
  FROM agg
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT con_serie FROM mods),
  'sin_series', 0,
  'bodega_con_caja', (SELECT bodega_con_caja FROM mods),
  'bodega_sin_caja', 0,
  'pistoleo_en_curso', (SELECT pistoleo_en_curso FROM mods),
  'backoffice', (SELECT backoffice FROM mods),
  'historial_backoffice', 0,
  'equipo_listo', 0,
  'despachado', (SELECT despachado FROM mods),
  'qc', (SELECT qc FROM mods),
  'scrap', (SELECT scrap FROM mods),
  'taller', (SELECT taller FROM mods),
  'control', 0,
  'otro', 0,
  -- Activas = solo lo que se muestra en la cuadrícula (inventario físico clasificado).
  'activas', (SELECT activas FROM mods),
  -- Referencia ledger (histórico − despachado); puede ser mayor que activas.
  'activas_ledger', greatest(
    (SELECT n FROM total_os) - (SELECT despachado FROM mods),
    0
  )
);
$$;

REVOKE ALL ON FUNCTION public.count_os_inventory_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_os_inventory_modules() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_os_inventory_modules() IS
  'Activas = suma módulos visibles. activas_ledger = total−despachado (puede incluir residual).';

NOTIFY pgrst, 'reload schema';
