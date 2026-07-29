-- 179: Excluir SCRAPS / SCRAP% del inventario operacional de Bodega Central.
-- Complementa 178 (OUTBOUND/SALIDA). Cajas scrap viven en /bodega/scraps.

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
