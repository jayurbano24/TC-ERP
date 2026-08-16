-- =============================================================================
-- 206 — No pisar series.updated_at en sync SAP (material / valoración / sap_status).
-- FECHA en Taller usa updated_at como fallback; el trigger genérico lo actualizaba
-- en CUALQUIER UPDATE (p.ej. sap_sync_matches), moviendo la fecha de Diagnóstico.
-- Solo avanzar updated_at cuando cambia ubicación operativa o caja/OS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_series_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_status IS DISTINCT FROM OLD.current_status
     OR NEW.current_box_id IS DISTINCT FROM OLD.current_box_id
     OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_series_updated_at ON public.series;
CREATE TRIGGER trg_series_updated_at
BEFORE UPDATE ON public.series
FOR EACH ROW
EXECUTE FUNCTION public.set_series_updated_at();
