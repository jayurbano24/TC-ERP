-- 159 — Origen de ingreso CAC/PX persistido en series (para reportes y trazabilidad)
-- Nota: receptions.source es enum reception_source; no usar coalesce(source, '').
BEGIN;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS entry_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'series_entry_source_check'
      AND conrelid = 'public.series'::regclass
  ) THEN
    ALTER TABLE public.series
      ADD CONSTRAINT series_entry_source_check
      CHECK (entry_source IS NULL OR entry_source IN ('cac', 'px'));
  END IF;
END $$;

COMMENT ON COLUMN public.series.entry_source IS
  'Canal de ingreso original del equipo: cac | px. No se sobrescribe tras el primer set.';

-- Backfill 1: recepción actual
UPDATE public.series s
SET entry_source = lower(r.source::text)
FROM public.receptions r
WHERE s.current_reception_id = r.id
  AND s.entry_source IS NULL
  AND r.source IS NOT NULL
  AND lower(r.source::text) IN ('cac', 'px');

-- Backfill 2: recepción de la OS
UPDATE public.series s
SET entry_source = lower(r.source::text)
FROM public.service_orders so
JOIN public.receptions r ON r.id = so.reception_id
WHERE s.service_order_id = so.id
  AND s.entry_source IS NULL
  AND r.source IS NOT NULL
  AND lower(r.source::text) IN ('cac', 'px');

-- Backfill 3: bandeja CAC (prioridad operativa CAC sobre PX residual)
UPDATE public.series s
SET entry_source = 'cac'
WHERE s.service_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.cac_tray_units c
    WHERE c.service_order_id = s.service_order_id
  )
  AND coalesce(s.entry_source, '') IS DISTINCT FROM 'cac';

CREATE INDEX IF NOT EXISTS idx_series_entry_source
  ON public.series (entry_source)
  WHERE entry_source IS NOT NULL;

-- Trigger: rellenar entry_source solo la primera vez (sticky)
CREATE OR REPLACE FUNCTION public.series_set_entry_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source text;
BEGIN
  -- Conservar origen original si ya existe
  IF NEW.entry_source IS NOT NULL AND lower(NEW.entry_source) IN ('cac', 'px') THEN
    NEW.entry_source := lower(NEW.entry_source);
    RETURN NEW;
  END IF;

  v_source := NULL;

  IF NEW.current_reception_id IS NOT NULL THEN
    SELECT lower(r.source::text) INTO v_source
    FROM public.receptions r
    WHERE r.id = NEW.current_reception_id
      AND r.source IS NOT NULL
      AND lower(r.source::text) IN ('cac', 'px')
    LIMIT 1;
  END IF;

  IF v_source IS NULL AND NEW.service_order_id IS NOT NULL THEN
    SELECT lower(r.source::text) INTO v_source
    FROM public.service_orders so
    JOIN public.receptions r ON r.id = so.reception_id
    WHERE so.id = NEW.service_order_id
      AND r.source IS NOT NULL
      AND lower(r.source::text) IN ('cac', 'px')
    LIMIT 1;
  END IF;

  IF v_source IS NULL AND NEW.service_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.cac_tray_units c
      WHERE c.service_order_id = NEW.service_order_id
      LIMIT 1
    ) THEN
      v_source := 'cac';
    END IF;
  END IF;

  NEW.entry_source := v_source;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_series_set_entry_source ON public.series;
CREATE TRIGGER trg_series_set_entry_source
  BEFORE INSERT OR UPDATE OF current_reception_id, service_order_id, entry_source
  ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION public.series_set_entry_source();

NOTIFY pgrst, 'reload schema';

COMMIT;
