-- 083: Tablas creadas con CREATE TABLE IF NOT EXISTS conservan el CHECK original
-- sin DISPERSION_CAJA. Dispersión a taller falla al registrar el movimiento.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.warehouse_movements'::regclass
      AND c.contype = 'c'
      AND a.attname = 'movement_type'
  LOOP
    EXECUTE format('ALTER TABLE public.warehouse_movements DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.warehouse_movements
  ADD CONSTRAINT warehouse_movements_movement_type_check
  CHECK (movement_type IN ('INGRESO', 'SALIDA', 'TRASLADO', 'DISPERSION_CAJA'));

NOTIFY pgrst, 'reload schema';
