-- TC-ERP Multimedia - Secuencia global única para códigos de caja
-- Los códigos BOX-XXXXX deben ser únicos globalmente como las Órdenes de Servicio.
-- Se usa una secuencia de PostgreSQL (atómica) en lugar de MAX() cliente-side.

CREATE SEQUENCE IF NOT EXISTS public.box_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- Inicializar la secuencia con el máximo actual para no repetir existentes
SELECT setval(
  'public.box_code_seq',
  COALESCE(
    (SELECT MAX(CAST(regexp_replace(box_code, '[^0-9]', '', 'g') AS integer))
     FROM public.boxes
     WHERE box_code ~ '^BOX-[0-9]+$'),
    0
  )
);

-- Función RPC para obtener el siguiente código único (atómica, usa SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'BOX-' || LPAD(nextval('public.box_code_seq')::text, 2, '0');
$$;

-- Permiso de ejecución para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated;

NOTIFY pgrst, 'reload schema';
