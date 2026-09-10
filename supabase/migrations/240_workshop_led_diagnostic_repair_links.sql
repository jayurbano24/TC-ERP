-- 240 — LED INDICADOR DAÑADO → CAMBIO DE LED / AJUSTE DE LED (catálogo taller).
-- Idempotente: normaliza nombres y relaciones por texto, no por UUID fijo.

UPDATE public.cat_repairs
SET name = 'CAMBIO DE LED'
WHERE upper(trim(name)) = 'CAMBIO DE DIODO LED';

INSERT INTO public.cat_repairs (name)
SELECT 'AJUSTE DE LED'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cat_repairs WHERE upper(trim(name)) = 'AJUSTE DE LED'
);

INSERT INTO public.cat_diagnostic_repairs (diagnostic_id, repair_id)
SELECT d.id, r.id
FROM public.cat_diagnostics d
CROSS JOIN public.cat_repairs r
WHERE upper(trim(d.name)) = 'LED INDICADOR DAÑADO'
  AND upper(trim(r.name)) IN ('CAMBIO DE LED', 'AJUSTE DE LED')
ON CONFLICT DO NOTHING;

DELETE FROM public.cat_diagnostic_repairs dr
USING public.cat_diagnostics d, public.cat_repairs r
WHERE dr.diagnostic_id = d.id
  AND dr.repair_id = r.id
  AND upper(trim(d.name)) = 'LED INDICADOR DAÑADO'
  AND upper(trim(r.name)) = 'CAMBIO DE DIODO LED';
