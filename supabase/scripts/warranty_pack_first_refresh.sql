-- Primera carga del Warranty Pack (después de migración 265).
-- "Success. No rows returned" al aplicar 265 es normal: solo crea tablas/RPC, no llena datos.
-- Ejecutar en SQL Editor (timeout ≥ 3 min recomendado).

SELECT public.refresh_warranty_pack_snapshot() AS etl_result;

SELECT
  row_count,
  refresh_ms,
  refreshed_at
FROM public.warranty_pack_meta
WHERE id = 1;

SELECT (public.get_warranty_pack_summary()->>'totalOsDespachadas')::int AS os_despachadas,
       (public.get_warranty_pack_summary()->>'enGarantia')::int AS en_garantia;
