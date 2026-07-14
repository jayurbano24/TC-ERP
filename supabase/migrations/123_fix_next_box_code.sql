-- 123 Fix next_box_code (NO_BOX_CODE_AVAILABLE)

CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_next integer;
  v_code text;
  v_tries integer := 0;
  v_seq_last bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.next_box_code'));

  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(b.box_code, '[^0-9]', '', 'g'), '')::integer),
    0
  ) + 1
  INTO v_next
  FROM public.boxes b
  WHERE b.box_code ~ '^BOX-[0-9]+$';

  SELECT last_value
  INTO v_seq_last
  FROM pg_sequences
  WHERE schemaname = 'public'
    AND sequencename = 'box_code_seq';

  IF v_seq_last IS NOT NULL THEN
    v_next := GREATEST(v_next, (v_seq_last + 1)::integer);
  END IF;

  LOOP
    v_tries := v_tries + 1;
    -- NO usar LPAD(..., 2): en Postgres trunca >=100 (p.ej. 1000 → '10')
    IF v_next < 10 THEN
      v_code := 'BOX-0' || v_next::text;
    ELSE
      v_code := 'BOX-' || v_next::text;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.boxes b
      WHERE b.box_code = v_code
        AND coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
    ) THEN
      PERFORM setval('public.box_code_seq', v_next, true);
      RETURN v_code;
    END IF;

    v_next := v_next + 1;

    IF v_tries >= 10000 THEN
      RAISE EXCEPTION 'NO_BOX_CODE_AVAILABLE: No se pudo asignar correlativo BOX unico';
    END IF;
  END LOOP;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_box_code() TO service_role;

DO $sync$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~ '^BOX-[0-9]+$';

  PERFORM setval('public.box_code_seq', GREATEST(v_max, 1), true);
END;
$sync$;

NOTIFY pgrst, 'reload schema';
