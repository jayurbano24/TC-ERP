-- =============================================================================
-- 167 — Conteo OS (distintos) + inventario = Detalle de Inventario
-- =============================================================================
-- Evita pageo de series en el browser/API. Bodega WIP usa la misma regla que
-- /bodega/inventario (getInventoryDetails): cajas en bodega + status inventario.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_os_by_status(p_status text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(DISTINCT s.service_order_id)::bigint
  FROM public.series s
  WHERE s.current_status::text = p_status
    AND s.service_order_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.count_os_in_statuses(p_statuses text[])
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(DISTINCT s.service_order_id)::bigint
  FROM public.series s
  WHERE s.current_status::text = ANY (p_statuses)
    AND s.service_order_id IS NOT NULL;
$$;

-- Misma semántica que getInventoryDetails() / Detalle de Inventario
CREATE OR REPLACE FUNCTION public.count_inventory_detail_os()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(DISTINCT s.service_order_id)::bigint
  FROM public.series s
  INNER JOIN public.boxes b ON b.id = s.current_box_id
  WHERE s.service_order_id IS NOT NULL
    AND s.current_status::text IN ('in_central_warehouse', 'in_control_warehouse')
    AND coalesce(b.rack_location, '') NOT IN ('DESPACHO', 'ELIMINADO')
    AND b.rack_location NOT ILIKE 'TALLER%'
    AND upper(coalesce(b.rack_location, '')) NOT LIKE 'SCRAP%'
    AND upper(coalesce(b.rack_location, '')) NOT LIKE 'OBSOLETO%';
$$;

GRANT EXECUTE ON FUNCTION public.count_os_by_status(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_os_in_statuses(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_inventory_detail_os() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_inventory_detail_os() IS
  'OS distintos en Detalle de Inventario (cajas bodega + status inventario). No series.';
