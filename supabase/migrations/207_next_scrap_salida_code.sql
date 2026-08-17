-- =============================================================================
-- 207 — Conduce de salida Bodega SCRAPS: TC-SCRAPS-001…
-- Independiente de TC-INV (Bodega Central) y de NS- (Outbound).
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.scrap_salida_code_seq;

DO $sync$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(guide_number, '^TC-SCRAPS-0*', '', 'i'), '')::integer),
    0
  )
  INTO v_max
  FROM public.dispatches
  WHERE guide_number ~* '^TC-SCRAPS-[0-9]+$';

  -- Arrancar en 100 (misma convención que TC-INV); si ya hay correlativos, continuar.
  IF v_max IS NULL OR v_max < 99 THEN
    PERFORM setval('public.scrap_salida_code_seq', 99, true);
  ELSE
    PERFORM setval('public.scrap_salida_code_seq', v_max, true);
  END IF;
END;
$sync$;

CREATE OR REPLACE FUNCTION public.next_scrap_salida_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $fn$
DECLARE
  v_code text;
  v_tries integer := 0;
BEGIN
  LOOP
    v_tries := v_tries + 1;
    v_code := 'TC-SCRAPS-' || lpad(nextval('public.scrap_salida_code_seq')::text, 3, '0');

    IF NOT EXISTS (
      SELECT 1 FROM public.dispatches d WHERE d.guide_number = v_code
    ) THEN
      RETURN v_code;
    END IF;

    IF v_tries >= 100 THEN
      RAISE EXCEPTION 'NO_SCRAP_SALIDA_CODE: No se pudo asignar correlativo TC-SCRAPS único';
    END IF;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.next_scrap_salida_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_scrap_salida_code() TO authenticated, service_role;

COMMENT ON FUNCTION public.next_scrap_salida_code() IS
  'Conduce de salida Bodega SCRAPS: TC-SCRAPS-100, TC-SCRAPS-101, …';

NOTIFY pgrst, 'reload schema';
