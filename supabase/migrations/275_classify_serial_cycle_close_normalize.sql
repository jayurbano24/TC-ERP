-- Compensatoria: unifica cierre de ciclos con normalize_equipment_serial (sin duplicar trigger en 273).
-- Idempotente si 273/274 ya traen la definición correcta.

CREATE OR REPLACE FUNCTION public.trg_close_serial_cycle_on_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_order_id IS NOT NULL
     AND public.series_status_is_terminal(NEW.current_status::text)
     AND NOT public.series_status_is_terminal(OLD.current_status::text) THEN
    UPDATE public.service_order_serial_cycles
    SET unlinked_at = coalesce(unlinked_at, now())
    WHERE public.normalize_equipment_serial(serial_number)
        = public.normalize_equipment_serial(NEW.serial_number)
      AND service_order_id = NEW.service_order_id
      AND unlinked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_close_serial_cycle_on_terminal_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_close_serial_cycle_on_terminal_status ON public.series;
CREATE TRIGGER trg_close_serial_cycle_on_terminal_status
  AFTER UPDATE OF current_status
  ON public.series
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_close_serial_cycle_on_terminal_status();

NOTIFY pgrst, 'reload schema';
