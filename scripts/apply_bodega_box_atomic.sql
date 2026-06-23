-- Copia operativa de supabase/migrations/041_bodega_box_atomic.sql
-- Ejecutar DESPUÉS de reparar duplicados e índice único.

-- 041: Ingreso atómico bodega + finalize con retry ante colisión
-- Ejecutar DESPUÉS de fix_box_code_duplicates.sql (0 duplicados) y apply_box_code_global_unique.sql

-- Finalize PX: asignar BOX con retry si el código ya existe
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

CREATE OR REPLACE FUNCTION public.create_bodega_box_tx(
  p_reception_id uuid,
  p_brand_id uuid,
  p_model_id uuid,
  p_capacity integer,
  p_rack_location text DEFAULT 'P-01',
  p_serial_numbers text[] DEFAULT '{}'::text[],
  p_box_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_code text;
  v_box_id uuid;
  v_sn text;
  v_linked integer := 0;
  v_assigned boolean := false;
BEGIN
  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'RECEPTION_REQUIRED: Falta recepción de origen.';
  END IF;
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe escanear al menos una serie.';
  END IF;

  IF p_box_code IS NOT NULL AND trim(p_box_code) ~ '^BOX-[0-9]+$' THEN
    BEGIN
      v_box_code := upper(trim(p_box_code));
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location
      ) VALUES (
        p_reception_id,
        v_box_code,
        p_brand_id,
        p_model_id,
        greatest(coalesce(p_capacity, 0), 1),
        'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01')
      )
      RETURNING id INTO v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      v_assigned := false;
    END;
  END IF;

  WHILE NOT v_assigned LOOP
    v_box_code := public.next_box_code();
    BEGIN
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location
      ) VALUES (
        p_reception_id,
        v_box_code,
        p_brand_id,
        p_model_id,
        greatest(coalesce(p_capacity, 0), 1),
        'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01')
      )
      RETURNING id INTO v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;
    UPDATE public.series SET
      current_box_id = v_box_id,
      current_status = 'in_central_warehouse',
      updated_at = now()
    WHERE upper(serial_number) = v_sn;
    IF FOUND THEN
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  IF v_linked = 0 THEN
    UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = v_box_id;
    RAISE EXCEPTION 'NO_SERIES_LINKED: Ninguna serie pudo vincularse. Verifique clasificación Backoffice/PX.';
  END IF;

  RETURN jsonb_build_object(
    'box_id', v_box_id,
    'box_code', v_box_code,
    'series_linked', v_linked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bodega_box_tx(uuid, uuid, uuid, integer, text, text[], text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
