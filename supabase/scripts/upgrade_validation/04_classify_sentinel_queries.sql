-- Centinelas classify / ciclos (unlinked_at = ciclo abierto).
\set ON_ERROR_STOP on

WITH shared AS (
  SELECT upper(trim(s.serial_number)) AS sn
  FROM public.series s
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE so.closed_at IS NULL
  GROUP BY 1
  HAVING COUNT(DISTINCT so.main_serial) > 1
)
SELECT COUNT(*)::bigint AS shared_serial_multiple_main_serial_open_os FROM shared;

SELECT serial_number, service_order_id, COUNT(*)::bigint AS open_cycles
FROM public.service_order_serial_cycles
WHERE unlinked_at IS NULL
GROUP BY serial_number, service_order_id
HAVING COUNT(*) > 1
ORDER BY open_cycles DESC
LIMIT 25;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'classify_equipment_batch_preflight'
) AS has_preflight_helper;
