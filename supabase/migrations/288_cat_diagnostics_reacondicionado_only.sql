-- 288 — Diagnósticos de firmware/frizado: solo destino Reacondicionado.

BEGIN;

UPDATE public.cat_diagnostics
SET allowed_outcomes = ARRAY['reacondicionado']::text[]
WHERE upper(btrim(name)) IN (
  'SE FRIZA',
  'FRIZADO',
  'FIRMWARE OBSOLETO',
  'NO ACTUALIZA',
  'ACTUALIZACION DE S.W.',
  'ACTUALIZACIÓN DE S.W.'
);

COMMIT;
