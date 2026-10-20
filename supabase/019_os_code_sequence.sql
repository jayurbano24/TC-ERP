-- TC-ERP - Secuencia global única para Órdenes de Servicio (OS)
-- Cada equipo recibido en PX debe tener su propia OS con código único TC-XXXXXX
-- Se usa una secuencia PostgreSQL para garantizar unicidad sin condiciones de carrera.

CREATE SEQUENCE IF NOT EXISTS public.os_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(os_label, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.service_orders
  WHERE os_label ~* '^TC-[0-9]+$';

  IF v_max <= 0 THEN
    PERFORM setval('public.os_code_seq', 1, false);
  ELSE
    PERFORM setval('public.os_code_seq', v_max, true);
  END IF;
END $$;

-- Uso: SELECT next_os_codes(5) → '{TC-000001,TC-000002,...}'
CREATE OR REPLACE FUNCTION public.next_os_codes(count_needed integer)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  codes text[] := '{}';
  i integer;
BEGIN
  FOR i IN 1..count_needed LOOP
    codes := array_append(
      codes,
      'TC-' || LPAD(nextval('public.os_code_seq')::text, 6, '0')
    );
  END LOOP;
  RETURN codes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_os_codes(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
