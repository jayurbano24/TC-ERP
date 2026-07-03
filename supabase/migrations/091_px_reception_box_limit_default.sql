-- =============================================================================
-- 091 — Recepciones PX EN_PROCESO con límite 1 caja → default 50 (operación)
-- Solo actualiza recepciones abiertas con expected_units_sap <= 1.
-- =============================================================================

UPDATE public.receptions
SET
  expected_units_sap = 50,
  notes = regexp_replace(
    coalesce(notes, ''),
    'Cajas:\s*\d+',
    'Cajas: 50',
    'g'
  )
WHERE status = 'EN_PROCESO'
  AND coalesce(expected_units_sap, 0) <= 1;

NOTIFY pgrst, 'reload schema';
