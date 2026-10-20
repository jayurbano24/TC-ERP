-- Promovido desde add_emta_sap_columns.sql (nombre inválido para CLI).
-- Antes de 100_sap_sync_material_valuation / 101_backfill_series_material.

ALTER TABLE public.series ADD COLUMN IF NOT EXISTS s2 text;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS s3 text;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS s4 text;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS valuation text;

CREATE INDEX IF NOT EXISTS idx_series_s2 ON public.series (s2);
CREATE INDEX IF NOT EXISTS idx_series_s3 ON public.series (s3);
CREATE INDEX IF NOT EXISTS idx_series_s4 ON public.series (s4);
