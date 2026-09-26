-- =============================================================================
-- 250 — Una dispersión a Taller deja la serie en in_workshop.
-- Un update posterior (reproceso PX, ingreso a caja, sync) la devolvía a
-- in_central_warehouse sin auditoría ni movimiento nuevo. Diagnóstico deja de
-- verla y Equipo Listo tampoco, porque esa cola exige auditoría de Taller.
--
-- El trigger conserva el estado de piso si alguien intenta regresarla a
-- Bodega Central. El paso QC (in_validation → in_central_warehouse) sigue
-- permitido: ese es Equipo Listo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_series_workshop_from_bodega_reset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('app.allow_bodega_return', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.current_status::text IN (
       'in_workshop',
       'in_qc',
       'waiting_parts',
       'ready_to_dispatch',
       'in_control_warehouse'
     )
     AND NEW.current_status::text = 'in_central_warehouse'
  THEN
    NEW.current_status := OLD.current_status;
    NEW.current_box_id := OLD.current_box_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_series_workshop_from_bodega_reset ON public.series;
CREATE TRIGGER protect_series_workshop_from_bodega_reset
BEFORE UPDATE OF current_status, current_box_id
ON public.series
FOR EACH ROW
EXECUTE FUNCTION public.protect_series_workshop_from_bodega_reset();

COMMENT ON FUNCTION public.protect_series_workshop_from_bodega_reset() IS
  'Impide que una serie ya en piso de Taller vuelva a Bodega Central sin el flag app.allow_bodega_return. No bloquea QC (in_validation → in_central_warehouse).';

-- Series ya despachadas a Taller cuyo estado volvió a Bodega Central,
-- sin caja y sin auditoría de Taller/QC.
UPDATE public.series s
SET current_status = 'in_workshop'
WHERE s.current_status::text = 'in_central_warehouse'
  AND s.current_box_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.erp_audit_logs a
    WHERE a.record_id = s.id::text
      AND a.action IN (
        'INGRESO A TALLER',
        'DIAGNÓSTICO INICIAL COMPLETADO',
        'REPARACIÓN COMPLETADA',
        'REPARACIÓN L3 COMPLETADA',
        'CONTROL DE CALIDAD COMPLETADO',
        'REACONDICIONADO COMPLETADO',
        'TRASLADO MASIVO A TALLER'
      )
  )
  AND EXISTS (
    SELECT 1
    FROM public.warehouse_movements wm
    WHERE wm.movement_type = 'DISPERSION_CAJA'
      AND coalesce(wm.target_module, '') = 'taller'
      AND s.id = ANY (wm.series_ids)
  );

NOTIFY pgrst, 'reload schema';
