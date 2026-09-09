-- PX capture: concurrencia NOWAIT, validaciones fuera del lock de caja,
-- trigger sin re-validación OS costosa, métricas con serial.

ALTER TABLE public.px_capture_metrics
  ADD COLUMN IF NOT EXISTS main_serial text,
  ADD COLUMN IF NOT EXISTS operator_id uuid,
  ADD COLUMN IF NOT EXISTS sqlstate text;

CREATE INDEX IF NOT EXISTS idx_px_capture_metrics_main_serial
  ON public.px_capture_metrics (main_serial)
  WHERE main_serial IS NOT NULL;

-- Guard mínimo: integridad cross-guía sin repetir px_find_open_os_for_serial.
CREATE OR REPLACE FUNCTION public.trg_px_serial_line_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_serial text := upper(trim(NEW.serial_number));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(v_serial, 0));

  IF EXISTS (
    SELECT 1
    FROM public.px_reception_serial_lines sl
    JOIN public.px_reception_equipment e
      ON e.id = sl.equipment_id
     AND e.capture_status = 'active'
    JOIN public.receptions r ON r.id = e.reception_id
    WHERE upper(trim(sl.serial_number)) = v_serial
      AND e.id <> NEW.equipment_id
      AND upper(coalesce(r.status, '')) NOT IN (
        'ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO', 'DEVUELTO'
      )
  ) THEN
    RAISE EXCEPTION
      'DUPLICATE_IN_OTHER_GUIDE: La serie % ya está capturada en otra recepción abierta.',
      v_serial;
  END IF;

  NEW.serial_number := v_serial;
  RETURN NEW;
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
  v_hit record;
  v_open record;
  v_where text;
  v_rejected_count integer;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  v_main := upper(trim(coalesce(p_main_serial, '')));
  IF v_main = '' THEN
    RAISE EXCEPTION 'DUPLICATE_INVALID: Serie principal obligatoria.';
  END IF;

  -- Fase 1: recepción sin lock (no bloquear finalize con FOR SHARE).
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta capturas.';
  END IF;

  -- Pre-check caja sin lock (fallo rápido).
  SELECT * INTO v_box
  FROM public.boxes
  WHERE id = p_box_id AND reception_id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja está cerrada.';
  END IF;
  IF v_box.locked_by IS NULL OR v_box.lock_expires_at <= now() THEN
    RAISE EXCEPTION 'BOX_NOT_LOCKED: Debe tomar control de la caja antes de escanear.';
  END IF;
  IF v_box.locked_by IS DISTINCT FROM p_captured_by THEN
    RAISE EXCEPTION 'BOX_LOCKED: Otro operador tiene control de esta caja.';
  END IF;

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);

  v_serials := ARRAY[v_main];
  IF nullif(trim(coalesce(p_serial_s2, '')), '') IS NOT NULL THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s2)));
  END IF;
  IF nullif(trim(coalesce(p_serial_s3, '')), '') IS NOT NULL THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s3)));
  END IF;
  IF nullif(trim(coalesce(p_serial_s4, '')), '') IS NOT NULL THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s4)));
  END IF;

  IF (SELECT count(DISTINCT s) FROM unnest(v_serials) s) <> array_length(v_serials, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_IN_EQUIPMENT: Series duplicadas en el mismo equipo.';
  END IF;

  SELECT array_agg(sn ORDER BY sn) INTO v_serials
  FROM (SELECT DISTINCT unnest(v_serials) AS sn) normalized;

  -- Fase 2: validaciones costosas SIN lock de caja.
  FOREACH v_sn IN ARRAY v_serials LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_sn, 0));
  END LOOP;

  FOREACH v_sn IN ARRAY v_serials LOOP
    SELECT * INTO v_hit FROM public.px_find_active_serial_capture(v_sn);
    IF FOUND THEN
      v_where := format(
        'guía %s%s caja %s',
        coalesce(nullif(trim(v_hit.guide_number), ''), '(sin guía)'),
        CASE
          WHEN nullif(trim(coalesce(v_hit.sap_document, '')), '') IS NOT NULL
            THEN ' (SAP ' || trim(v_hit.sap_document) || ')'
          ELSE ''
        END,
        coalesce(nullif(trim(v_hit.box_code), ''), '(sin caja)')
      );
      IF v_hit.reception_id = p_reception_id THEN
        RAISE EXCEPTION
          'DUPLICATE_IN_RECEPTION: La serie % ya está en % de ESTA guía. Elimine el duplicado de esa caja antes de continuar.',
          v_sn, v_where;
      END IF;
      RAISE EXCEPTION
        'DUPLICATE_IN_OTHER_GUIDE: La serie % ya está en % (otra recepción abierta). Elimine el duplicado ahí antes de continuar.',
        v_sn, v_where;
    END IF;

    SELECT * INTO v_open FROM public.px_find_open_os_for_serial(v_sn, p_reception_id);
    IF FOUND THEN
      INSERT INTO public.px_rejected_serial_scans (
        serial_number, reception_id, box_id, operator_id, operator_name, workstation,
        error_code, existing_os_id, existing_os_number, existing_os_status, existing_source
      ) VALUES (
        v_sn, p_reception_id, p_box_id, p_captured_by,
        nullif(trim(coalesce(p_operator_name, '')), ''),
        nullif(trim(coalesce(p_workstation, '')), ''),
        'DUPLICATE_OPEN_OS',
        v_open.existing_os_id, v_open.existing_os_number,
        v_open.existing_os_status, v_open.existing_source
      );
      SELECT count(*)::integer INTO v_rejected_count
      FROM public.px_rejected_serial_scans
      WHERE box_id = p_box_id AND error_code = 'DUPLICATE_OPEN_OS';
      RETURN jsonb_build_object(
        'ok', false, 'code', 'DUPLICATE_OPEN_OS', 'error_code', 'DUPLICATE_OPEN_OS',
        'serial', v_sn,
        'existing_os_id', v_open.existing_os_id,
        'existing_os_number', v_open.existing_os_number,
        'existing_os_status', v_open.existing_os_status,
        'existing_source', v_open.existing_source,
        'rejected_count', v_rejected_count,
        'message', 'La serie está duplicada en otra Orden de Servicio abierta.'
      );
    END IF;
  END LOOP;

  -- Fase 3: sección crítica mínima — lock no bloqueante por caja.
  -- Clave 1 (seriales usan 0) evita espera activa; equivalente a FOR UPDATE NOWAIT.
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_box_id::text, 1)) THEN
    RAISE EXCEPTION
      'BOX_BUSY: Hay otra captura en proceso en esta caja. Espere unos segundos e intente nuevamente.';
  END IF;

  SELECT * INTO v_box
  FROM public.boxes
  WHERE id = p_box_id AND reception_id = p_reception_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta capturas.';
  END IF;

  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja está cerrada.';
  END IF;
  IF v_box.locked_by IS NULL OR v_box.lock_expires_at <= now() THEN
    RAISE EXCEPTION 'BOX_NOT_LOCKED: Debe tomar control de la caja antes de escanear.';
  END IF;
  IF v_box.locked_by IS DISTINCT FROM p_captured_by THEN
    RAISE EXCEPTION 'BOX_LOCKED: Otro operador tiene control de esta caja.';
  END IF;

  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';
  IF v_declared > 0 AND v_active >= v_declared THEN
    RAISE EXCEPTION 'BOX_FULL: La caja alcanzó su capacidad (%).', v_declared;
  END IF;

  BEGIN
    INSERT INTO public.px_reception_equipment (
      reception_id, box_id, main_serial, serial_s2, serial_s3, serial_s4,
      brand_id, model_id, material, captured_by, captured_by_name, capture_workstation
    ) VALUES (
      p_reception_id, p_box_id, v_main,
      NULLIF(upper(trim(coalesce(p_serial_s2, ''))), ''),
      NULLIF(upper(trim(coalesce(p_serial_s3, ''))), ''),
      NULLIF(upper(trim(coalesce(p_serial_s4, ''))), ''),
      p_brand_id, p_model_id, NULLIF(trim(coalesce(p_material, '')), ''),
      p_captured_by, NULLIF(trim(coalesce(p_operator_name, '')), ''),
      NULLIF(trim(coalesce(p_workstation, '')), '')
    )
    RETURNING id INTO v_equipment_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION
        'DUPLICATE_IN_RECEPTION: La serie % ya está registrada en esta recepción.',
        v_main;
  END;

  v_slot := 1;
  FOREACH v_sn IN ARRAY ARRAY[
    v_main,
    NULLIF(upper(trim(coalesce(p_serial_s2, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s3, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s4, ''))), '')
  ] LOOP
    IF v_sn IS NOT NULL THEN
      BEGIN
        INSERT INTO public.px_reception_serial_lines (
          equipment_id, reception_id, box_id, serial_number, slot
        ) VALUES (v_equipment_id, p_reception_id, p_box_id, v_sn, v_slot);
      EXCEPTION
        WHEN unique_violation THEN
          RAISE EXCEPTION
            'DUPLICATE_IN_RECEPTION: La serie % ya está registrada en esta recepción.',
            v_sn;
      END;
      v_slot := v_slot + 1;
    END IF;
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
    coalesce(p_operator_name, 'Operador') || ' capturó ' || v_main,
    p_captured_by, p_operator_name,
    jsonb_build_object('equipment_id', v_equipment_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'equipment_id', v_equipment_id,
    'main_serial', v_main,
    'captured_count', v_active,
    'declared_quantity', v_declared,
    'box_status', (SELECT status::text FROM public.boxes WHERE id = p_box_id)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
