-- 097: serial_normalized para cruce SAP ↔ TC (normalización una sola vez + índice).
-- Corrige matches fallidos por mayúsculas, espacios y caracteres de control.

CREATE OR REPLACE FUNCTION public.normalize_serial(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN valor IS NULL THEN ''
    ELSE upper(
      regexp_replace(
        regexp_replace(trim(valor), E'[\\r\\n\\t]+', '', 'g'),
        E'\\s+',
        '',
        'g'
      )
    )
  END;
$$;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS serial_normalized text;

-- Backfill (una sola pasada; set-based, no N+1)
UPDATE public.series
SET serial_normalized = public.normalize_serial(serial_number)
WHERE serial_normalized IS NULL
   OR serial_normalized <> public.normalize_serial(serial_number);

CREATE INDEX IF NOT EXISTS idx_series_serial_normalized
  ON public.series (serial_normalized)
  WHERE serial_normalized IS NOT NULL AND serial_normalized <> '';

-- Trigger: normaliza en cada insert/update de serial_number
CREATE OR REPLACE FUNCTION public.series_set_serial_normalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.serial_normalized := public.normalize_serial(NEW.serial_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_series_serial_normalized ON public.series;
CREATE TRIGGER trg_series_serial_normalized
  BEFORE INSERT OR UPDATE OF serial_number ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION public.series_set_serial_normalized();

COMMENT ON COLUMN public.series.serial_normalized IS
  'Serie normalizada (upper/trim/sin espacios) para cruce SAP. Mantenida por trigger.';
