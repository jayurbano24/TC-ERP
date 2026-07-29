-- 180: Despacho parcial por serie debe sacar el equipo completo (OS + hermanas).
-- Antes: al pistolear/seleccionar S1, quedaban MAC/S2–S4 en la caja → el conteo
-- por OS (equipos) no bajaba (60 seguía en 60).

CREATE OR REPLACE FUNCTION public.warehouse_salida_parcial_tx(
  p_box_id uuid,
  p_serial_numbers text[],
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL
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
  v_dispatch_id uuid;
  v_remaining integer;
  v_remaining_os integer;
  v_s_id uuid;
  v_guide text;
  v_prior jsonb;
  v_result jsonb;
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
    WHERE upper(serial_number) = v_sn
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
    RAISE EXCEPTION 'NO_SERIES_UPDATED: Ninguna serie pudo despacharse.';
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

  -- Hermanas de la OS fuera de la caja (MAC / S2–S4) — misma semántica que salida completa
  SELECT coalesce(array_agg(DISTINCT sib.id), '{}') INTO v_sibling_ids
  FROM public.series box_s
  JOIN public.series sib
    ON sib.service_order_id IS NOT NULL
   AND sib.service_order_id = box_s.service_order_id
   AND sib.id <> box_s.id
  WHERE box_s.id = ANY (v_series_ids)
    AND NOT (sib.id = ANY (v_series_ids));

  IF v_sibling_ids IS NOT NULL AND array_length(v_sibling_ids, 1) IS NOT NULL THEN
    PERFORM 1 FROM public.series WHERE id = ANY (v_sibling_ids) FOR UPDATE;
  END IF;

  v_series_ids := v_series_ids || coalesce(v_sibling_ids, '{}');
  v_guide := coalesce(nullif(trim(p_guide_number), ''), p_destination, '');

  UPDATE public.series
  SET current_status = 'dispatched',
      current_box_id = NULL,
      updated_at = now()
  WHERE id = ANY (v_series_ids);

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'individual'::public.dispatch_type,
    v_guide,
    p_operator_id,
    coalesce(p_notes, p_destination),
    p_dispatch_batch_id,
    p_box_id
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  INSERT INTO public.erp_audit_logs (
    user_id, user_role, module, table_name, record_id, action, severity, new_values, observations, user_agent
  )
  SELECT
    p_operator_id,
    'bodega',
    'Despacho',
    'series',
    s.id::text,
    'DESPACHADO',
    'INFO'::public.audit_severity,
    jsonb_build_object(
      'status', 'DESPACHADO',
      'current_status', 'dispatched',
      'guide_number', v_guide,
      'dispatch_id', v_dispatch_id,
      'box_id', p_box_id,
      'box_code', v_box.box_code,
      'partial', true
    ),
    coalesce('Despacho parcial · ' || v_guide, 'Despacho parcial'),
    'warehouse_salida_parcial_tx'
  FROM public.series s
  WHERE s.id = ANY (v_series_ids);

  SELECT count(*) INTO v_remaining
  FROM public.series
  WHERE current_box_id = p_box_id;

  SELECT count(DISTINCT coalesce(service_order_id, id)) INTO v_remaining_os
  FROM public.series
  WHERE current_box_id = p_box_id;

  IF v_remaining = 0 THEN
    UPDATE public.boxes
    SET rack_location = 'DESPACHO',
        last_dispatch_batch_id = coalesce(p_dispatch_batch_id, last_dispatch_batch_id)
    WHERE id = p_box_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1),
    'equipos_remaining', coalesce(v_remaining_os, 0),
    'series_remaining', coalesce(v_remaining, 0),
    'box_empty', v_remaining = 0
  );

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, coalesce(nullif(v_guide, ''), 'DESPACHO'),
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, nullif(v_guide, ''),
    v_series_ids, 'Despacho parcial por series (OS completo)', p_idempotency_key,
    v_result
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_salida_parcial_tx(uuid, text[], text, text, uuid, text, text, uuid, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
