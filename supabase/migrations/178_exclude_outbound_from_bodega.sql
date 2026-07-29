-- 178: Excluir OUTBOUND / SALIDA del inventario operacional de Bodega Central.
-- Las cajas de staging de despacho (p. ej. LEGACY con rack_location = OUTBOUND)
-- viven en Bodega de Salida / Despacho, no en Gestión de Bodega.

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
      'SALIDA'
    )
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'TALLER%'
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'SALIDA%';
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_box_is_bodega_operational(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
