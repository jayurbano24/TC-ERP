-- =============================================================================
-- 125 — Correlativo BOX único, irrepetible y compartido (solución estructural)
--
-- Reglas:
--  1) Única fuente de números: public.box_code_seq
--  2) Única función de asignación: public.next_box_code()
--     (px_next_bodega_box_code = alias; bodega / PX / warehouse / taller la usan)
--  3) Formato: BOX-{n}  — SIN LPAD (en Postgres LPAD(n,2) trunca n>=100)
--  4) Irrepetible para siempre: unique global BOX-* (incluye ELIMINADO / DESPACHO)
--  5) Trigger: si un INSERT llega sin box_code, se asigna next_box_code()
-- =============================================================================

-- A) Alinear secuencia al máximo histórico (cualquier ubicación)
DO $sync1$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer),
    1
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~* '^BOX-[0-9]+$';

  PERFORM setval('public.box_code_seq', GREATEST(v_max, 1), true);
END;
$sync1$;

-- ---------------------------------------------------------------------------
-- B) Reparar duplicados (mismo BOX-N en ELIMINADO + operativa, etc.)
--    Conserva la caja operativa más antigua; renumera el resto con nextval.
-- ---------------------------------------------------------------------------
DO $repair$
DECLARE
  r record;
  v_keep uuid;
  v_dup uuid;
  v_new text;
BEGIN
  FOR r IN
    SELECT upper(b.box_code) AS code
    FROM public.boxes b
    WHERE b.box_code ~* '^BOX-[0-9]+$'
    GROUP BY upper(b.box_code)
    HAVING count(*) > 1
  LOOP
    SELECT b.id
    INTO v_keep
    FROM public.boxes b
    WHERE upper(b.box_code) = r.code
    ORDER BY
      CASE
        WHEN upper(trim(coalesce(b.rack_location, ''))) IN ('ELIMINADO', 'DESPACHO') THEN 1
        ELSE 0
      END,
      b.created_at ASC NULLS LAST
    LIMIT 1;

    FOR v_dup IN
      SELECT b.id
      FROM public.boxes b
      WHERE upper(b.box_code) = r.code
        AND b.id <> v_keep
    LOOP
      v_new := 'BOX-' || nextval('public.box_code_seq')::text;
      UPDATE public.boxes SET box_code = v_new WHERE id = v_dup;
    END LOOP;
  END LOOP;
END;
$repair$;

-- ---------------------------------------------------------------------------
-- C) Índice único GLOBAL (ya no se reutiliza tras ELIMINADO/DESPACHO)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.boxes_box_code_operational_unique;

CREATE UNIQUE INDEX IF NOT EXISTS boxes_box_code_global_unique
  ON public.boxes (upper(box_code))
  WHERE box_code ~* '^BOX-[0-9]+$';

-- ---------------------------------------------------------------------------
-- D) Generador canónico — solo nextval (atómico, compartido, sin bucles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $fn$
DECLARE
  v_n bigint;
BEGIN
  v_n := nextval('public.box_code_seq');
  RETURN 'BOX-' || v_n::text;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.px_next_bodega_box_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.next_box_code();
$fn$;

REVOKE ALL ON FUNCTION public.next_box_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.px_next_bodega_box_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_next_bodega_box_code() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- E) Trigger: todo INSERT a boxes con BOX vacío/nulo recibe correlativo oficial
--    Si trae código BOX-* manual, se normaliza a mayúsculas (unique lo valida)
-- ---------------------------------------------------------------------------
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
    ELSIF trim(NEW.box_code) ~* '^BOX-[0-9]+$' THEN
      NEW.box_code := upper(trim(NEW.box_code));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.box_code IS DISTINCT FROM OLD.box_code THEN
    IF NEW.box_code IS NULL OR trim(NEW.box_code) = '' THEN
      NEW.box_code := public.next_box_code();
    ELSIF trim(NEW.box_code) ~* '^BOX-[0-9]+$' THEN
      NEW.box_code := upper(trim(NEW.box_code));
    END IF;
  END IF;

  RETURN NEW;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_boxes_assign_box_code ON public.boxes;
CREATE TRIGGER trg_boxes_assign_box_code
  BEFORE INSERT OR UPDATE OF box_code ON public.boxes
  FOR EACH ROW
  EXECUTE PROCEDURE public.boxes_assign_box_code_tg();

-- F) Re-sync secuencia tras reparación de duplicados
DO $sync2$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer),
    1
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~* '^BOX-[0-9]+$';

  PERFORM setval('public.box_code_seq', GREATEST(v_max, 1), true);
END;
$sync2$;

NOTIFY pgrst, 'reload schema';
