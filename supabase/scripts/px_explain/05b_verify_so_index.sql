-- PX EXPLAIN 5b — verificar índice service_orders (requerido por px_find_open_os_for_serial)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_service_orders_main_serial_upper_trim',
    'idx_series_serial_number_upper_trim'
  );
