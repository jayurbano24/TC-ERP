-- PX: re-escanear una serie que el operador eliminó antes en la misma guía.
--
-- px_reception_equipment conserva la fila con capture_status='deleted' (la baja
-- es lógica), pero UNIQUE (reception_id, main_serial) es física. Al volver a
-- pistolear la serie —caso normal cuando se mueve una unidad de caja— el INSERT
-- reventaba con el error crudo de Postgres y la unidad quedaba sin ingresar.
--
-- La fila anulada es staging: la trazabilidad de la baja vive en
-- px_reception_activity.
-- Se recicla la fila muerta dentro de la misma transacción del escaneo, de modo
-- que ninguna otra validación (OS abierta, otra guía, capacidad) queda saltada:
-- este trigger corre después de todas ellas.

CREATE OR REPLACE FUNCTION public.trg_px_equipment_reclaim_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_existing public.px_reception_equipment%ROWTYPE;
  v_box_code text;
BEGIN
  SELECT * INTO v_existing
  FROM public.px_reception_equipment
  WHERE reception_id = NEW.reception_id
    AND main_serial = NEW.main_serial
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_existing.capture_status = 'deleted' THEN
    DELETE FROM public.px_reception_serial_lines WHERE equipment_id = v_existing.id;
    DELETE FROM public.px_reception_equipment WHERE id = v_existing.id;
    RETURN NEW;
  END IF;

  SELECT box_code INTO v_box_code FROM public.boxes WHERE id = v_existing.box_id;

  IF v_existing.capture_status = 'promoted' THEN
    RAISE EXCEPTION
      'DUPLICATE_IN_RECEPTION: La serie % ya fue promovida a inventario en esta guía (caja %).',
      NEW.main_serial, coalesce(v_box_code, '(sin caja)');
  END IF;

  RAISE EXCEPTION
    'DUPLICATE_IN_RECEPTION: La serie % ya está en la caja % de ESTA guía. Elimine el duplicado de esa caja antes de continuar.',
    NEW.main_serial, coalesce(v_box_code, '(sin caja)');
END;
$$;

REVOKE ALL ON FUNCTION public.trg_px_equipment_reclaim_deleted() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_px_equipment_reclaim_deleted
  ON public.px_reception_equipment;
CREATE TRIGGER trg_px_equipment_reclaim_deleted
  BEFORE INSERT ON public.px_reception_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_px_equipment_reclaim_deleted();

NOTIFY pgrst, 'reload schema';
