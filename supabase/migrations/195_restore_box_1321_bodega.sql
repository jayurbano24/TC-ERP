-- 195: Restaurar BOX-1321 — rack ELIMINADO + 0 equipos en bodega; volver a BODEGA_CENTRAL con 20 equipos.
-- Ejecutar en SQL Editor. Si el 2º SELECT sigue en 0 equipos, pegar el diagnóstico px_reception_equipment.

DO $$
DECLARE
  v_box_id uuid;
  v_code text;
  v_linked integer;
  v_os integer;
BEGIN
  SELECT b.id, b.box_code
  INTO v_box_id, v_code
  FROM public.boxes b
  WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321'
  ORDER BY b.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION '195: no se encontró BOX-1321';
  END IF;

  UPDATE public.boxes
  SET
    rack_location = 'BODEGA_CENTRAL',
    status = 'closed'::public.box_status,
    capacity = 20,
    declared_quantity = 20,
    declared_quantity_original = greatest(coalesce(declared_quantity_original, 40), 40),
    is_partial_box = false,
    partial_box_reason = NULL
  WHERE id = v_box_id;

  IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
    WITH eq AS (
      SELECT
        e.main_serial,
        e.serial_s2,
        e.serial_s3,
        e.serial_s4,
        e.promoted_service_order_id
      FROM public.px_reception_equipment e
      WHERE e.box_id = v_box_id
    ),
    sn AS (
      SELECT upper(btrim(main_serial)) AS u FROM eq WHERE main_serial IS NOT NULL AND btrim(main_serial) <> ''
      UNION SELECT upper(btrim(serial_s2)) FROM eq WHERE serial_s2 IS NOT NULL AND btrim(serial_s2) <> ''
      UNION SELECT upper(btrim(serial_s3)) FROM eq WHERE serial_s3 IS NOT NULL AND btrim(serial_s3) <> ''
      UNION SELECT upper(btrim(serial_s4)) FROM eq WHERE serial_s4 IS NOT NULL AND btrim(serial_s4) <> ''
    )
    UPDATE public.series s
    SET
      current_box_id = v_box_id,
      current_status = 'in_central_warehouse'::public.series_status,
      updated_at = now()
    WHERE (
      s.service_order_id IN (
        SELECT promoted_service_order_id FROM eq WHERE promoted_service_order_id IS NOT NULL
      )
      OR upper(btrim(s.serial_number)) IN (SELECT u FROM sn)
      OR coalesce(s.serial_normalized, '') IN (SELECT u FROM sn)
    )
    AND (
      s.current_box_id IS DISTINCT FROM v_box_id
      OR s.current_status IS DISTINCT FROM 'in_central_warehouse'::public.series_status
    );
    GET DIAGNOSTICS v_linked = ROW_COUNT;
    RAISE NOTICE '195: series re-vinculadas/actualizadas desde PX equipment: %', v_linked;
  END IF;

  -- Segunda pasada: cualquier serie que aún apunte a esta caja pero fuera de estatus bodega
  UPDATE public.series s
  SET
    current_status = 'in_central_warehouse'::public.series_status,
    updated_at = now()
  WHERE s.current_box_id = v_box_id
    AND s.current_status IS DISTINCT FROM 'in_central_warehouse'::public.series_status
    AND (
      to_regprocedure('public.series_status_is_terminal(text)') IS NULL
      OR NOT public.series_status_is_terminal(s.current_status::text)
    );

  SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer
  INTO v_os
  FROM public.series s
  WHERE s.current_box_id = v_box_id
    AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

  IF coalesce(v_os, 0) > 0 AND coalesce(v_os, 0) <> 20 THEN
    UPDATE public.boxes SET capacity = v_os, declared_quantity = v_os WHERE id = v_box_id;
    RAISE WARNING '195: equipos en bodega=% (no 20); capacity/declared ajustados a ese total.', v_os;
  ELSIF coalesce(v_os, 0) = 20 THEN
    UPDATE public.boxes SET capacity = 20, declared_quantity = 20 WHERE id = v_box_id;
  END IF;

  RAISE NOTICE '195 OK: % → BODEGA_CENTRAL, equipos_bodega=%', v_code, v_os;
END;
$$;

-- Diagnóstico PX (si equipos_bodega sigue 0)
SELECT
  e.capture_status,
  count(*) AS equipos_px,
  count(e.promoted_service_order_id) AS con_os
FROM public.px_reception_equipment e
JOIN public.boxes b ON b.id = e.box_id
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321'
GROUP BY e.capture_status;

-- Verificación listado bodega
SELECT
  b.box_code,
  b.rack_location,
  b.capacity,
  b.declared_quantity,
  cnt.equipos_count AS equipos_bodega,
  CASE
    WHEN cnt.equipos_count <= 0 THEN 'sin_equipos'
    WHEN cnt.equipos_count >= coalesce(nullif(b.capacity, 0), 1) THEN 'completa'
    ELSE 'parcial'
  END AS fill_status
FROM public.boxes b
INNER JOIN LATERAL (
  SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::bigint AS equipos_count
  FROM public.series s
  WHERE s.current_box_id = b.id
    AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
) cnt ON true
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321';

NOTIFY pgrst, 'reload schema';
