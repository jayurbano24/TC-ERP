-- 197: Reparar warehouse_box_is_bodega_operational (178/179 no aplicadas en prod).
-- Sin esto, warehouse_list_boxes_page devuelve OUTBOUND primero (más recientes)
-- y el API las filtra → página vacía ("No hay cajas en inventario").

CREATE OR REPLACE FUNCTION public.warehouse_box_is_bodega_operational(p_rack text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    upper(coalesce(trim(p_rack), '')) NOT IN (
      'ELIMINADO',
      'DESPACHO',
      'OUTBOUND',
      'SCRAP',
      'SCRAPS',
      'SALIDA'
    )
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'TALLER%'
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'SALIDA%'
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'SCRAP%';
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_box_is_bodega_operational(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
