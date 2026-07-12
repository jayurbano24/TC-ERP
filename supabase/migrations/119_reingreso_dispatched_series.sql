-- =============================================================================
-- 119 — Reingreso (2° ingreso) de series ya despachadas
-- - Permite capturar/clasificar series en status dispatched / returned
-- - Cuenta reentry_count por cualquier serie del equipo (S1–S4), no solo main
-- - Marca service_orders.status = DESPACHADO al salir de bodega
-- =============================================================================

CREATE OR REPLACE FUNCTION public.next_equipment_reentry_count(p_serials text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(DISTINCT so.id), 0)::integer + 1
  FROM public.service_orders so
  WHERE EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_serials, ARRAY[]::text[])) AS x(sn)
    WHERE nullif(trim(x.sn), '') IS NOT NULL
      AND (
        upper(so.main_serial) = upper(trim(x.sn))
        OR EXISTS (
          SELECT 1
          FROM public.series s
          WHERE s.service_order_id = so.id
            AND upper(s.serial_number) = upper(trim(x.sn))
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.next_equipment_reentry_count(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_equipment_reentry_count(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_equipment_reentry_count(text[]) TO service_role;

-- Bloqueo inventario: solo estados de salida permiten reingreso
CREATE OR REPLACE FUNCTION public.px_is_serial_blocked_in_inventory(p_serial text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.series%ROWTYPE;
  v_rec_status text;
  v_os_status text;
  v_st text;
BEGIN
  IF p_serial IS NULL OR trim(p_serial) = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row
  FROM public.series
  WHERE upper(serial_number) = upper(trim(p_serial))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_st := lower(v_row.current_status::text);

  -- Ya salió del ciclo → permitir 2° / N° reingreso
  IF v_st IN ('dispatched', 'returned') THEN
    RETURN false;
  END IF;

  SELECT upper(coalesce(r.status, '')) INTO v_rec_status
  FROM public.receptions r
  WHERE r.id = v_row.current_reception_id;

  IF v_rec_status IN ('ELIMINADO POR BODEGA', 'ELIMINADO', 'ARCHIVADO', 'DEVUELTO') THEN
    RETURN false;
  END IF;

  IF v_row.service_order_id IS NOT NULL THEN
    SELECT upper(coalesce(so.status, '')) INTO v_os_status
    FROM public.service_orders so
    WHERE so.id = v_row.service_order_id;
  ELSE
    SELECT upper(coalesce(so.status, '')) INTO v_os_status
    FROM public.service_orders so
    WHERE upper(so.main_serial) = upper(trim(p_serial))
    ORDER BY so.created_at DESC
    LIMIT 1;
  END IF;

  IF v_os_status IS NOT NULL AND (
    v_os_status LIKE '%DESPACHADO%'
    OR v_os_status LIKE '%ENTREGADO%'
    OR v_os_status LIKE '%SALIDA%'
    OR v_os_status LIKE '%DEVUELTO%'
  ) THEN
    RETURN false;
  END IF;

  -- Cualquier otro estado operativo = inventario activo
  RETURN true;
END;
$$;

-- Backfill OS despachadas
UPDATE public.service_orders so
SET status = 'DESPACHADO'
WHERE EXISTS (
  SELECT 1
  FROM public.series s
  WHERE s.service_order_id = so.id
    AND s.current_status::text = 'dispatched'
)
AND upper(coalesce(so.status, '')) NOT LIKE '%DESPACHADO%'
AND upper(coalesce(so.status, '')) NOT LIKE '%DEVUELTO%';



CREATE OR REPLACE FUNCTION public.warehouse_salida_tx(
  p_box_id uuid,
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
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
  v_series_ids uuid[];
  v_sibling_ids uuid[];
  v_all_ids uuid[];
  v_dispatch_id uuid;
  v_guide text;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id ORDER BY created_at), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series.';
  END IF;

  SELECT coalesce(array_agg(DISTINCT sib.id), '{}') INTO v_sibling_ids
  FROM public.series box_s
  JOIN public.series sib
    ON sib.service_order_id IS NOT NULL
   AND sib.service_order_id = box_s.service_order_id
  WHERE box_s.id = ANY (v_series_ids)
    AND NOT (sib.id = ANY (v_series_ids));

  IF v_sibling_ids IS NOT NULL AND array_length(v_sibling_ids, 1) IS NOT NULL THEN
    PERFORM 1 FROM public.series WHERE id = ANY (v_sibling_ids) FOR UPDATE;
  END IF;

  v_all_ids := v_series_ids || coalesce(v_sibling_ids, '{}');
  v_guide := coalesce(nullif(trim(p_guide_number), ''), p_destination);

  UPDATE public.series
  SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
  WHERE id = ANY (v_all_ids);

  UPDATE public.service_orders so
  SET status = 'DESPACHADO'
  WHERE so.id IN (
    SELECT DISTINCT s.service_order_id
    FROM public.series s
    WHERE s.id = ANY (v_all_ids)
      AND s.service_order_id IS NOT NULL
  );

  UPDATE public.boxes
  SET
    rack_location = 'DESPACHO',
    status = 'closed'::public.box_status,
    last_dispatch_batch_id = p_dispatch_batch_id
  WHERE id = p_box_id;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'single_box'::public.dispatch_type,
    v_guide,
    p_operator_id,
    p_destination,
    p_dispatch_batch_id,
    p_box_id
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  INSERT INTO public.erp_audit_logs (
    user_id,
    user_role,
    module,
    table_name,
    record_id,
    action,
    severity,
    new_values,
    observations,
    user_agent
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
      'operator_name', p_operator_name,
      'destination', p_destination
    ),
    coalesce('Despacho · ' || v_guide, 'Despacho caja completa'),
    'warehouse_salida_tx'
  FROM public.series s
  WHERE s.id = ANY (v_all_ids);

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, v_guide,
    v_series_ids, 'Despacho caja completa', p_idempotency_key
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1),
    'sibling_count', coalesce(array_length(v_sibling_ids, 1), 0),
    'guide_number', v_guide
  );
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.finalize_px_reception_tx(
  p_reception_id uuid,
  p_expected_version integer,
  p_variance_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300s'
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box record;
  v_new_box_code text;
  v_total_captured integer := 0;
  v_total_expected integer := 0;
  v_variance integer;
  v_is_partial boolean := false;
  v_assigned boolean;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.'; END IF;

  IF (v_rec.version IS NOT NULL AND v_rec.version <> p_expected_version) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepciÃ³n fue modificada por otro usuario.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object(
      'reception_id', v_rec.id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'received_units', coalesce(v_rec.received_units, 0),
      'expected_units', coalesce(v_rec.expected_units, 0),
      'is_partial', false,
      'already_finalized', true
    );
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepciÃ³n no puede finalizarse en estado %.', v_rec.status;
  END IF;

  SELECT count(*)::integer INTO v_total_captured
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_total_captured = 0 THEN
    RAISE EXCEPTION 'RECEPTION_EMPTY: No hay equipos capturados para finalizar.';
  END IF;

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

  v_variance := v_total_expected - v_total_captured;
  IF v_variance > 0 THEN
    v_is_partial := true;
    IF trim(coalesce(p_variance_reason, '')) = '' THEN
      RAISE EXCEPTION 'VARIANCE_REASON_REQUIRED: Faltan % equipos vs declarado â€” indique motivo.', v_variance;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.reception_id = p_reception_id AND coalesce(b.is_partial_box, false)
  ) THEN
    v_is_partial := true;
  END IF;

  CREATE TEMP TABLE _px_reentry_counts (
    sn text PRIMARY KEY,
    cnt integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _px_reentry_counts (sn, cnt)
  SELECT upper(e.main_serial),
    GREATEST(public.next_equipment_reentry_count(ARRAY[
      e.main_serial, e.serial_s2, e.serial_s3, e.serial_s4
    ]) - 1, 0)
  FROM public.px_reception_equipment e
  WHERE e.reception_id = p_reception_id
    AND e.capture_status = 'active'
  ON CONFLICT (sn) DO NOTHING;

  -- Asignar BOX-XX (pocas cajas; loop barato vs miles de upserts en loop)
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

  CREATE TEMP TABLE _eq_stage (
    equipment_id uuid PRIMARY KEY,
    box_id uuid NOT NULL,
    main_serial text NOT NULL,
    serial_s2 text,
    serial_s3 text,
    serial_s4 text,
    material text,
    eff_brand_id uuid,
    eff_model_id uuid,
    reentry integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _eq_stage (
    equipment_id, box_id, main_serial, serial_s2, serial_s3, serial_s4,
    material, eff_brand_id, eff_model_id, reentry
  )
  SELECT
    e.id,
    e.box_id,
    e.main_serial,
    e.serial_s2,
    e.serial_s3,
    e.serial_s4,
    e.material,
    coalesce(e.brand_id, b.brand_id),
    coalesce(e.model_id, b.model_id),
    coalesce(r.cnt, 0) + 1
  FROM public.px_reception_equipment e
  JOIN public.boxes b ON b.id = e.box_id
  LEFT JOIN _px_reentry_counts r ON r.sn = upper(e.main_serial)
  WHERE e.reception_id = p_reception_id
    AND e.capture_status = 'active'
    AND coalesce(b.rack_location, 'BODEGA_CENTRAL') = 'BODEGA_CENTRAL';

  CREATE TEMP TABLE _eq_os_map (
    equipment_id uuid PRIMARY KEY,
    os_id uuid NOT NULL
  ) ON COMMIT DROP;

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
    FROM _eq_stage s
    RETURNING id, main_serial, reentry_count
  )
  INSERT INTO _eq_os_map (equipment_id, os_id)
  SELECT s.equipment_id, ins.id
  FROM _eq_stage s
  JOIN ins
    ON upper(ins.main_serial) = upper(s.main_serial)
   AND ins.reentry_count = s.reentry;

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
  FROM _eq_stage s
  JOIN _eq_os_map m ON m.equipment_id = s.equipment_id
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
  FROM _eq_os_map m
  WHERE e.id = m.equipment_id;

  UPDATE public.receptions SET
    status = 'CLASIFICADA',
    received_units = v_total_captured,
    expected_units = v_total_expected,
    variance_units = CASE WHEN v_variance > 0 THEN v_variance ELSE NULL END,
    variance_reason = CASE WHEN v_variance > 0 THEN trim(p_variance_reason) ELSE NULL END,
    received_by = coalesce(v_rec.received_by, p_operator_id),
    version = coalesce(version, 1) + 1
  WHERE id = p_reception_id
  RETURNING * INTO v_rec;

  PERFORM public.px_log_activity(
    p_reception_id, NULL, 'reception_finalized',
    coalesce(p_operator_name, 'Operador') || ' finalizÃ³ ' || v_rec.guide_number,
    p_operator_id, p_operator_name,
    jsonb_build_object(
      'received_units', v_total_captured,
      'expected_units', v_total_expected,
      'is_partial', v_is_partial
    )
  );

  RETURN jsonb_build_object(
    'reception_id', v_rec.id,
    'guide_number', v_rec.guide_number,
    'status', v_rec.status,
    'received_units', v_total_captured,
    'expected_units', v_total_expected,
    'is_partial', v_is_partial
  );
END;
$$;

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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 200 THEN
    RAISE EXCEPTION 'INVALID_BATCH: p_batch_size debe estar entre 1 y 200.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.';
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
    RAISE EXCEPTION 'INVALID_STATE: La recepciÃ³n no puede finalizarse en estado %.', v_rec.status;
  END IF;

  IF upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR')
     AND v_rec.version IS NOT NULL
     AND v_rec.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepciÃ³n fue modificada por otro usuario.';
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
        coalesce(p_operator_name, 'Operador') || ' finalizÃ³ ' || v_rec.guide_number,
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
        RAISE EXCEPTION 'VARIANCE_REASON_REQUIRED: Faltan % equipos vs declarado â€” indique motivo.', v_variance;
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
  SELECT upper(q.main_serial) AS sn,
    GREATEST(public.next_equipment_reentry_count(ARRAY[
      q.main_serial, q.serial_s2, q.serial_s3, q.serial_s4
    ]) - 1, 0) AS cnt
  FROM _batch_eq q;

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
      coalesce(p_operator_name, 'Operador') || ' finalizÃ³ ' || v_rec.guide_number,
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

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.classify_equipment_batch_tx(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sap public.sap_transfer_documents%ROWTYPE;
  v_unit jsonb;
  v_main_serial text;
  v_model_id uuid;
  v_brand_id uuid;
  v_material text;
  v_reentry_count integer;
  v_os_id uuid;
  v_os_rec public.service_orders%ROWTYPE;
  v_sn text;
  v_series_id uuid;
  v_processed integer := 0;
  v_service_orders jsonb := '[]'::jsonb;
  v_series_ids jsonb := '[]'::jsonb;
  v_correlation text;
  v_all_serials text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_correlation := coalesce(nullif(trim(p_correlation_id), ''), p_reception_id::text);

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  SELECT * INTO v_sap
  FROM public.sap_transfer_documents
  WHERE id = p_sap_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento SAP no encontrado.';
  END IF;

  IF v_sap.reception_id <> p_reception_id THEN
    RAISE EXCEPTION 'El documento SAP no pertenece a la recepción indicada.';
  END IF;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_main_serial := trim(COALESCE(v_unit->>'main_serial', ''));
    IF v_main_serial = '' THEN
      CONTINUE;
    END IF;

    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    v_all_serials := ARRAY[v_main_serial];
    IF v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array' THEN
      SELECT coalesce(array_agg(trim(x)), ARRAY[v_main_serial]) INTO v_all_serials
      FROM jsonb_array_elements_text(v_unit->'all_series') AS t(x)
      WHERE trim(x) <> '';
      IF v_all_serials IS NULL OR array_length(v_all_serials, 1) IS NULL THEN
        v_all_serials := ARRAY[v_main_serial];
      END IF;
    END IF;

    v_reentry_count := public.next_equipment_reentry_count(v_all_serials);

    INSERT INTO public.service_orders (
      reception_id,
      reception_guide_id,
      sap_transfer_id,
      model_id,
      brand_id,
      main_serial,
      reentry_count,
      status
    ) VALUES (
      p_reception_id,
      v_sap.reception_guide_id,
      p_sap_transfer_id,
      v_model_id,
      v_brand_id,
      v_main_serial,
      v_reentry_count,
      'INGRESADO'
    )
    RETURNING * INTO v_os_rec;

    v_os_id := v_os_rec.id;

    IF v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array' THEN
      FOR v_sn IN SELECT jsonb_array_elements_text(v_unit->'all_series')
      LOOP
        v_sn := trim(v_sn);
        IF v_sn = '' THEN
          CONTINUE;
        END IF;

        INSERT INTO public.series (
          serial_number,
          current_reception_id,
          service_order_id,
          sap_transfer_id,
          current_status,
          model_id,
          brand_id,
          material,
          updated_at
        ) VALUES (
          v_sn,
          p_reception_id,
          v_os_id,
          p_sap_transfer_id,
          'RECEPCIONADO_BODEGA_GENERAL',
          v_model_id,
          v_brand_id,
          v_material,
          now()
        )
        ON CONFLICT (serial_number) DO UPDATE SET
          current_reception_id = EXCLUDED.current_reception_id,
          service_order_id = EXCLUDED.service_order_id,
          sap_transfer_id = EXCLUDED.sap_transfer_id,
          current_status = EXCLUDED.current_status,
          model_id = EXCLUDED.model_id,
          brand_id = EXCLUDED.brand_id,
          material = COALESCE(EXCLUDED.material, public.series.material),
          updated_at = now()
        RETURNING id INTO v_series_id;

        v_series_ids := v_series_ids || to_jsonb(v_series_id);
      END LOOP;
    END IF;

    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);

    IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
      PERFORM public.emit_domain_event(
        'equipment.classified',
        'service_order',
        v_os_id::text,
        jsonb_build_object(
          'receptionId', p_reception_id,
          'sapTransferId', p_sap_transfer_id,
          'mainSerial', v_main_serial,
          'reentryCount', v_reentry_count,
          'registeredBy', p_registered_by
        ),
        v_correlation,
        'cac',
        p_registered_by
      );
    END IF;

    v_service_orders := v_service_orders || row_to_json(v_os_rec)::jsonb;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
    PERFORM public.emit_domain_event(
      'equipment.batch_classified',
      'reception',
      p_reception_id::text,
      jsonb_build_object(
        'sapTransferId', p_sap_transfer_id,
        'unitsProcessed', v_processed,
        'registeredBy', p_registered_by
      ),
      v_correlation,
      'cac',
      p_registered_by
    );
  END IF;

  RETURN jsonb_build_object(
    'service_orders', v_service_orders,
    'series_ids', v_series_ids,
    'registered_by', p_registered_by,
    'correlation_id', v_correlation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
