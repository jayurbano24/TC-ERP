-- =============================================================================
-- 116 — Número de Salida: correlativo único e irrepetible (NS-000001)
-- Usado en despacho Outbound / conduce al imprimir.
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS public.salida_code_seq START WITH 1 INCREMENT BY 1;

-- Sincroniza con guías NS- ya registradas en dispatches (si existen)
DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(guide_number, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.dispatches
  WHERE guide_number ~ '^NS-[0-9]+$';

  PERFORM setval(
    'public.salida_code_seq',
    GREATEST(v_max, 1),
    v_max > 0
  );
END $$;

CREATE OR REPLACE FUNCTION public.next_salida_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_tries integer := 0;
BEGIN
  LOOP
    v_tries := v_tries + 1;
    v_code := 'NS-' || LPAD(nextval('public.salida_code_seq')::text, 6, '0');

    IF NOT EXISTS (
      SELECT 1 FROM public.dispatches d WHERE d.guide_number = v_code
    ) THEN
      RETURN v_code;
    END IF;

    IF v_tries >= 100 THEN
      RAISE EXCEPTION 'NO_SALIDA_CODE_AVAILABLE: No se pudo asignar correlativo NS único';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.next_salida_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_salida_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_salida_code() TO service_role;

COMMENT ON FUNCTION public.next_salida_code() IS
  'Correlativo único de Número de Salida (conduce): NS-000001, NS-000002, …';

NOTIFY pgrst, 'reload schema';
