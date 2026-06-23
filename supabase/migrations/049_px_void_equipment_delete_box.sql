-- PX incremental capture: void scanned equipment and delete capture box

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
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta modificaciones.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND reception_id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF coalesce(v_box.rack_location, 'PX_CAPTURA') = 'ELIMINADO' THEN
    RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.';
  END IF;
  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja está cerrada.';
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
    coalesce(p_operator_name, 'Operador') || ' eliminó ' || v_eq.main_serial,
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
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta modificaciones.';
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
    coalesce(p_operator_name, 'Operador') || ' eliminó ' || v_box.box_code,
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

GRANT EXECUTE ON FUNCTION public.void_px_equipment_tx(uuid, uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_px_capture_box_tx(uuid, uuid, integer, uuid, text) TO authenticated, service_role;
