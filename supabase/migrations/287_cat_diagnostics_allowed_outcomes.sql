-- 287 — Destinos permitidos por diagnóstico (Reacondicionado / Reparación L1-L2 / L3).

BEGIN;

ALTER TABLE public.cat_diagnostics
  ADD COLUMN IF NOT EXISTS allowed_outcomes text[];

ALTER TABLE public.cat_diagnostics
  DROP CONSTRAINT IF EXISTS cat_diagnostics_allowed_outcomes_check;

ALTER TABLE public.cat_diagnostics
  ADD CONSTRAINT cat_diagnostics_allowed_outcomes_check
  CHECK (
    allowed_outcomes IS NULL
    OR allowed_outcomes <@ ARRAY['reacondicionado', 'reparacion', 'l3']::text[]
  );

COMMENT ON COLUMN public.cat_diagnostics.allowed_outcomes IS
  'Resultados de evaluación iniciales permitidos: reacondicionado | reparacion | l3. Se aplica intersección entre diagnósticos seleccionados.';

INSERT INTO public.cat_diagnostics (name)
SELECT 'ACTUALIZACION DE S.W.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cat_diagnostics
  WHERE upper(btrim(name)) IN ('ACTUALIZACION DE S.W.', 'ACTUALIZACIÓN DE S.W.')
);

-- Base: sin Reacondicionado
UPDATE public.cat_diagnostics
SET allowed_outcomes = ARRAY['reparacion', 'l3']::text[];

-- Solo estos diagnosticos habilitan Reacondicionado (único destino)
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
