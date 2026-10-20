-- Conteos centinela (service_orders.closed_at; ciclos unlinked_at).
\set ON_ERROR_STOP on

SELECT 'service_orders' AS entity, COUNT(*)::bigint AS n FROM public.service_orders
UNION ALL SELECT 'service_orders_open', COUNT(*) FROM public.service_orders WHERE closed_at IS NULL
UNION ALL SELECT 'service_orders_closed', COUNT(*) FROM public.service_orders WHERE closed_at IS NOT NULL
UNION ALL SELECT 'series', COUNT(*) FROM public.series
UNION ALL SELECT 'service_order_serial_cycles', COUNT(*) FROM public.service_order_serial_cycles
UNION ALL SELECT 'service_order_serial_cycles_open', COUNT(*) FROM public.service_order_serial_cycles WHERE unlinked_at IS NULL
UNION ALL SELECT 'service_order_serial_cycles_closed', COUNT(*) FROM public.service_order_serial_cycles WHERE unlinked_at IS NOT NULL
ORDER BY entity;

-- OS abiertas: conteo de series vinculadas (alerta operativa, no gate duro aquí).
SELECT so.id, so.os_code, so.main_serial, so.status, COUNT(s.id) AS series_count
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
WHERE so.closed_at IS NULL
GROUP BY so.id, so.os_code, so.main_serial, so.status
HAVING COUNT(s.id) > 4
ORDER BY series_count DESC
LIMIT 50;
