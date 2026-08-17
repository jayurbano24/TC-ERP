-- =============================================================================
-- 208 — Evitar empleados duplicados por nombre (Gestión de Personal).
-- Bloquea INSERT/UPDATE cuando ya existe el mismo nombre (trim + lower + espacios).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.employees_prevent_duplicate_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_norm text;
  v_other text;
BEGIN
  v_norm := lower(trim(regexp_replace(coalesce(NEW.nombre_completo, ''), '\s+', ' ', 'g')));
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN NEW;
  END IF;

  SELECT e.nombre_completo
    INTO v_other
  FROM public.employees e
  WHERE e.id IS DISTINCT FROM NEW.id
    AND lower(trim(regexp_replace(coalesce(e.nombre_completo, ''), '\s+', ' ', 'g'))) = v_norm
  LIMIT 1;

  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_NAME: Ya existe un empleado con el nombre "%"', NEW.nombre_completo
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_prevent_duplicate_name ON public.employees;
CREATE TRIGGER trg_employees_prevent_duplicate_name
BEFORE INSERT OR UPDATE OF nombre_completo ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.employees_prevent_duplicate_name();

COMMENT ON FUNCTION public.employees_prevent_duplicate_name() IS
  'Impide alta/edición de empleados con nombre completo duplicado (normalizado).';
