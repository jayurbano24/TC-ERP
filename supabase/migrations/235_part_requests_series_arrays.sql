-- =============================================================================
-- 235 — Arreglos de trazabilidad multi-serie en solicitudes de piezas
-- Complementa 234 cuando solo se aplicó la parte de lotes (part_request_batches
-- y batch_id), dejando fuera los arreglos de series/seriales.
-- =============================================================================

ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS series_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS serial_numbers text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.part_requests
SET
  series_ids = CASE
    WHEN series_id IS NULL THEN '{}'::uuid[]
    ELSE ARRAY[series_id]
  END,
  serial_numbers = CASE
    WHEN NULLIF(trim(serial_number), '') IS NULL THEN '{}'::text[]
    ELSE ARRAY[serial_number]
  END
WHERE cardinality(series_ids) = 0
  AND cardinality(serial_numbers) = 0;

NOTIFY pgrst, 'reload schema';
