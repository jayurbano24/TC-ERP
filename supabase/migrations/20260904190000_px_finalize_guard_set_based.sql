-- PX finalize: el trigger anterior revalidaba cada serie activa con
-- validate_serial_for_px + advisory lock. En una guía de ~400 equipos eso
-- supera statement_timeout (57014) en el primer UPDATE a FINALIZANDO.
-- La regla se mantiene con JOINs acotados a las series de esta guía.

CREATE OR REPLACE FUNCTION public.trg_px_reception_finalize_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_box record;
  v_hit record;
BEGIN
  IF upper(coalesce(NEW.status, '')) NOT IN ('FINALIZANDO', 'CLASIFICADA')
     OR upper(coalesce(OLD.status, '')) = upper(coalesce(NEW.status, '')) THEN
    RETURN NEW;
  END IF;

  SELECT
    b.id,
    b.box_code,
    coalesce(b.declared_quantity, b.capacity, 0) AS declared,
    count(DISTINCT rejected.id)::integer AS rejected
  INTO v_box
  FROM public.boxes b
  JOIN public.px_rejected_serial_scans rejected
    ON rejected.box_id = b.id
   AND rejected.error_code = 'DUPLICATE_OPEN_OS'
  WHERE b.reception_id = NEW.id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
    AND coalesce(b.declared_quantity, b.capacity, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.px_reception_equipment e
      WHERE e.box_id = b.id
        AND e.capture_status IN ('active', 'promoted')
    )
  GROUP BY b.id, b.box_code, b.declared_quantity, b.capacity
  ORDER BY b.created_at
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'ZERO_ACCEPTED_BOX: No es posible finalizar la recepción. La caja % tiene 0 aceptadas y % rechazadas por otra OS abierta.',
      v_box.box_code, v_box.rejected;
  END IF;

  -- Solo al entrar a FINALIZANDO. En CLASIFICADA ya no hay activas que revalidar.
  IF upper(coalesce(NEW.status, '')) = 'FINALIZANDO'
     AND upper(coalesce(OLD.status, '')) IS DISTINCT FROM 'FINALIZANDO' THEN
    WITH rec_serials AS (
      SELECT DISTINCT upper(trim(sl.serial_number)) AS serial
      FROM public.px_reception_serial_lines sl
      JOIN public.px_reception_equipment e
        ON e.id = sl.equipment_id
       AND e.capture_status = 'active'
      WHERE e.reception_id = NEW.id
    ),
    hits AS (
      SELECT
        rs.serial,
        so.id AS existing_os_id,
        so.os_label AS existing_os_number,
        so.status AS existing_os_status
      FROM rec_serials rs
      JOIN public.service_order_serial_cycles c
        ON upper(trim(c.serial_number)) = rs.serial
       AND c.unlinked_at IS NULL
      JOIN public.service_orders so ON so.id = c.service_order_id
      WHERE so.reception_id IS DISTINCT FROM NEW.id
        AND NOT public.service_order_status_is_closed(so.status)

      UNION ALL

      SELECT
        rs.serial,
        so.id,
        so.os_label,
        so.status
      FROM rec_serials rs
      JOIN public.service_orders so
        ON upper(trim(so.main_serial)) = rs.serial
      WHERE so.reception_id IS DISTINCT FROM NEW.id
        AND NOT public.service_order_status_is_closed(so.status)

      UNION ALL

      SELECT
        rs.serial,
        so.id,
        so.os_label,
        so.status
      FROM rec_serials rs
      JOIN public.series s
        ON upper(trim(s.serial_number)) = rs.serial
      JOIN public.service_orders so ON so.id = s.service_order_id
      WHERE so.reception_id IS DISTINCT FROM NEW.id
        AND NOT public.service_order_status_is_closed(so.status)
        AND NOT public.series_status_is_terminal(s.current_status::text)
    )
    SELECT serial, existing_os_id, existing_os_number, existing_os_status
    INTO v_hit
    FROM hits
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'DUPLICATE_OPEN_OS: La serie % ya está en la OS abierta % (estado %). Resuelva esa OS antes de finalizar.',
        v_hit.serial, v_hit.existing_os_number, v_hit.existing_os_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
