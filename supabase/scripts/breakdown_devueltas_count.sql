-- Desglose badge Devueltas (116) vs listado sin serie (~82)
SELECT
  upper(trim(coalesce(so.status, ''))) AS status_os,
  count(*)::bigint AS total,
  count(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id)
  )::bigint AS sin_serie,
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id)
  )::bigint AS con_serie
FROM public.service_orders so
WHERE upper(trim(coalesce(so.status, ''))) IN (
  'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
)
GROUP BY 1
ORDER BY 2 DESC;

-- Total debe coincidir con count_os_inventory_modules()->>'devuelto'
SELECT (public.count_os_inventory_modules()->>'devuelto')::bigint AS devuelto_rpc;

-- Cuadre en planta
SELECT
  (j->>'total')::bigint AS historico,
  (j->>'despachado')::bigint AS despachadas,
  (j->>'devuelto')::bigint AS devueltas,
  (j->>'activas_ledger')::bigint AS en_planta,
  (j->>'activas')::bigint AS en_flujo_tiles,
  (j->>'sin_series_en_planta')::bigint AS sin_serie_en_planta,
  (j->>'activas_ledger')::bigint - (j->>'activas')::bigint AS gap_sin_ubicacion
FROM (SELECT public.count_os_inventory_modules() AS j) x;
