-- CHG-015 — ¿Backfill pre-diagnóstico terminado?
-- Ejecutar en Supabase SQL Editor.
-- Corte alineado al backfill: 2027-01-01 00:00 America/Guatemala (= 2027-01-01 06:00 UTC)

-- 1) Total registros
SELECT count(*) AS total_prediagnosticos FROM public.prediagnosticos;

-- 2) Candidatos pendientes (misma lógica que list_prediagnostico_backfill_candidates)
SELECT count(*) AS pendientes_backfill
FROM public.service_orders so
INNER JOIN public.models m ON m.id = so.model_id
LEFT JOIN public.prediagnosticos p ON p.service_order_id = so.id
WHERE p.id IS NULL
  AND so.created_at < timestamptz '2027-01-01 06:00:00+00'
  AND so.model_id IS NOT NULL
  AND m.technology_id IS NOT NULL;

-- 3) Muestra de pendientes (si pendientes > 0)
-- SELECT * FROM public.list_prediagnostico_backfill_candidates(
--   timestamptz '2027-01-01 06:00:00+00', 10, 0
-- );

-- 4) Backfill vs captura manual (observaciones marcadas en CHG-015)
SELECT
  count(*) FILTER (WHERE observaciones ILIKE '%CHG-015%' OR observaciones ILIKE '%backfill%') AS filas_backfill,
  count(*) FILTER (WHERE observaciones IS NULL OR (observaciones NOT ILIKE '%CHG-015%' AND observaciones NOT ILIKE '%backfill%')) AS filas_otras
FROM public.prediagnosticos;
