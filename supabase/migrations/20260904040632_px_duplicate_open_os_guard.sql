-- =============================================================================
-- PX: bloqueo explícito de series ligadas a otra OS abierta.
--
-- Regla PX:
--   * DESPACHADO / CERRADO permiten reingreso.
--   * Una serie físicamente terminal (salió del sistema) permite reingreso.
--   * Cualquier otra OS de otra recepción bloquea la captura.
--   * El rechazo se audita, pero no crea equipo ni incrementa contadores.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.px_rejected_serial_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text NOT NULL,
  reception_id uuid NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  operator_id uuid NULL,
  operator_name text NULL,
  workstation text NULL,
  error_code text NOT NULL,
  existing_os_id uuid NULL REFERENCES public.service_orders(id) ON DELETE SET NULL,
  existing_os_number text NULL,
  existing_os_status text NULL,
  existing_source text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT px_rejected_serial_scans_error_check
    CHECK (error_code = 'DUPLICATE_OPEN_OS')
);

CREATE INDEX IF NOT EXISTS idx_px_rejected_scans_reception_box
  ON public.px_rejected_serial_scans (reception_id, box_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_px_rejected_scans_existing_os
  ON public.px_rejected_serial_scans (existing_os_id, created_at DESC)
  WHERE existing_os_id IS NOT NULL;

ALTER TABLE public.px_rejected_serial_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.px_rejected_serial_scans FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.px_rejected_serial_scans TO service_role;

-- La tabla de ciclos ya estaba libre de duplicados abiertos al crear esta
-- migración. El índice protege S1-S4, no solo service_orders.main_serial.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_order_serial_cycles_open_serial
  ON public.service_order_serial_cycles (upper(trim(serial_number)))
  WHERE unlinked_at IS NULL;

CREATE OR REPLACE FUNCTION public.px_find_open_os_for_serial(
  p_serial text,
  p_current_reception_id uuid
)
RETURNS TABLE (
  existing_os_id uuid,
  existing_os_number text,
  existing_os_status text,
  existing_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH normalized AS (
    SELECT upper(trim(p_serial)) AS serial
    WHERE public.is_valid_equipment_serial(p_serial)
  ),
  candidates AS (
    SELECT DISTINCT ON (so.id)
      so.id,
      so.os_label,
      so.status,
      so.created_at,
      matched.current_status AS matched_series_status,
      coalesce(
        matched.entry_source,
        r.source::text,
        'unknown'
      ) AS source
    FROM normalized n
    JOIN public.service_orders so
      ON upper(trim(so.main_serial)) = n.serial
      OR EXISTS (
        SELECT 1
        FROM public.series sx
        WHERE sx.service_order_id = so.id
          AND upper(trim(sx.serial_number)) = n.serial
      )
    LEFT JOIN LATERAL (
      SELECT
        s.current_status::text AS current_status,
        s.entry_source::text AS entry_source
      FROM public.series s
      WHERE s.service_order_id = so.id
        AND upper(trim(s.serial_number)) = n.serial
      ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
      LIMIT 1
    ) matched ON true
    LEFT JOIN public.receptions r ON r.id = so.reception_id
    WHERE so.reception_id IS DISTINCT FROM p_current_reception_id
      AND NOT (
        upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
        OR public.series_status_is_terminal(matched.current_status)
      )
    ORDER BY so.id, so.created_at DESC
  )
  SELECT
    c.id,
    c.os_label,
    c.status,
    c.source
  FROM candidates c
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.px_find_open_os_for_serial(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.px_find_open_os_for_serial(text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_serial_for_px(
  p_serial text,
  p_current_reception_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_serial text := upper(trim(coalesce(p_serial, '')));
  v_open record;
BEGIN
  SELECT * INTO v_open
  FROM public.px_find_open_os_for_serial(v_serial, p_current_reception_id);

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DUPLICATE_OPEN_OS',
      'serial', v_serial,
      'existing_os_id', v_open.existing_os_id,
      'existing_os_number', v_open.existing_os_number,
      'existing_os_status', v_open.existing_os_status,
      'existing_source', v_open.existing_source,
      'message', 'La serie está duplicada en otra Orden de Servicio abierta.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'serial', v_serial);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_serial_for_px(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_serial_for_px(text, uuid)
  TO authenticated, service_role;

-- Defensa adicional para escrituras directas sobre serial_lines.
CREATE OR REPLACE FUNCTION public.trg_px_serial_line_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_serial text := upper(trim(NEW.serial_number));
  v_validation jsonb;
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

  v_validation := public.validate_serial_for_px(v_serial, NEW.reception_id);
  IF NOT coalesce((v_validation->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'DUPLICATE_OPEN_OS: %', v_validation::text;
  END IF;

  NEW.serial_number := v_serial;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_px_serial_line_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_px_serial_line_guard
  ON public.px_reception_serial_lines;
CREATE TRIGGER trg_px_serial_line_guard
  BEFORE INSERT OR UPDATE OF serial_number, reception_id, equipment_id
  ON public.px_reception_serial_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_px_serial_line_guard();

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

  -- SHARE permite escaneos paralelos, pero serializa el cambio a FINALIZANDO.
  SELECT * INTO v_rec
  FROM public.receptions
  WHERE id = p_reception_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta capturas.';
  END IF;

  SELECT * INTO v_box
  FROM public.boxes
  WHERE id = p_box_id AND reception_id = p_reception_id
  FOR UPDATE;
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
  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';
  IF v_declared > 0 AND v_active >= v_declared THEN
    RAISE EXCEPTION 'BOX_FULL: La caja alcanzó su capacidad (%).', v_declared;
  END IF;

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

  -- Orden estable: evita deadlocks y cierra validate-then-insert.
  FOREACH v_sn IN ARRAY v_serials LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_sn, 0));
  END LOOP;

  FOREACH v_sn IN ARRAY v_serials LOOP
    SELECT * INTO v_hit
    FROM public.px_find_active_serial_capture(v_sn);

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

    SELECT * INTO v_open
    FROM public.px_find_open_os_for_serial(v_sn, p_reception_id);

    IF FOUND THEN
      INSERT INTO public.px_rejected_serial_scans (
        serial_number,
        reception_id,
        box_id,
        operator_id,
        operator_name,
        workstation,
        error_code,
        existing_os_id,
        existing_os_number,
        existing_os_status,
        existing_source
      ) VALUES (
        v_sn,
        p_reception_id,
        p_box_id,
        p_captured_by,
        nullif(trim(coalesce(p_operator_name, '')), ''),
        nullif(trim(coalesce(p_workstation, '')), ''),
        'DUPLICATE_OPEN_OS',
        v_open.existing_os_id,
        v_open.existing_os_number,
        v_open.existing_os_status,
        v_open.existing_source
      );

      SELECT count(*)::integer INTO v_rejected_count
      FROM public.px_rejected_serial_scans
      WHERE box_id = p_box_id
        AND error_code = 'DUPLICATE_OPEN_OS';

      RETURN jsonb_build_object(
        'ok', false,
        'code', 'DUPLICATE_OPEN_OS',
        'error_code', 'DUPLICATE_OPEN_OS',
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

  v_slot := 1;
  FOREACH v_sn IN ARRAY ARRAY[
    v_main,
    NULLIF(upper(trim(coalesce(p_serial_s2, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s3, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s4, ''))), '')
  ] LOOP
    IF v_sn IS NOT NULL THEN
      INSERT INTO public.px_reception_serial_lines (
        equipment_id, reception_id, box_id, serial_number, slot
      ) VALUES (v_equipment_id, p_reception_id, p_box_id, v_sn, v_slot);
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
  v_rejected integer;
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

  SELECT count(*)::integer INTO v_rejected
  FROM public.px_rejected_serial_scans
  WHERE box_id = p_box_id AND error_code = 'DUPLICATE_OPEN_OS';

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);
  v_reason := trim(coalesce(p_partial_reason, ''));

  IF v_captured = 0 AND v_rejected > 0 THEN
    RAISE EXCEPTION
      'BOX_EMPTY_DUPLICATE_OPEN_OS: No es posible finalizar esta caja. Aceptadas: 0; rechazadas por otra OS abierta: %.',
      v_rejected;
  ELSIF v_captured = 0 THEN
    RAISE EXCEPTION 'BOX_EMPTY: La caja no tiene equipos capturados.';
  END IF;

  IF v_captured < v_declared THEN
    IF v_reason = '' THEN
      RAISE EXCEPTION
        'PARTIAL_REASON_REQUIRED: Capturados % de % — indique motivo de caja parcial o ajuste cantidad.',
        v_captured, v_declared;
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
  ELSE
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
    coalesce(p_operator_name, 'Operador') || ' cerró ' || v_box.box_code
      || ' (' || v_captured || '/' || v_declared || ')',
    p_operator_id, p_operator_name,
    jsonb_build_object(
      'partial', v_box.is_partial_box,
      'reason', v_reason,
      'rejected', v_rejected
    )
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'status', v_box.status,
    'captured_count', v_captured,
    'rejected_count', v_rejected,
    'declared_quantity', v_declared,
    'is_partial_box', v_box.is_partial_box,
    'version', v_box.version
  );
END;
$$;

-- Revalida al pasar a FINALIZANDO/CLASIFICADA y evita ignorar cajas en cero.
CREATE OR REPLACE FUNCTION public.trg_px_reception_finalize_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_box record;
  v_serial text;
  v_validation jsonb;
BEGIN
  IF upper(coalesce(NEW.status, '')) NOT IN ('FINALIZANDO', 'CLASIFICADA')
     OR upper(coalesce(OLD.status, '')) = upper(coalesce(NEW.status, '')) THEN
    RETURN NEW;
  END IF;

  SELECT
    b.id,
    b.box_code,
    coalesce(b.declared_quantity, b.capacity, 0) AS declared,
    count(DISTINCT rejected.id)::integer AS rejected
  INTO v_box
  FROM public.boxes b
  JOIN public.px_rejected_serial_scans rejected
    ON rejected.box_id = b.id
   AND rejected.error_code = 'DUPLICATE_OPEN_OS'
  WHERE b.reception_id = NEW.id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
    AND coalesce(b.declared_quantity, b.capacity, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.px_reception_equipment e
      WHERE e.box_id = b.id
        AND e.capture_status IN ('active', 'promoted')
    )
  GROUP BY b.id, b.box_code, b.declared_quantity, b.capacity
  ORDER BY b.created_at
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'ZERO_ACCEPTED_BOX: No es posible finalizar la recepción. La caja % tiene 0 aceptadas y % rechazadas por otra OS abierta.',
      v_box.box_code, v_box.rejected;
  END IF;

  -- Solo quedan activas antes del primer paso de finalización.
  FOR v_serial IN
    SELECT DISTINCT upper(trim(sl.serial_number))
    FROM public.px_reception_serial_lines sl
    JOIN public.px_reception_equipment e
      ON e.id = sl.equipment_id
     AND e.capture_status = 'active'
    WHERE e.reception_id = NEW.id
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_serial, 0));
    v_validation := public.validate_serial_for_px(v_serial, NEW.id);
    IF NOT coalesce((v_validation->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'DUPLICATE_OPEN_OS: %', v_validation::text;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_px_reception_finalize_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_px_reception_finalize_guard ON public.receptions;
CREATE TRIGGER trg_px_reception_finalize_guard
  BEFORE UPDATE OF status ON public.receptions
  FOR EACH ROW
  WHEN (OLD.source::text = 'px' OR NEW.source::text = 'px')
  EXECUTE FUNCTION public.trg_px_reception_finalize_guard();

-- La captura directa desde Data API deja de ser un bypass. Las RPC SECURITY
-- DEFINER siguen siendo la única superficie de escritura para estos registros.
REVOKE INSERT, UPDATE, DELETE
  ON public.px_reception_equipment, public.px_reception_serial_lines
  FROM anon, authenticated;
GRANT SELECT
  ON public.px_reception_equipment, public.px_reception_serial_lines
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.capture_px_equipment_tx(
  uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_px_box_tx(
  uuid, integer, text, uuid, text, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
