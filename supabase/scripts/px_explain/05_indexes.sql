-- PX EXPLAIN 5/6 — Índices relevantes
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_px_serial_lines_serial_upper',
    'idx_px_serial_lines_reception_serial_upper',
    'idx_px_equipment_box_active_count',
    'idx_service_orders_main_serial_upper_trim',
    'idx_series_serial_number_upper_trim',
    'idx_series_serial_upper_trim_so'
  )
ORDER BY tablename, indexname;
