-- =============================================================================
-- SSOT de ubicación física: Bodega Central != Bodega Despacho
--
-- Reglas:
--   * Serie asignada a rack OUTBOUND/DESPACHO/SALIDA* => in_dispatch_warehouse.
--   * Si esa serie vuelve a una caja BODEGA_CENTRAL => in_central_warehouse.
--   * El despacho efectivo sigue usando `dispatched` y current_box_id = NULL.
-- La protección vive en triggers para cerrar bypasses desde cualquier cliente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.series_sync_status_from_box_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_rack text;
BEGIN
  IF NEW.current_box_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT upper(trim(coalesce(b.rack_location, '')))
  INTO v_rack
  FROM public.boxes b
  WHERE b.id = NEW.current_box_id;

  IF v_rack = 'OUTBOUND'
     OR v_rack = 'DESPACHO'
     OR v_rack = 'SALIDA'
     OR v_rack LIKE 'SALIDA%' THEN
    NEW.current_status := 'in_dispatch_warehouse'::public.series_status;
  ELSIF v_rack = 'BODEGA_CENTRAL'
        AND NEW.current_status = 'in_dispatch_warehouse'::public.series_status THEN
    NEW.current_status := 'in_central_warehouse'::public.series_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS series_sync_status_from_box_location ON public.series;
CREATE TRIGGER series_sync_status_from_box_location
BEFORE INSERT OR UPDATE OF current_box_id, current_status
ON public.series
FOR EACH ROW
EXECUTE FUNCTION public.series_sync_status_from_box_location();

CREATE OR REPLACE FUNCTION public.box_sync_series_status_from_rack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_rack text := upper(trim(coalesce(NEW.rack_location, '')));
BEGIN
  IF v_rack = 'OUTBOUND'
     OR v_rack = 'DESPACHO'
     OR v_rack = 'SALIDA'
     OR v_rack LIKE 'SALIDA%' THEN
    UPDATE public.series
    SET
      current_status = 'in_dispatch_warehouse'::public.series_status,
      updated_at = now()
    WHERE current_box_id = NEW.id
      AND current_status IS DISTINCT FROM 'in_dispatch_warehouse'::public.series_status;
  ELSIF v_rack = 'BODEGA_CENTRAL' THEN
    UPDATE public.series
    SET
      current_status = 'in_central_warehouse'::public.series_status,
      updated_at = now()
    WHERE current_box_id = NEW.id
      AND current_status = 'in_dispatch_warehouse'::public.series_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS box_sync_series_status_from_rack ON public.boxes;
CREATE TRIGGER box_sync_series_status_from_rack
AFTER INSERT OR UPDATE OF rack_location
ON public.boxes
FOR EACH ROW
EXECUTE FUNCTION public.box_sync_series_status_from_rack();

-- Reparación de datos existentes: 867 equipos detectados en Outbound todavía
-- etiquetados como Bodega Central. La condición es general e idempotente.
UPDATE public.series s
SET
  current_status = 'in_dispatch_warehouse'::public.series_status,
  updated_at = now()
FROM public.boxes b
WHERE b.id = s.current_box_id
  AND (
    upper(trim(coalesce(b.rack_location, ''))) IN ('OUTBOUND', 'DESPACHO', 'SALIDA')
    OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SALIDA%'
  )
  AND s.current_status IS DISTINCT FROM 'in_dispatch_warehouse'::public.series_status;

-- Consultas por bodega y caja.
CREATE INDEX IF NOT EXISTS idx_series_dispatch_warehouse_box
  ON public.series (current_box_id, service_order_id)
  WHERE current_status = 'in_dispatch_warehouse'::public.series_status;

COMMENT ON FUNCTION public.series_sync_status_from_box_location() IS
  'Impide que una serie dentro de Outbound/Bodega Despacho figure como inventario de Bodega Central.';
COMMENT ON FUNCTION public.box_sync_series_status_from_rack() IS
  'Sincroniza las series cuando una caja cambia entre Bodega Central y Bodega Despacho.';

REVOKE ALL ON FUNCTION public.series_sync_status_from_box_location() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.box_sync_series_status_from_rack() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
