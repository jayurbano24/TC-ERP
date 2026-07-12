-- =============================================================================
-- 115 — Outbound: correlativo único e irrepetible (OB-000001), como OS (TC-xxxxx)
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS public.outbound_code_seq START WITH 1 INCREMENT BY 1;

-- Sincroniza secuencia con códigos OB-/MB-/CS- existentes
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
  WHERE box_code ~ '^(OB|MB|CS)-[0-9]+$';

  PERFORM setval(
    'public.outbound_code_seq',
    GREATEST(v_max, 1),
    v_max > 0
  );
END $$;

CREATE OR REPLACE FUNCTION public.next_outbound_code()
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
    v_code := 'OB-' || LPAD(nextval('public.outbound_code_seq')::text, 6, '0');

    IF NOT EXISTS (
      SELECT 1 FROM public.boxes b WHERE b.box_code = v_code
    ) THEN
      RETURN v_code;
    END IF;

    IF v_tries >= 100 THEN
      RAISE EXCEPTION 'NO_OUTBOUND_CODE_AVAILABLE: No se pudo asignar correlativo OB único';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.next_outbound_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_outbound_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_outbound_code() TO service_role;

COMMENT ON FUNCTION public.next_outbound_code() IS
  'Correlativo único de Outbound de despacho: OB-000001, OB-000002, …';

NOTIFY pgrst, 'reload schema';
