-- Diagnóstico: 2 estaciones / PCs escribiendo en ont_runs (LAB-002 vs LAB-005).
-- Ejecutar en Supabase SQL Editor (no en PowerShell).

-- 1) Resumen por estación (últimos 90 días)
SELECT
  station,
  count(*) AS corridas,
  count(*) FILTER (WHERE report_json IS NOT NULL) AS con_report_json,
  count(*) FILTER (WHERE report_json ? 'certificate_sheet') AS con_certificate_sheet,
  round(avg(octet_length(report_json::text)) FILTER (WHERE report_json IS NOT NULL)) AS avg_json_bytes,
  count(*) FILTER (
    WHERE coalesce(jsonb_array_length(report_json->'certificate_sheet'->'cpe_rows'), 0) >= 5
       OR coalesce(jsonb_array_length(report_json->'certificate_sheet'->'rows'), 0) >= 5
  ) AS sheet_con_5plus_filas,
  count(*) FILTER (WHERE nullif(trim(serial), '') IS NOT NULL) AS con_serial_columna,
  count(*) FILTER (WHERE nullif(trim(report_json->'dut'->>'serial'), '') IS NOT NULL) AS con_serial_dut
FROM ont_runs
WHERE recorded_at >= now() - interval '90 days'
  AND station IN ('LAB-002', 'LAB-005')
GROUP BY station
ORDER BY station;

-- 2) Últimas 15 corridas por estación (comparar tamaño y filas)
SELECT
  station,
  run_id,
  verdict,
  nullif(trim(serial), '') AS serial_col,
  recorded_at,
  octet_length(report_json::text) AS json_bytes,
  coalesce(jsonb_array_length(report_json->'certificate_sheet'->'cpe_rows'), 0) AS cpe_rows,
  coalesce(jsonb_array_length(report_json->'certificate_sheet'->'rows'), 0) AS emta_rows,
  coalesce(jsonb_array_length(report_json->'dut'->'ds_rows'), 0) AS dut_ds,
  coalesce(jsonb_array_length(report_json->'flows'), 0) AS flows
FROM ont_runs
WHERE station IN ('LAB-002', 'LAB-005')
ORDER BY recorded_at DESC
LIMIT 30;

-- 3) run_id duplicado (misma orden, varias filas = 2 syncs o 2 PCs)
SELECT
  run_id,
  count(*) AS filas,
  array_agg(DISTINCT station) AS estaciones,
  array_agg(DISTINCT nullif(trim(serial), '')) AS series,
  min(octet_length(report_json::text)) AS min_json_bytes,
  max(octet_length(report_json::text)) AS max_json_bytes
FROM ont_runs
WHERE recorded_at >= now() - interval '30 days'
GROUP BY run_id
HAVING count(*) > 1
ORDER BY max(recorded_at) DESC
LIMIT 25;

-- 4) Caso concreto (cambiar run_id)
-- SELECT run_id, id, station, serial, verdict, report_json
-- FROM ont_runs
-- WHERE run_id = 'LAB-005-TC-0010'
-- ORDER BY recorded_at DESC;
