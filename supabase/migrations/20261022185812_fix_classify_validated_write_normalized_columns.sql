-- =============================================================================
-- fix_classify_validated_write_normalized_columns
--
-- After fixing series_active_service_order, classify still timed out (~125s) on
-- a single new unit. validated_write still scanned with:
--   normalize_equipment_serial(service_orders.main_serial)
--   normalize_equipment_serial(series.serial_number)
-- on the reentry UPDATE / conflict probes (EXPLAIN of that UPDATE timed out).
--
-- Rewrite those predicates to use stored normalized columns + index equality.
-- =============================================================================

DO $$
DECLARE
  src text;
  patched text;
BEGIN
  src := pg_get_functiondef(
    'public.classify_equipment_batch_tx_validated_write(uuid,uuid,jsonb,text,text)'::regprocedure
  );

  IF src IS NULL THEN
    RAISE EXCEPTION 'classify_equipment_batch_tx_validated_write missing';
  END IF;

  patched := src;
  patched := replace(
    patched,
    'public.normalize_equipment_serial(so.main_serial)',
    'so.main_serial_normalized'
  );
  patched := replace(
    patched,
    'public.normalize_equipment_serial(s.serial_number)',
    's.serial_normalized'
  );
  patched := replace(
    patched,
    'public.normalize_equipment_serial(so2.main_serial)',
    'so2.main_serial_normalized'
  );

  IF patched = src THEN
    RAISE EXCEPTION 'validated_write patch made no replacements — inspect live definition';
  END IF;

  IF position('so.main_serial_normalized' in patched) = 0 THEN
    RAISE EXCEPTION 'validated_write patch failed to introduce main_serial_normalized';
  END IF;

  EXECUTE patched;
END;
$$;

-- Keep series.serial_normalized filled for conflict probes.
UPDATE public.series s
SET serial_normalized = public.normalize_serial(s.serial_number)
WHERE s.serial_normalized IS DISTINCT FROM public.normalize_serial(s.serial_number);

ANALYZE public.service_orders;
ANALYZE public.series;

NOTIFY pgrst, 'reload schema';
