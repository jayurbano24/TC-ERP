-- 205: Correlativo independiente Bodega SCRAPS → BOX-BAD-001
-- No comparte secuencia con Bodega Central (BOX-N).

CREATE SEQUENCE IF NOT EXISTS public.scrap_box_code_seq;

DO $sync$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '^BOX-BAD-0*', '', 'i'), '')::integer),
    0
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~* '^BOX-BAD-[0-9]+$';

  -- setval no acepta 0; si no hay BOX-BAD aún, dejar nextval = 1
  IF v_max IS NULL OR v_max < 1 THEN
    PERFORM setval('public.scrap_box_code_seq', 1, false);
  ELSE
    PERFORM setval('public.scrap_box_code_seq', v_max, true);
  END IF;
END;
$sync$;

CREATE OR REPLACE FUNCTION public.next_scrap_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $fn$
DECLARE
  v_n bigint;
BEGIN
  v_n := nextval('public.scrap_box_code_seq');
  RETURN 'BOX-BAD-' || lpad(v_n::text, 3, '0');
END;
$fn$;

REVOKE ALL ON FUNCTION public.next_scrap_box_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_scrap_box_code() TO authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS boxes_box_code_scrap_bad_unique
  ON public.boxes (upper(box_code))
  WHERE box_code ~* '^BOX-BAD-[0-9]+$';

-- Trigger: respetar BOX-BAD-* (no reescribir con next_box_code)
CREATE OR REPLACE FUNCTION public.boxes_assign_box_code_tg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $tg$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.box_code IS NULL OR trim(NEW.box_code) = '' THEN
      NEW.box_code := public.next_box_code();
    ELSIF trim(NEW.box_code) ~* '^BOX-BAD-[0-9]+$' THEN
      NEW.box_code := upper(trim(NEW.box_code));
    ELSIF trim(NEW.box_code) ~* '^BOX-[0-9]+$' THEN
      NEW.box_code := upper(trim(NEW.box_code));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.box_code IS DISTINCT FROM OLD.box_code THEN
    IF NEW.box_code IS NULL OR trim(NEW.box_code) = '' THEN
      NEW.box_code := public.next_box_code();
    ELSIF trim(NEW.box_code) ~* '^BOX-BAD-[0-9]+$' THEN
      NEW.box_code := upper(trim(NEW.box_code));
    ELSIF trim(NEW.box_code) ~* '^BOX-[0-9]+$' THEN
      NEW.box_code := upper(trim(NEW.box_code));
    END IF;
  END IF;

  RETURN NEW;
END;
$tg$;

-- Renumerar cajas SCRAP existentes (BOX-N → BOX-BAD-###) en orden de creación
DO $renumber$
DECLARE
  r record;
  v_new text;
BEGIN
  FOR r IN
    SELECT b.id
    FROM public.boxes b
    WHERE (
        upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
        OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
      )
      AND b.box_code ~* '^BOX-[0-9]+$'
      AND b.box_code !~* '^BOX-BAD-'
    ORDER BY b.created_at ASC NULLS LAST, b.id ASC
  LOOP
    v_new := public.next_scrap_box_code();
    UPDATE public.boxes SET box_code = v_new WHERE id = r.id;
  END LOOP;
END;
$renumber$;

NOTIFY pgrst, 'reload schema';
