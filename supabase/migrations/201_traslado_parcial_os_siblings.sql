-- =============================================================================
-- 201 — Traslado parcial Bodega → Taller: mover unidad OS completa (hermanas).
-- Misma semántica que warehouse_salida_parcial_tx (180+): si se selecciona
-- una serie de TC-xxxxx, van S1–S4 / MAC hermanas en la misma caja (y hermanas
-- aún en stock de bodega de esa OS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.warehouse_traslado_parcial_tx(
  p_box_id uuid,
  p_serial_numbers text[],
  p_target_location text,
  p_target_status text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_sn text;
  v_seed_ids uuid[] := '{}';
  v_series_ids uuid[] := '{}';
  v_sibling_ids uuid[] := '{}';
  v_remaining integer;
  v_s_id uuid;
  v_prior jsonb;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe indicar al menos una serie.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.metadata->'rpc_result' INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;

    SELECT id INTO v_s_id
    FROM public.series
    WHERE (
        upper(serial_number) = v_sn
        OR upper(coalesce(s2, '')) = v_sn
        OR upper(coalesce(s3, '')) = v_sn
        OR upper(coalesce(s4, '')) = v_sn
      )
      AND current_box_id = p_box_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERIE_NOT_IN_BOX: % no pertenece a la caja %', v_sn, v_box.box_code;
    END IF;

    IF NOT (v_s_id = ANY (v_seed_ids)) THEN
      v_seed_ids := array_append(v_seed_ids, v_s_id);
    END IF;
  END LOOP;

  IF array_length(v_seed_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES_UPDATED: Ninguna serie pudo trasladarse.';
  END IF;

  -- Todas las series de las mismas OS que estén en ESTA caja
  SELECT coalesce(array_agg(DISTINCT s.id), v_seed_ids) INTO v_series_ids
  FROM public.series seed
  JOIN public.series s
    ON s.current_box_id = p_box_id
   AND (
     s.id = seed.id
     OR (
       seed.service_order_id IS NOT NULL
       AND s.service_order_id = seed.service_order_id
     )
   )
  WHERE seed.id = ANY (v_seed_ids);

  -- Hermanas de la OS aún en stock de bodega (otra caja / sin caja)
  SELECT coalesce(array_agg(DISTINCT sib.id), '{}') INTO v_sibling_ids
  FROM public.series box_s
  JOIN public.series sib
    ON sib.service_order_id IS NOT NULL
   AND sib.service_order_id = box_s.service_order_id
   AND sib.id <> box_s.id
  WHERE box_s.id = ANY (v_series_ids)
    AND NOT (sib.id = ANY (v_series_ids))
    AND sib.current_status::text IN ('in_central_warehouse', 'in_control_warehouse');

  IF v_sibling_ids IS NOT NULL AND array_length(v_sibling_ids, 1) IS NOT NULL THEN
    PERFORM 1 FROM public.series WHERE id = ANY (v_sibling_ids) FOR UPDATE;
  END IF;

  v_series_ids := v_series_ids || coalesce(v_sibling_ids, '{}');

  UPDATE public.series
  SET current_status = p_target_status::public.series_status,
      current_box_id = NULL,
      updated_at = now()
  WHERE id = ANY (v_series_ids);

  PERFORM public.warehouse_log_movement_internal(
    'TRASLADO', 'bodega_central', 'bodega_central',
    v_box.rack_location, coalesce(nullif(trim(p_target_location), ''), p_target_status),
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, NULL,
    v_series_ids, 'Traslado parcial por series (unidad OS)', p_idempotency_key,
    jsonb_build_object(
      'success', true,
      'series_count', coalesce(array_length(v_series_ids, 1), 0),
      'seed_count', coalesce(array_length(v_seed_ids, 1), 0)
    )
  );

  PERFORM public.warehouse_sync_sap_for_series(v_series_ids);

  SELECT count(*) INTO v_remaining FROM public.series WHERE current_box_id = p_box_id;
  IF v_remaining = 0 THEN
    -- Misma convención que dispersión: caja vacía sale de inventario operativo
    UPDATE public.boxes
    SET rack_location = CASE
      WHEN upper(trim(coalesce(p_target_location, ''))) LIKE 'TALLER%' THEN 'ELIMINADO'
      ELSE 'DESPACHO'
    END
    WHERE id = p_box_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'series_count', coalesce(array_length(v_series_ids, 1), 0),
    'box_empty', v_remaining = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_traslado_parcial_tx(uuid, text[], text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_traslado_parcial_tx(uuid, text[], text, text, uuid, text, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
