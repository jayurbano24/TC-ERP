-- Devueltas CON serie (~34 adicionales vs las 82 sin serie)
-- Ejecutar en Supabase SQL Editor

SELECT
  so.os_label AS "OS",
  so.main_serial AS "Serie OS",
  so.status AS "Status OS",
  so.sap_integration_status AS "SAP OS",
  string_agg(DISTINCT s.serial_number, ', ' ORDER BY s.serial_number) AS "Series vinculadas",
  string_agg(DISTINCT s.current_status::text, ', ' ORDER BY s.current_status::text) AS "Status series",
  count(s.id)::int AS "N series"
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
WHERE upper(trim(coalesce(so.status, ''))) IN (
  'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
)
GROUP BY so.id, so.os_label, so.main_serial, so.status, so.sap_integration_status
ORDER BY so.status, so.os_label;

-- Resumen: ¿las series están en 'returned' o quedaron en otro estado?
SELECT
  s.current_status::text AS status_serie,
  count(DISTINCT so.id)::bigint AS os_devueltas
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
WHERE upper(trim(coalesce(so.status, ''))) IN (
  'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
)
GROUP BY 1
ORDER BY 2 DESC;

-- Comparar: devueltas sin serie vs con serie
SELECT
  count(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM series s WHERE s.service_order_id = so.id)
  ) AS sin_serie,
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM series s WHERE s.service_order_id = so.id)
  ) AS con_serie,
  count(*) AS total_devueltas
FROM public.service_orders so
WHERE upper(trim(coalesce(so.status, ''))) IN (
  'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
);
