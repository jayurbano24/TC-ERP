-- BOX-xxx globalmente único e irrepetible (bodega + PX finalize)
-- Causa raíz: unique(reception_id, box_code) permitía BOX-12 en varias recepciones;
-- legacy MAX() cliente y px_next_bodega_box_code() sin secuencia desincronizaban next_box_code().

-- 1) Asegurar secuencia
CREATE SEQUENCE IF NOT EXISTS public.box_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

SELECT setval(
  'public.box_code_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(
        NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer
      )
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'),
      0
    ),
    COALESCE((SELECT last_value FROM public.box_code_seq), 0)
  )
);

-- 2) Asignación atómica (única fuente de verdad)
CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'BOX-' || LPAD(nextval('public.box_code_seq')::text, 2, '0');
$$;

-- 3) px_next_bodega_box_code → delegar a secuencia (evita MAX() con carrera)
CREATE OR REPLACE FUNCTION public.px_next_bodega_box_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.next_box_code();
$$;

-- 4) Reparar duplicados existentes (conservar la caja más antigua por box_code)
DO $$
DECLARE
  v_row record;
  v_new_code text;
BEGIN
  FOR v_row IN
    SELECT b.id AS box_id
    FROM public.boxes b
    INNER JOIN (
      SELECT box_code
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'
        AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
      GROUP BY box_code
      HAVING count(*) > 1
    ) d ON d.box_code = b.box_code
    WHERE b.id NOT IN (
      SELECT DISTINCT ON (box_code) id
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'
        AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
      ORDER BY box_code, created_at ASC
    )
  LOOP
    v_new_code := public.next_box_code();
    UPDATE public.boxes SET box_code = v_new_code WHERE id = v_row.box_id;
  END LOOP;
END;
$$;

-- Re-sincronizar secuencia tras reparación
SELECT setval(
  'public.box_code_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(
        NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer
      )
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'),
      0
    ),
    COALESCE((SELECT last_value FROM public.box_code_seq), 0)
  )
);

-- 5) Índice único global para códigos BOX operativos
CREATE UNIQUE INDEX IF NOT EXISTS boxes_box_code_operational_unique
  ON public.boxes (box_code)
  WHERE box_code ~ '^BOX-[0-9]+$'
    AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO');

GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_next_bodega_box_code() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
