-- 215_fix_hitron_cm_mac_series.sql

DO $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_dup_count integer := 0;
  v_new_serial text;
BEGIN
  -- Iteramos sobre los registros que tienen 24 caracteres
  FOR r IN 
    SELECT id, serial_number, serial_normalized 
    FROM public.series 
    WHERE length(serial_number) = 24
  LOOP
    -- Extraer el CM MAC (últimos 12 caracteres)
    v_new_serial := substring(r.serial_number FROM 13 FOR 12);
    
    -- Verificar si esa serie ya existe en otro registro
    IF EXISTS (SELECT 1 FROM public.series WHERE serial_number = v_new_serial AND id <> r.id) THEN
      -- Si ya existe, le agregamos el sufijo -DUP para evitar el error de Unique Constraint
      -- y para que puedan ser identificados y depurados manualmente después.
      v_new_serial := v_new_serial || '-DUP';
      v_dup_count := v_dup_count + 1;
    END IF;
    
    -- Actualizar el registro
    UPDATE public.series
    SET 
      serial_number = v_new_serial,
      serial_normalized = v_new_serial,
      updated_at = now()
    WHERE id = r.id;
    
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Total de series procesadas: %. Conflictos renombrados con -DUP: %', v_count, v_dup_count;
END;
$$;

-- Validación: Mostrar los que se marcaron como duplicados
SELECT 
  s.serial_number,
  m.name AS modelo
FROM public.series s
LEFT JOIN public.models m ON m.id = s.model_id
WHERE s.serial_number LIKE '%-DUP'
ORDER BY s.updated_at DESC;

NOTIFY pgrst, 'reload schema';
