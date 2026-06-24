-- Persistir profiles.id de quien recepciona (CAC vía app, PX incremental vía RPC).

CREATE OR REPLACE FUNCTION public.join_or_start_px_reception_tx(
  p_sap_document text,
  p_carrier text,
  p_notes text,
  p_expected_units_sap integer DEFAULT NULL,
  p_preferred_guide text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sap text;
  v_rec public.receptions%ROWTYPE;
  v_guide text;
  v_joined boolean := false;
BEGIN
  v_sap := trim(coalesce(p_sap_document, ''));
  IF v_sap = '' OR v_sap = 'SIN-PEDIDO' THEN
    RAISE EXCEPTION 'INVALID_SAP: Documento SAP obligatorio.';
  END IF;

  SELECT * INTO v_rec
  FROM public.receptions
  WHERE source = 'px'
    AND sap_document = v_sap
    AND upper(coalesce(status, '')) IN ('BORRADOR', 'EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_joined := true;
  ELSE
    v_guide := trim(coalesce(p_preferred_guide, ''));
    IF v_guide = '' THEN
      v_guide := public.px_next_guide_number();
    END IF;

    INSERT INTO public.receptions (
      source, guide_number, sap_document, carrier, status, notes,
      expected_units, expected_units_sap, received_units, received_by
    ) VALUES (
      'px', v_guide, v_sap, coalesce(nullif(trim(p_carrier), ''), 'N/A'),
      'EN_PROCESO', coalesce(p_notes, ''),
      coalesce(p_expected_units_sap, 0), p_expected_units_sap, 0, p_operator_id
    )
    RETURNING * INTO v_rec;

    PERFORM public.px_log_activity(
      v_rec.id, NULL, 'reception_started',
      coalesce(p_operator_name, 'Operador') || ' inició recepción ' || v_rec.guide_number,
      p_operator_id, p_operator_name,
      jsonb_build_object('sap_document', v_sap, 'joined', false)
    );
  END IF;

  IF v_joined THEN
    PERFORM public.px_log_activity(
      v_rec.id, NULL, 'operator_joined',
      coalesce(p_operator_name, 'Operador') || ' se unió a ' || v_rec.guide_number,
      p_operator_id, p_operator_name,
      jsonb_build_object('sap_document', v_sap, 'joined', true)
    );
  END IF;

  RETURN jsonb_build_object(
    'reception_id', v_rec.id,
    'guide_number', v_rec.guide_number,
    'joined', v_joined,
    'version', v_rec.version,
    'status', v_rec.status
  );
END;
$$;

-- Basado en 041_bodega_box_atomic: conserva lógica actual + received_by al finalizar si faltaba.
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
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box record;
  v_eq record;
  v_os_id uuid;
  v_reentry integer;
  v_new_box_code text;
  v_total_captured integer := 0;
  v_total_expected integer := 0;
  v_variance integer;
  v_is_partial boolean := false;
  v_serials text[];
  v_sn text;
  v_assigned boolean;
BEGIN
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;

  IF (v_rec.version IS NOT NULL AND v_rec.version <> p_expected_version) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepción fue modificada por otro usuario.';
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
    RAISE EXCEPTION 'INVALID_STATE: La recepción no puede finalizarse en estado %.', v_rec.status;
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

    FOR v_eq IN
      SELECT * FROM public.px_reception_equipment
      WHERE box_id = v_box.id AND capture_status = 'active'
      ORDER BY captured_at
    LOOP
      SELECT count(*)::integer INTO v_reentry
      FROM public.service_orders so
      WHERE upper(so.main_serial) = upper(v_eq.main_serial);

      INSERT INTO public.service_orders (
        reception_id, model_id, brand_id, main_serial, reentry_count, status
      ) VALUES (
        p_reception_id,
        coalesce(v_eq.model_id, v_box.model_id),
        coalesce(v_eq.brand_id, v_box.brand_id),
        v_eq.main_serial,
        v_reentry + 1,
        'INGRESADO'
      )
      RETURNING id INTO v_os_id;

      v_serials := ARRAY[v_eq.main_serial];
      IF v_eq.serial_s2 IS NOT NULL AND trim(v_eq.serial_s2) <> '' THEN
        v_serials := array_append(v_serials, upper(trim(v_eq.serial_s2)));
      END IF;
      IF v_eq.serial_s3 IS NOT NULL AND trim(v_eq.serial_s3) <> '' THEN
        v_serials := array_append(v_serials, upper(trim(v_eq.serial_s3)));
      END IF;
      IF v_eq.serial_s4 IS NOT NULL AND trim(v_eq.serial_s4) <> '' THEN
        v_serials := array_append(v_serials, upper(trim(v_eq.serial_s4)));
      END IF;

      FOREACH v_sn IN ARRAY v_serials LOOP
        INSERT INTO public.series (
          serial_number, brand_id, model_id, material,
          current_status, current_box_id, current_reception_id, service_order_id
        ) VALUES (
          v_sn,
          coalesce(v_eq.brand_id, v_box.brand_id),
          coalesce(v_eq.model_id, v_box.model_id),
          v_eq.material,
          'in_central_warehouse',
          v_box.id,
          p_reception_id,
          v_os_id
        )
        ON CONFLICT (serial_number) DO UPDATE SET
          brand_id = EXCLUDED.brand_id,
          model_id = EXCLUDED.model_id,
          material = EXCLUDED.material,
          current_status = EXCLUDED.current_status,
          current_box_id = EXCLUDED.current_box_id,
          current_reception_id = EXCLUDED.current_reception_id,
          service_order_id = EXCLUDED.service_order_id,
          updated_at = now();
      END LOOP;

      UPDATE public.px_reception_equipment SET
        capture_status = 'promoted',
        promoted_at = now(),
        promoted_service_order_id = v_os_id
      WHERE id = v_eq.id;
    END LOOP;
  END LOOP;

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
    coalesce(p_operator_name, 'Operador') || ' finalizó ' || v_rec.guide_number,
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
