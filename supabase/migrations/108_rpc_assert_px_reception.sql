-- =============================================================================
-- 108 — app_assert en RPCs PX (ADR-011 2D)
-- =============================================================================
-- Requiere 104. Roles: admin/supervisor/receptor_px/receptor_cac.
-- Log-only salvo app.enforce_rpc_roles=on.
-- Llamadas vía service_role (API) hacen no-op del assert (jwt role=service_role).
-- Defensa si alguien invoca con JWT de usuario directo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.app_assert_recepcion()
RETURNS void
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_assert_any_role(
    'admin'::public.app_role,
    'supervisor'::public.app_role,
    'receptor_px'::public.app_role,
    'receptor_cac'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION public.app_assert_recepcion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_recepcion() TO authenticated, service_role;

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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
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
      coalesce(p_operator_name, 'Operador') || ' iniciÃ³ recepciÃ³n ' || v_rec.guide_number,
      p_operator_id, p_operator_name,
      jsonb_build_object('sap_document', v_sap, 'joined', false)
    );
  END IF;

  IF v_joined THEN
    PERFORM public.px_log_activity(
      v_rec.id, NULL, 'operator_joined',
      coalesce(p_operator_name, 'Operador') || ' se uniÃ³ a ' || v_rec.guide_number,
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

CREATE OR REPLACE FUNCTION public.acquire_box_lock_tx(
  p_box_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_lock_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.';
  END IF;

  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_CLOSED: La caja ya estÃ¡ cerrada.';
  END IF;

  IF v_box.locked_by IS NOT NULL
     AND v_box.lock_expires_at > now()
     AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Caja en uso por otro operador.';
  END IF;

  UPDATE public.boxes SET
    locked_by = p_operator_id,
    locked_at = now(),
    lock_expires_at = now() + (p_lock_minutes || ' minutes')::interval,
    assigned_operator_id = coalesce(assigned_operator_id, p_operator_id),
    status = CASE WHEN status::text IN ('open', 'abierta') THEN 'en_captura'::public.box_status ELSE status END,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_lock_acquired',
    coalesce(p_operator_name, 'Operador') || ' tomÃ³ control de ' || v_box.box_code,
    p_operator_id, p_operator_name, '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'box_code', v_box.box_code,
    'locked_by', v_box.locked_by,
    'lock_expires_at', v_box.lock_expires_at,
    'version', v_box.version
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.release_box_lock_tx(
  p_box_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'manual_release'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF v_box.locked_by IS NOT NULL
     AND v_box.locked_by IS DISTINCT FROM p_operator_id
     AND p_reason NOT IN ('supervisor_timeout_override', 'supervisor_release') THEN
    RAISE EXCEPTION 'BOX_LOCKED: Solo el operador con lock o un supervisor puede liberar.';
  END IF;

  UPDATE public.boxes SET
    locked_by = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_lock_released',
    'Lock liberado en ' || v_box.box_code || ' (' || p_reason || ')',
    p_operator_id, NULL, jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('box_id', v_box.id, 'version', v_box.version);
END;
$$;
CREATE OR REPLACE FUNCTION public.adjust_px_box_quantity_tx(
  p_box_id uuid,
  p_new_declared_quantity integer,
  p_reason text,
  p_expected_version integer,
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
  v_box public.boxes%ROWTYPE;
  v_captured integer;
  v_reason text;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio para ajustar cantidad.';
  END IF;
  IF p_new_declared_quantity IS NULL OR p_new_declared_quantity < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: Cantidad invÃ¡lida.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;
  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_CLOSED: No se puede ajustar una caja cerrada.';
  END IF;
  IF v_box.locked_by IS NOT NULL AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Sin lock sobre esta caja.';
  END IF;

  SELECT count(*)::integer INTO v_captured
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  IF p_new_declared_quantity < v_captured THEN
    RAISE EXCEPTION 'QUANTITY_BELOW_CAPTURED: Ya hay % equipos capturados; no puede bajar a %.', v_captured, p_new_declared_quantity;
  END IF;

  UPDATE public.boxes SET
    declared_quantity_original = coalesce(declared_quantity_original, declared_quantity, capacity),
    declared_quantity = p_new_declared_quantity,
    capacity = p_new_declared_quantity,
    quantity_adjustment_reason = v_reason,
    quantity_adjusted_by = p_operator_id,
    quantity_adjusted_at = now(),
    is_partial_box = (p_new_declared_quantity < coalesce(declared_quantity_original, declared_quantity, capacity)),
    partial_box_reason = CASE
      WHEN p_new_declared_quantity < coalesce(declared_quantity_original, declared_quantity, capacity) THEN v_reason
      ELSE partial_box_reason END,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  UPDATE public.px_reception_lots SET expected_units = p_new_declared_quantity
  WHERE box_id = p_box_id;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_quantity_adjusted',
    coalesce(p_operator_name, 'Operador') || ' ajustÃ³ cantidad de ' || v_box.box_code || ' a ' || p_new_declared_quantity,
    p_operator_id, p_operator_name,
    jsonb_build_object('reason', v_reason, 'captured', v_captured)
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'declared_quantity', v_box.declared_quantity,
    'captured_count', v_captured,
    'is_partial_box', v_box.is_partial_box,
    'version', v_box.version
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.close_px_box_tx(
  p_box_id uuid,
  p_expected_version integer,
  p_partial_reason text DEFAULT NULL,
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
  v_box public.boxes%ROWTYPE;
  v_captured integer;
  v_declared integer;
  v_reason text;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;
  IF v_box.locked_by IS NOT NULL AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Sin lock sobre esta caja.';
  END IF;

  SELECT count(*)::integer INTO v_captured
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);
  v_reason := trim(coalesce(p_partial_reason, ''));

  IF v_captured = 0 THEN
    RAISE EXCEPTION 'BOX_EMPTY: La caja no tiene equipos capturados.';
  END IF;

  IF v_captured < v_declared THEN
    IF v_reason = '' THEN
      RAISE EXCEPTION 'PARTIAL_REASON_REQUIRED: Capturados % de % â€” indique motivo de caja parcial o ajuste cantidad.', v_captured, v_declared;
    END IF;
    UPDATE public.boxes SET
      status = 'cerrada'::public.box_status,
      is_partial_box = true,
      partial_box_reason = v_reason,
      locked_by = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      version = version + 1
    WHERE id = p_box_id
    RETURNING * INTO v_box;
  ELSIF v_captured >= v_declared THEN
    UPDATE public.boxes SET
      status = 'cerrada'::public.box_status,
      locked_by = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      version = version + 1
    WHERE id = p_box_id
    RETURNING * INTO v_box;
  END IF;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_closed',
    coalesce(p_operator_name, 'Operador') || ' cerrÃ³ ' || v_box.box_code || ' (' || v_captured || '/' || v_declared || ')',
    p_operator_id, p_operator_name,
    jsonb_build_object('partial', v_box.is_partial_box, 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'status', v_box.status,
    'captured_count', v_captured,
    'declared_quantity', v_declared,
    'is_partial_box', v_box.is_partial_box,
    'version', v_box.version
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.capture_px_equipment_tx(
  p_reception_id uuid,
  p_box_id uuid,
  p_main_serial text,
  p_serial_s2 text DEFAULT NULL,
  p_serial_s3 text DEFAULT NULL,
  p_serial_s4 text DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_model_id uuid DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_captured_by uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box public.boxes%ROWTYPE;
  v_main text;
  v_serials text[];
  v_sn text;
  v_active integer;
  v_declared integer;
  v_equipment_id uuid;
  v_slot smallint;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  v_main := upper(trim(coalesce(p_main_serial, '')));
  IF v_main = '' THEN
    RAISE EXCEPTION 'DUPLICATE_INVALID: Serie principal obligatoria.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepciÃ³n no acepta capturas.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND reception_id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja estÃ¡ cerrada.';
  END IF;

  IF v_box.locked_by IS NULL OR v_box.lock_expires_at <= now() THEN
    RAISE EXCEPTION 'BOX_NOT_LOCKED: Debe tomar control de la caja antes de escanear.';
  END IF;

  IF v_box.locked_by IS DISTINCT FROM p_captured_by THEN
    RAISE EXCEPTION 'BOX_LOCKED: Otro operador tiene control de esta caja.';
  END IF;

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);
  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  IF v_declared > 0 AND v_active >= v_declared THEN
    RAISE EXCEPTION 'BOX_FULL: La caja alcanzÃ³ su capacidad (%).', v_declared;
  END IF;

  v_serials := ARRAY[v_main];
  IF p_serial_s2 IS NOT NULL AND trim(p_serial_s2) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s2)));
  END IF;
  IF p_serial_s3 IS NOT NULL AND trim(p_serial_s3) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s3)));
  END IF;
  IF p_serial_s4 IS NOT NULL AND trim(p_serial_s4) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s4)));
  END IF;

  IF (SELECT count(DISTINCT s) FROM unnest(v_serials) s) <> array_length(v_serials, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_IN_EQUIPMENT: Series duplicadas en el mismo equipo.';
  END IF;

  FOREACH v_sn IN ARRAY v_serials LOOP
    IF EXISTS (
      SELECT 1 FROM public.px_reception_serial_lines sl
      WHERE sl.reception_id = p_reception_id AND upper(sl.serial_number) = v_sn
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_IN_RECEPTION: La serie % ya fue capturada en esta recepciÃ³n.', v_sn;
    END IF;
    IF public.px_is_serial_blocked_in_inventory(v_sn) THEN
      RAISE EXCEPTION 'DUPLICATE_GLOBAL: La serie % ya estÃ¡ en inventario activo.', v_sn;
    END IF;
  END LOOP;

  INSERT INTO public.px_reception_equipment (
    reception_id, box_id, main_serial, serial_s2, serial_s3, serial_s4,
    brand_id, model_id, material, captured_by, captured_by_name, capture_workstation
  ) VALUES (
    p_reception_id, p_box_id, v_main,
    NULLIF(upper(trim(coalesce(p_serial_s2, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s3, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s4, ''))), ''),
    p_brand_id, p_model_id, NULLIF(trim(coalesce(p_material, '')), ''),
    p_captured_by, NULLIF(trim(coalesce(p_operator_name, '')), ''), NULLIF(trim(coalesce(p_workstation, '')), '')
  )
  RETURNING id INTO v_equipment_id;

  v_slot := 1;
  FOREACH v_sn IN ARRAY v_serials LOOP
    INSERT INTO public.px_reception_serial_lines (
      equipment_id, reception_id, box_id, serial_number, slot
    ) VALUES (v_equipment_id, p_reception_id, p_box_id, v_sn, v_slot);
    v_slot := v_slot + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  UPDATE public.boxes SET
    status = 'incompleta'::public.box_status,
    lock_expires_at = now() + interval '30 minutes',
    version = version + 1
  WHERE id = p_box_id;

  PERFORM public.px_log_activity(
    p_reception_id, p_box_id, 'equipment_captured',
    coalesce(p_operator_name, 'Operador') || ' capturÃ³ ' || v_main,
    p_captured_by, p_operator_name, jsonb_build_object('equipment_id', v_equipment_id)
  );

  RETURN jsonb_build_object(
    'equipment_id', v_equipment_id,
    'main_serial', v_main,
    'captured_count', v_active,
    'declared_quantity', v_declared,
    'box_status', (SELECT status::text FROM public.boxes WHERE id = p_box_id)
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.reopen_px_box_tx(
  p_box_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_rec public.receptions%ROWTYPE;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = v_box.reception_id;
  IF upper(coalesce(v_rec.status, '')) <> 'EN_PROCESO' THEN
    RAISE EXCEPTION 'INVALID_STATE: Solo se puede reabrir en recepciÃ³n EN_PROCESO.';
  END IF;

  IF v_box.status::text NOT IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'INVALID_STATE: La caja no estÃ¡ cerrada.';
  END IF;

  UPDATE public.boxes SET
    status = 'en_captura'::public.box_status,
    locked_by = p_operator_id,
    locked_at = now(),
    lock_expires_at = now() + interval '30 minutes',
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_reopened',
    coalesce(p_operator_name, 'Operador') || ' reabriÃ³ ' || v_box.box_code,
    p_operator_id, p_operator_name,
    jsonb_build_object('reason', coalesce(p_reason, ''))
  );

  RETURN jsonb_build_object('box_id', v_box.id, 'status', v_box.status, 'version', v_box.version);
END;
$$;
CREATE OR REPLACE FUNCTION public.promote_px_box_tx(
  p_box_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.status::text NOT IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Cierre la caja antes de promover.';
  END IF;
  IF coalesce(v_box.rack_location, 'PX_CAPTURA') = 'BODEGA_CENTRAL' THEN
    RETURN jsonb_build_object('box_id', v_box.id, 'already_promoted', true);
  END IF;
  RAISE EXCEPTION 'INVALID_STATE: Use finalizar recepciÃ³n para ingresar a bodega.';
END;
$$;

CREATE OR REPLACE FUNCTION public.void_px_equipment_tx(
  p_reception_id uuid,
  p_box_id uuid,
  p_equipment_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_main_serial text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box public.boxes%ROWTYPE;
  v_eq public.px_reception_equipment%ROWTYPE;
  v_active integer;
  v_declared integer;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepciÃ³n no acepta modificaciones.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND reception_id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF coalesce(v_box.rack_location, 'PX_CAPTURA') = 'ELIMINADO' THEN
    RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.';
  END IF;
  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja estÃ¡ cerrada.';
  END IF;
  IF v_box.locked_by IS NULL OR v_box.lock_expires_at <= now() THEN
    RAISE EXCEPTION 'BOX_NOT_LOCKED: Debe tomar control de la caja antes de eliminar equipos.';
  END IF;
  IF v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Otro operador tiene control de esta caja.';
  END IF;

  SELECT * INTO v_eq
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id
    AND box_id = p_box_id
    AND capture_status = 'active'
    AND (
      (p_equipment_id IS NOT NULL AND id = p_equipment_id)
      OR (
        p_equipment_id IS NULL
        AND p_main_serial IS NOT NULL
        AND upper(main_serial) = upper(trim(p_main_serial))
      )
    )
  ORDER BY captured_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Equipo no encontrado o ya fue eliminado.';
  END IF;

  UPDATE public.px_reception_equipment
  SET capture_status = 'deleted'
  WHERE id = v_eq.id;

  DELETE FROM public.px_reception_serial_lines
  WHERE equipment_id = v_eq.id;

  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);

  UPDATE public.boxes SET
    version = version + 1,
    lock_expires_at = now() + interval '30 minutes'
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    p_reception_id, p_box_id, 'equipment_voided',
    coalesce(p_operator_name, 'Operador') || ' eliminÃ³ ' || v_eq.main_serial,
    p_operator_id, p_operator_name,
    jsonb_build_object('equipment_id', v_eq.id, 'main_serial', v_eq.main_serial)
  );

  RETURN jsonb_build_object(
    'equipment_id', v_eq.id,
    'main_serial', v_eq.main_serial,
    'captured_count', v_active,
    'declared_quantity', v_declared,
    'box_status', v_box.status::text,
    'version', v_box.version
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.delete_px_capture_box_tx(
  p_reception_id uuid,
  p_box_id uuid,
  p_expected_version integer,
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
  v_box public.boxes%ROWTYPE;
  v_eq record;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepciÃ³n no acepta modificaciones.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND reception_id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF coalesce(v_box.rack_location, 'PX_CAPTURA') = 'ELIMINADO' THEN
    RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.';
  END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;
  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: No puede eliminar una caja cerrada.';
  END IF;
  IF v_box.locked_by IS NOT NULL AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Sin lock sobre esta caja.';
  END IF;

  FOR v_eq IN
    SELECT id FROM public.px_reception_equipment
    WHERE box_id = p_box_id AND capture_status = 'active'
  LOOP
    UPDATE public.px_reception_equipment
    SET capture_status = 'deleted'
    WHERE id = v_eq.id;
    DELETE FROM public.px_reception_serial_lines WHERE equipment_id = v_eq.id;
  END LOOP;

  DELETE FROM public.px_reception_lots WHERE box_id = p_box_id;

  UPDATE public.boxes SET
    rack_location = 'ELIMINADO',
    locked_by = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    p_reception_id, p_box_id, 'box_deleted',
    coalesce(p_operator_name, 'Operador') || ' eliminÃ³ ' || v_box.box_code,
    p_operator_id, p_operator_name,
    jsonb_build_object('box_code', v_box.box_code)
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'box_code', v_box.box_code,
    'version', v_box.version
  );
END;
$$;

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
  SELECT upper(so.main_serial), count(*)::integer
  FROM public.service_orders so
  WHERE upper(so.main_serial) IN (
    SELECT upper(e.main_serial)
    FROM public.px_reception_equipment e
    WHERE e.reception_id = p_reception_id AND e.capture_status = 'active'
  )
  GROUP BY upper(so.main_serial);

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

CREATE OR REPLACE FUNCTION public.finalize_px_reception_prep_tx(
  p_reception_id uuid,
  p_expected_version integer,
  p_variance_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
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
  v_variance integer;
  v_is_partial boolean := false;
  v_boxes_updated integer := 0;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object('phase', 'done', 'already_finalized', true, 'status', v_rec.status);
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO') THEN
    RAISE EXCEPTION 'INVALID_STATE: Estado % no permite preparar.', v_rec.status;
  END IF;

  IF upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR')
     AND v_rec.version IS NOT NULL
     AND v_rec.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepciÃ³n fue modificada por otro usuario.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.boxes b
    JOIN public.px_reception_equipment e ON e.box_id = b.id AND e.capture_status = 'active'
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
  ) THEN
    RETURN jsonb_build_object(
      'phase', 'prepared',
      'reception_id', p_reception_id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'boxes_already_in_bodega', true,
      'next', 'Ejecute finalize_px_reception_batch_tx para promover lotes.'
    );
  END IF;

  SELECT count(*)::integer INTO v_total_captured
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_total_captured = 0 THEN
    RAISE EXCEPTION 'RECEPTION_EMPTY: No hay equipos activos.';
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

  FOR v_box IN
    SELECT b.*
    FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
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
        v_boxes_updated := v_boxes_updated + 1;
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
    'boxes_updated', v_boxes_updated,
    'remaining_active', v_total_captured,
    'is_partial', v_is_partial,
    'next', 'Ejecute finalize_px_reception_batch_tx (batch 10-25) hasta phase=done'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_px_reception_prep_one_box_tx(
  p_reception_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
SET lock_timeout = '10s'
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box_id uuid;
  v_new_box_code text;
  v_attempts integer := 0;
  v_remaining integer := 0;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: RecepciÃ³n no encontrada.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object('phase', 'done', 'already_finalized', true);
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO') THEN
    RAISE EXCEPTION 'INVALID_STATE: Estado % no permite preparar.', v_rec.status;
  END IF;

  IF upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR')
     AND v_rec.version IS NOT NULL
     AND v_rec.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepciÃ³n fue modificada por otro usuario.';
  END IF;

  SELECT b.id INTO v_box_id
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    )
  ORDER BY b.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    IF upper(coalesce(v_rec.status, '')) <> 'FINALIZANDO' THEN
      UPDATE public.receptions SET status = 'FINALIZANDO'
      WHERE id = p_reception_id
        AND upper(coalesce(status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR');
    END IF;

    RETURN jsonb_build_object(
      'phase', 'prepared',
      'reception_id', p_reception_id,
      'boxes_remaining', 0,
      'box_code', NULL,
      'next', 'Ejecute finalize_px_reception_batch_tx'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.boxes
    WHERE id = v_box_id AND status::text IN ('cerrada', 'closed')
  ) THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Caja % no estÃ¡ cerrada.', v_box_id;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'BOX_CODE_EXHAUSTED: No se pudo asignar cÃ³digo Ãºnico tras 50 intentos.';
    END IF;

    v_new_box_code := public.next_box_code();
    BEGIN
      UPDATE public.boxes SET
        box_code = v_new_box_code,
        rack_location = 'BODEGA_CENTRAL',
        status = 'closed'::public.box_status,
        capacity = coalesce(declared_quantity, capacity, 0),
        closed_at = now()
      WHERE id = v_box_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  SELECT count(*)::integer INTO v_remaining
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    );

  IF v_remaining = 0 THEN
    UPDATE public.receptions SET status = 'FINALIZANDO'
    WHERE id = p_reception_id
      AND upper(coalesce(status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR');
  END IF;

  RETURN jsonb_build_object(
    'phase', CASE WHEN v_remaining = 0 THEN 'prepared' ELSE 'preparing' END,
    'reception_id', p_reception_id,
    'box_code', v_new_box_code,
    'boxes_remaining', v_remaining,
    'next', CASE WHEN v_remaining = 0 THEN 'Ejecute finalize_px_reception_batch_tx' ELSE 'Ejecute de nuevo prep_one_box' END
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

