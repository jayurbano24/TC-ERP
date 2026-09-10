-- 245 — Persistir reparaciones seleccionadas en taller (paridad con current_diagnostics)
BEGIN;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS current_repairs uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.series.current_repairs IS
  'Reparaciones de catálogo aplicadas en la última etapa Reparación/L3/QC-corrección.';

COMMIT;
