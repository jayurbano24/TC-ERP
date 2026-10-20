-- Tras recovery: objetos creados solo por migraciones post-baseline no deben sobrevivir si no estaban en dump.
-- Ejecutar con lista expectedObjects.json del manifiesto de copia.
\set ON_ERROR_STOP on

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'classify_equipment_batch_tx'
ORDER BY args;

-- Gate: más de 2 overloads públicos suele indicar residuo post-recovery (ajustar umbral en anomalies si aplica).
DO $$
DECLARE v_overloads int;
BEGIN
  SELECT COUNT(*) INTO v_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'classify_equipment_batch_tx';
  IF v_overloads > 2 THEN
    RAISE EXCEPTION 'GATE classify_overload_residual=%', v_overloads;
  END IF;
END $$;
