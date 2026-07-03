-- 075: Finalize PX por lotes — evita timeout del SQL Editor y picos de WAL
-- Uso: ejecutar repetidamente hasta phase = 'done'
--   SELECT public.finalize_px_reception_batch_tx(
--     '82843fcd-f19c-4ebe-8a38-e25488463084'::uuid, 1, NULL, NULL, 'OPERADOR', 50
--   );

CREATE OR REPLACE FUNCTION public.finalize_px_reception_batch_tx(
  p_reception_id uuid,
  p_expected_version integer,
  p_variance_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_batch_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box record;
  v_new_box_code text;
  v_assigned boolean;
  v_total_captured integer := 0;
  v_total_expected integer := 0;
  v_remaining integer := 0;
  v_variance integer;
  v_is_partial boolean := false;
  v_promoted_batch integer := 0;
  v_needs_prep boolean := false;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 200 THEN
    RAISE EXCEPTION 'INVALID_BATCH: p_batch_size debe estar entre 1 y 200.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object(
      'phase', 'done',
      'reception_id', v_rec.id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'already_finalized', true
    );
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no puede finalizarse en estado %.', v_rec.status;
  END IF;

  IF upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR')
     AND v_rec.version IS NOT NULL
     AND v_rec.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepción fue modificada por otro usuario.';
  END IF;

  SELECT count(*)::integer INTO v_remaining
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_remaining = 0 THEN
    IF upper(coalesce(v_rec.status, '')) = 'FINALIZANDO' THEN
      UPDATE public.receptions SET
        status = 'CLASIFICADA',
        received_units = coalesce(v_rec.received_units, 0),
        version = coalesce(version, 1) + 1
      WHERE id = p_reception_id
      RETURNING * INTO v_rec;

      PERFORM public.px_log_activity(
        p_reception_id, NULL, 'reception_finalized',
        coalesce(p_operator_name, 'Operador') || ' finalizó ' || v_rec.guide_number,
        p_operator_id, p_operator_name,
        jsonb_build_object('batched', true)
      );

      RETURN jsonb_build_object(
        'phase', 'done',
        'reception_id', v_rec.id,
        'guide_number', v_rec.guide_number,
        'status', v_rec.status,
        'promoted_this_batch', 0,
        'remaining_active', 0
      );
    END IF;

    RAISE EXCEPTION 'RECEPTION_EMPTY: No hay equipos capturados para finalizar.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.boxes b
    JOIN public.px_reception_equipment e ON e.box_id = b.id AND e.capture_status = 'active'
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
  ) INTO v_needs_prep;

  IF v_needs_prep
     AND upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO') THEN
    IF EXISTS (
      SELECT 1 FROM public.boxes b
      WHERE b.reception_id = p_reception_id
        AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
        AND EXISTS (
          SELECT 1 FROM public.px_reception_equipment e
          WHERE e.box_id = b.id AND e.capture_status = 'active'
        )
        AND b.status::text NOT IN ('cerrada', 'closed')
    ) THEN
      RAISE EXCEPTION 'BOX_NOT_CLOSED: Debe cerrar todas las cajas con equipos antes de finalizar.';
    END IF;

    SELECT coalesce(sum(coalesce(b.declared_quantity, b.capacity, 0)), 0)::integer INTO v_total_expected
    FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      );

    v_total_captured := v_remaining;
    v_variance := v_total_expected - v_total_captured;
    IF v_variance > 0 THEN
      v_is_partial := true;
      IF trim(coalesce(p_variance_reason, '')) = '' THEN
        RAISE EXCEPTION 'VARIANCE_REASON_REQUIRED: Faltan % equipos vs declarado — indique motivo.', v_variance;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.boxes b
      WHERE b.reception_id = p_reception_id AND coalesce(b.is_partial_box, false)
    ) THEN
      v_is_partial := true;
    END IF;

    FOR v_box IN
      SELECT b.*
      FROM public.boxes b
      WHERE b.reception_id = p_reception_id
        AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
        AND EXISTS (
          SELECT 1 FROM public.px_reception_equipment e
          WHERE e.box_id = b.id AND e.capture_status = 'active'
        )
      ORDER BY b.created_at
    LOOP
      v_assigned := false;
      WHILE NOT v_assigned LOOP
        v_new_box_code := public.next_box_code();
        BEGIN
          UPDATE public.boxes SET
            box_code = v_new_box_code,
            rack_location = 'BODEGA_CENTRAL',
            status = 'closed'::public.box_status,
            capacity = coalesce(v_box.declared_quantity, v_box.capacity, 0),
            closed_at = now()
          WHERE id = v_box.id;
          v_assigned := true;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END LOOP;
    END LOOP;

    UPDATE public.receptions SET
      status = 'FINALIZANDO',
      expected_units = v_total_expected,
      variance_units = CASE WHEN v_variance > 0 THEN v_variance ELSE NULL END,
      variance_reason = CASE WHEN v_variance > 0 THEN trim(p_variance_reason) ELSE NULL END,
      received_by = coalesce(v_rec.received_by, p_operator_id)
    WHERE id = p_reception_id
    RETURNING * INTO v_rec;

    RETURN jsonb_build_object(
      'phase', 'prepared',
      'reception_id', v_rec.id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'remaining_active', v_remaining,
      'expected_units', v_total_expected,
      'is_partial', v_is_partial,
      'next', 'Vuelva a ejecutar la misma llamada para promover el primer lote.'
    );
  END IF;

  CREATE TEMP TABLE _batch_eq ON COMMIT DROP AS
  SELECT
    e.id AS equipment_id,
    e.box_id,
    e.main_serial,
    e.serial_s2,
    e.serial_s3,
    e.serial_s4,
    e.material,
    coalesce(e.brand_id, b.brand_id) AS eff_brand_id,
    coalesce(e.model_id, b.model_id) AS eff_model_id
  FROM public.px_reception_equipment e
  JOIN public.boxes b ON b.id = e.box_id
  WHERE e.reception_id = p_reception_id
    AND e.capture_status = 'active'
    AND coalesce(b.rack_location, 'PX_CAPTURA') = 'BODEGA_CENTRAL'
  ORDER BY e.captured_at, e.id
  LIMIT p_batch_size;

  IF NOT EXISTS (SELECT 1 FROM _batch_eq) THEN
    RAISE EXCEPTION 'PREP_REQUIRED: Cajas no preparadas en BODEGA_CENTRAL.';
  END IF;

  CREATE TEMP TABLE _batch_reentry ON COMMIT DROP AS
  SELECT upper(so.main_serial) AS sn, count(*)::integer AS cnt
  FROM public.service_orders so
  WHERE upper(so.main_serial) IN (SELECT upper(main_serial) FROM _batch_eq)
  GROUP BY upper(so.main_serial);

  CREATE TEMP TABLE _batch_stage ON COMMIT DROP AS
  SELECT
    q.equipment_id,
    q.box_id,
    q.main_serial,
    q.serial_s2,
    q.serial_s3,
    q.serial_s4,
    q.material,
    q.eff_brand_id,
    q.eff_model_id,
    coalesce(r.cnt, 0) + 1 AS reentry
  FROM _batch_eq q
  LEFT JOIN _batch_reentry r ON r.sn = upper(q.main_serial);

  CREATE TEMP TABLE _batch_os_map ON COMMIT DROP AS
  WITH ins AS (
    INSERT INTO public.service_orders (
      reception_id, model_id, brand_id, main_serial, reentry_count, status
    )
    SELECT
      p_reception_id,
      s.eff_model_id,
      s.eff_brand_id,
      s.main_serial,
      s.reentry,
      'INGRESADO'
    FROM _batch_stage s
    RETURNING id, main_serial, reentry_count
  )
  SELECT s.equipment_id, ins.id AS os_id
  FROM _batch_stage s
  JOIN ins
    ON upper(ins.main_serial) = upper(s.main_serial)
   AND ins.reentry_count = s.reentry;

  GET DIAGNOSTICS v_promoted_batch = ROW_COUNT;

  INSERT INTO public.series (
    serial_number, brand_id, model_id, material,
    current_status, current_box_id, current_reception_id, service_order_id
  )
  SELECT
    sn.sn,
    s.eff_brand_id,
    s.eff_model_id,
    s.material,
    'in_central_warehouse',
    s.box_id,
    p_reception_id,
    m.os_id
  FROM _batch_stage s
  JOIN _batch_os_map m ON m.equipment_id = s.equipment_id
  CROSS JOIN LATERAL (
    SELECT unnest(
      array_remove(
        ARRAY[
          upper(trim(coalesce(s.main_serial, ''))),
          upper(trim(coalesce(s.serial_s2, ''))),
          upper(trim(coalesce(s.serial_s3, ''))),
          upper(trim(coalesce(s.serial_s4, '')))
        ],
        ''
      )
    ) AS sn
  ) sn
  ON CONFLICT (serial_number) DO UPDATE SET
    brand_id = EXCLUDED.brand_id,
    model_id = EXCLUDED.model_id,
    material = EXCLUDED.material,
    current_status = EXCLUDED.current_status,
    current_box_id = EXCLUDED.current_box_id,
    current_reception_id = EXCLUDED.current_reception_id,
    service_order_id = EXCLUDED.service_order_id,
    updated_at = now();

  UPDATE public.px_reception_equipment e SET
    capture_status = 'promoted',
    promoted_at = now(),
    promoted_service_order_id = m.os_id
  FROM _batch_os_map m
  WHERE e.id = m.equipment_id;

  SELECT count(*)::integer INTO v_remaining
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_remaining = 0 THEN
    SELECT count(*)::integer INTO v_total_captured
    FROM public.px_reception_equipment
    WHERE reception_id = p_reception_id AND capture_status = 'promoted';

    UPDATE public.receptions SET
      status = 'CLASIFICADA',
      received_units = v_total_captured,
      version = coalesce(version, 1) + 1
    WHERE id = p_reception_id
    RETURNING * INTO v_rec;

    PERFORM public.px_log_activity(
      p_reception_id, NULL, 'reception_finalized',
      coalesce(p_operator_name, 'Operador') || ' finalizó ' || v_rec.guide_number,
      p_operator_id, p_operator_name,
      jsonb_build_object('batched', true, 'batch_size', p_batch_size)
    );

    RETURN jsonb_build_object(
      'phase', 'done',
      'reception_id', v_rec.id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'promoted_this_batch', v_promoted_batch,
      'remaining_active', 0,
      'received_units', v_total_captured
    );
  END IF;

  IF upper(coalesce(v_rec.status, '')) <> 'FINALIZANDO' THEN
    UPDATE public.receptions SET status = 'FINALIZANDO' WHERE id = p_reception_id;
  END IF;

  RETURN jsonb_build_object(
    'phase', 'promoting',
    'reception_id', p_reception_id,
    'guide_number', v_rec.guide_number,
    'status', 'FINALIZANDO',
    'promoted_this_batch', v_promoted_batch,
    'remaining_active', v_remaining,
    'next', 'Ejecute de nuevo hasta phase = done'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_px_reception_batch_tx(uuid, integer, text, uuid, text, integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
