-- =============================================================================
-- ensure_normalize_equipment_serial (compatibilidad reconstrucción desde cero)
--
-- Causa raíz (fresh install / tc-erp-isolated-verify):
--   Las migraciones timestamp 20261022181131 / 20261022184507 / 20261022185812
--   ordenan léxicamente ANTES de 273/274, pero llaman
--   public.normalize_equipment_serial(text), definida por primera vez en 273
--   (reafirmada en 274). En bases ya aplicadas en prod la función ya existía
--   cuando se añadieron los fixes 20261022*; en reset limpio falla con 42883.
--
-- Estrategia:
--   Migración aditiva idempotente (CREATE OR REPLACE) con timestamp
--   20261022180000 — después de 20261020001356, antes de 20261022181131.
--   No edita migraciones históricas ya aplicadas. 273/274 siguen siendo SSOT
--   canónica posterior (misma semántica: alias de normalize_serial).
--
-- Dependencia: public.normalize_serial(text) — creada en 097.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_equipment_serial(p_serial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT public.normalize_serial(p_serial);
$$;

COMMENT ON FUNCTION public.normalize_equipment_serial(text) IS
  '20261022180000: alias IMMUTABLE de normalize_serial; puente para migraciones '
  '20261022* en installs frescos (definición canónica reafirmada en 273/274).';

NOTIFY pgrst, 'reload schema';
