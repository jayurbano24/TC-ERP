-- Listado rápido: OS sin serie en planta (sin timeout)
SELECT
  so.os_label AS "OS",
  so.main_serial AS "Serie",
  so.status AS "Status OS",
  so.sap_integration_status AS "SAP",
  so.created_at::date AS "Creada",
  so.id AS "UUID"
FROM public.service_orders so
WHERE upper(trim(coalesce(so.status, ''))) NOT IN (
    'DESPACHADO', 'CERRADO',
    'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.service_order_id = so.id
      AND s.current_status::text = 'dispatched'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
  )
ORDER BY so.os_label;
