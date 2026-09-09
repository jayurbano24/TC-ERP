-- PX EXPLAIN 3/6 — px_find_open_os_for_serial
-- Pegar sample_serial + sample_reception_id de 01_fixtures.sql
-- Buscar: Index Scan (idx_service_orders_main_serial_upper_trim o idx_series_serial_upper_trim_so)

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.px_find_open_os_for_serial(
  '9877E76D86E3',
  '7565b2ff-c687-4699-bac2-be03dac8bca0'::uuid
);
