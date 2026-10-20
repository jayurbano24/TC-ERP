-- Restricciones críticas, funciones classify y permisos EXECUTE.
\set ON_ERROR_STOP on

SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'classify_equipment_batch_tx',
    'normalize_equipment_serial',
    'series_active_service_order',
    'normalize_serial'
  )
ORDER BY p.proname, args;

SELECT COUNT(*) AS classify_overloads
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'classify_equipment_batch_tx';

SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid::regclass::text IN ('public.series', 'public.service_orders')
ORDER BY table_name, tgname;

SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name = 'classify_equipment_batch_tx'
ORDER BY grantee, privilege_type;

-- Duplicados serial normalizado en OS abiertas (misma identidad compartida indebida).
WITH open_serials AS (
  SELECT upper(trim(s.serial_number)) AS sn, so.id AS os_id, so.main_serial
  FROM public.series s
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE so.closed_at IS NULL
)
SELECT sn, COUNT(DISTINCT os_id) AS distinct_open_os, COUNT(*) AS row_count
FROM open_serials
GROUP BY sn
HAVING COUNT(DISTINCT os_id) > 1
ORDER BY distinct_open_os DESC, sn
LIMIT 50;
