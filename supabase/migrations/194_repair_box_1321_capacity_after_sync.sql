-- 194: Reparar BOX-1321 tras 193 — capacity=0 por sync; fijar 20 y recontabilizar equipos en bodega.
-- Ejecutar en SQL Editor (No limit). Ctrl+F5 en Bodega.

DO $$
DECLARE
  v_box_id uuid;
  v_code text;
  v_rack text;
  v_os_wh integer;
  v_os_any integer;
  v_series_fixed integer;
BEGIN
  SELECT b.id, b.box_code, b.rack_location
  INTO v_box_id, v_code, v_rack
  FROM public.boxes b
  WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321'
  ORDER BY b.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION '194: no se encontró BOX-1321';
  END IF;

  SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer
  INTO v_os_wh
  FROM public.series s
  WHERE s.current_box_id = v_box_id
    AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

  SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer
  INTO v_os_any
  FROM public.series s
  WHERE s.current_box_id = v_box_id;

  -- Series en la caja pero fuera del filtro de listado bodega → alinear a bodega central
  IF coalesce(v_os_wh, 0) < coalesce(v_os_any, 0)
     AND upper(coalesce(v_rack, '')) = 'BODEGA_CENTRAL'
     AND to_regprocedure('public.series_status_is_terminal(text)') IS NOT NULL THEN
    UPDATE public.series s
    SET
      current_status = 'in_central_warehouse'::public.series_status,
      updated_at = now()
    WHERE s.current_box_id = v_box_id
      AND s.current_status NOT IN (
        'in_central_warehouse'::public.series_status,
        'in_control_warehouse'::public.series_status
      )
      AND NOT public.series_status_is_terminal(s.current_status::text);
    GET DIAGNOSTICS v_series_fixed = ROW_COUNT;

    SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer
    INTO v_os_wh
    FROM public.series s
    WHERE s.current_box_id = v_box_id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

    RAISE NOTICE '194: % filas series re-etiquetadas a in_central_warehouse', v_series_fixed;
  END IF;

  UPDATE public.boxes
  SET
    capacity = 20,
    declared_quantity = 20,
    declared_quantity_original = greatest(
      coalesce(declared_quantity_original, 40),
      40
    ),
    is_partial_box = false,
    partial_box_reason = NULL,
    quantity_adjustment_reason = coalesce(
      quantity_adjustment_reason,
      '194: capacity fijada en 20 (cierre real; no sync a 0 equipos)'
    )
  WHERE id = v_box_id;

  RAISE NOTICE '194 OK: % rack=% equipos_bodega=% equipos_caja_total=% capacity→20',
    v_code, v_rack, v_os_wh, v_os_any;
END;
$$;

-- Diagnóstico por estatus
SELECT
  s.current_status::text AS status,
  count(*) AS filas,
  count(DISTINCT coalesce(s.service_order_id, s.id)) AS equipos
FROM public.boxes b
JOIN public.series s ON s.current_box_id = b.id
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321'
GROUP BY s.current_status
ORDER BY equipos DESC, status;

-- Verificación listado bodega (misma lógica que warehouse_list_boxes_page)
SELECT
  b.box_code,
  b.rack_location,
  b.capacity,
  b.declared_quantity,
  b.declared_quantity_original,
  b.is_partial_box,
  cnt.equipos_count AS equipos_bodega,
  CASE
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
