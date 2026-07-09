-- 096: Correlativo BOX-XX estrictamente único (sincroniza secuencia + verifica en BD).
-- Evita que next_box_code() devuelva un código ya usado (p. ej. BOX-45 duplicado).

CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_code text;
  v_tries integer := 0;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~ '^BOX-[0-9]+$';

  PERFORM setval(
    'public.box_code_seq',
    GREATEST(
      v_max,
      COALESCE((SELECT last_value FROM public.box_code_seq), 0)
    ),
    true
  );

  LOOP
    v_tries := v_tries + 1;
    v_code := 'BOX-' || LPAD(nextval('public.box_code_seq')::text, 2, '0');

    IF NOT EXISTS (
      SELECT 1
      FROM public.boxes b
      WHERE b.box_code = v_code
        AND coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
    ) THEN
      RETURN v_code;
    END IF;

    IF v_tries >= 100 THEN
      RAISE EXCEPTION 'NO_BOX_CODE_AVAILABLE: No se pudo asignar correlativo BOX único';
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
