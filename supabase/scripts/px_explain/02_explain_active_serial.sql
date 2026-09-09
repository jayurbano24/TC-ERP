-- PX EXPLAIN 2/6 — px_find_active_serial_capture
-- Pegar sample_serial de 01_fixtures.sql (ej. 9877E76D86E3)
-- Buscar: Index Scan using idx_px_serial_lines_serial_upper + Execution Time < 10 ms

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.px_find_active_serial_capture('9877E76D86E3');
