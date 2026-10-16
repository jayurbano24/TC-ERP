-- Vigencia portafolio Claro por modelo (reporte SCA pre-diagnóstico).

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS portfolio_vigencia text;

UPDATE public.models
SET portfolio_vigencia = 'vigente'
WHERE portfolio_vigencia IS NULL OR btrim(portfolio_vigencia) = '';

ALTER TABLE public.models
  ALTER COLUMN portfolio_vigencia SET DEFAULT 'vigente';

ALTER TABLE public.models
  ALTER COLUMN portfolio_vigencia SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'models_portfolio_vigencia_check'
  ) THEN
    ALTER TABLE public.models
      ADD CONSTRAINT models_portfolio_vigencia_check
      CHECK (portfolio_vigencia IN ('vigente', 'obsoleto'));
  END IF;
END $$;

COMMENT ON COLUMN public.models.portfolio_vigencia IS
  'Vigencia en portafolio Claro: vigente | obsoleto (export pre-diagnóstico SCA).';
