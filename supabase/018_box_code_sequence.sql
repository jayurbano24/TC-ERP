-- TC-ERP Multimedia - Secuencia global única para códigos de caja
-- Los códigos BOX-XXXXX deben ser únicos globalmente como las Órdenes de Servicio.
-- Se usa una secuencia de PostgreSQL (atómica) en lugar de MAX() cliente-side.

CREATE SEQUENCE IF NOT EXISTS public.box_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- Alinear secuencia: tablas vacías → primer nextval = 1; con datos → max+1 sin duplicar.
DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~* '^BOX-[0-9]+$';

  IF v_max <= 0 THEN
    PERFORM setval('public.box_code_seq', 1, false);
  ELSE
    PERFORM setval('public.box_code_seq', v_max, true);
  END IF;
END $$;

-- Función RPC para obtener el siguiente código único (atómica, usa SECURITY DEFINER)
-- Nota: migraciones 124/125 redefinen formato sin LPAD truncante; aquí bootstrap coherente con BOX-{n}.
CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'BOX-' || nextval('public.box_code_seq')::text;
$$;

GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated;

NOTIFY pgrst, 'reload schema';
