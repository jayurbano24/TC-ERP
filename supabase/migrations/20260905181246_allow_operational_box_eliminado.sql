-- =============================================================================
-- La autorización gerencial aplica solo a ELIMINAR cajas, no a transferencias.
--
-- warehouse_dispersion_tx (Diagnóstico / taller) marcaba rack_location = ELIMINADO
-- como “caja vacía fuera de Central”, lo cual activaba el trigger de baja.
-- Las operaciones internas autorizadas setean app.box_operational_eliminado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_boxes_require_deletion_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_request_id uuid;
  v_is_governed boolean;
  v_operational text;
BEGIN
  IF upper(trim(coalesce(NEW.rack_location, ''))) <> 'ELIMINADO'
    OR upper(trim(coalesce(OLD.rack_location, ''))) = 'ELIMINADO'
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_operational := nullif(trim(current_setting('app.box_operational_eliminado', true)), '');
  EXCEPTION WHEN OTHERS THEN
    v_operational := NULL;
  END;

  -- Transferencias, cancelaciones TMP y rollbacks internos no son bajas gerenciales.
  IF v_operational IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_is_governed :=
    lower(coalesce(OLD.status::text, '')) IN ('closed', 'cerrada')
    OR EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.current_box_id = OLD.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.px_reception_equipment pe
      WHERE pe.box_id = OLD.id
        AND pe.capture_status = 'promoted'
    );

  IF NOT v_is_governed THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_request_id := nullif(
      current_setting('app.box_deletion_approved_request_id', true),
      ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_request_id := NULL;
  END;

  IF v_request_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.box_deletion_requests r
    WHERE r.id = v_request_id
      AND r.box_id = OLD.id
      AND r.status = 'approved'
      AND r.reviewed_by = auth.uid()
      AND public.app_is_box_deletion_manager(r.reviewed_by)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BOX_DELETION_REQUIRES_MANAGER_APPROVAL',
      DETAIL = format(
        'La caja %s requiere autorización previa de gurbano@techcommwireless.com.',
        coalesce(OLD.box_code, OLD.id::text)
      ),
      HINT = 'Genere una solicitud y espere su aprobación en el módulo Autorizaciones.';
  END IF;

  NEW.deletion_status := 'eliminated';
  RETURN NEW;
END;
$$;

-- Dispersión a taller: equipos salen a diagnóstico, la caja deja Central.
CREATE OR REPLACE FUNCTION public.warehouse_dispersion_tx(
  p_box_id uuid,
  p_target_module text,
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
  v_series_ids uuid[];
  v_count integer;
  v_result jsonb;
  v_prior jsonb;
  v_prior_movement_id uuid;
  v_stock_on_box integer;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.id, wm.metadata->'rpc_result'
      INTO v_prior_movement_id, v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_prior IS NOT NULL THEN
      SELECT count(*)::integer INTO v_stock_on_box
      FROM public.series s
      WHERE s.current_box_id = p_box_id
        AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

      IF coalesce(v_stock_on_box, 0) > 0 THEN
        UPDATE public.warehouse_movements
        SET
          idempotency_key = NULL,
          notes = trim(both FROM coalesce(notes, '') || ' [idempotency cleared: box restocked]')
        WHERE id = v_prior_movement_id;
        v_prior := NULL;
      ELSE
        RETURN v_prior;
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  v_count := coalesce(array_length(v_series_ids, 1), 0);

  IF v_count = 0 THEN
    SELECT jsonb_build_object(
      'success', true,
      'series_count', wm.series_count,
      'box_code', v_box.box_code,
      'already_done', true
    ) INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.box_id = p_box_id
      AND wm.movement_type = 'DISPERSION_CAJA'
      AND wm.series_count > 0
    ORDER BY wm.created_at DESC
    LIMIT 1;

    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;

    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series para dispersar.';
  END IF;

  UPDATE public.series
  SET current_box_id = NULL, current_status = 'in_workshop', updated_at = now()
  WHERE current_box_id = p_box_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('app.box_operational_eliminado', 'dispersion', true);
  UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = p_box_id;

  v_result := jsonb_build_object(
    'success', true,
    'series_count', v_count,
    'box_code', v_box.box_code
  );

  PERFORM public.warehouse_log_movement_internal(
    'DISPERSION_CAJA', 'bodega_central', p_target_module,
    v_box.rack_location, 'TALLER',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    v_series_ids, 'Dispersión a taller', p_idempotency_key, v_result
  );

  RETURN v_result;
END;
$$;

-- Cancelar pistoleo TMP: no es eliminación gerencial.
CREATE OR REPLACE FUNCTION public.bodega_cancel_scan_tx(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box record;
  v_unlinked integer := 0;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_NOT_FOUND';
  END IF;

  IF upper(coalesce(v_box.rack_location, '')) <> 'EN_PROCESO'
     AND v_box.box_code NOT ILIKE 'TMP-%' THEN
    RAISE EXCEPTION 'NOT_IN_PROGRESS: Solo se pueden cancelar cajas TMP / EN_PROCESO.';
  END IF;

  UPDATE public.series
  SET
    current_box_id = NULL,
    current_status = 'RECEPCIONADO_BODEGA_GENERAL',
    updated_at = now()
  WHERE current_box_id = p_box_id;

  GET DIAGNOSTICS v_unlinked = ROW_COUNT;

  PERFORM set_config('app.box_operational_eliminado', 'scan_cancel', true);
  UPDATE public.boxes
  SET rack_location = 'ELIMINADO'
  WHERE id = p_box_id;

  RETURN jsonb_build_object(
    'box_id', p_box_id,
    'series_unlinked', v_unlinked,
    'cancelled', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bodega_cancel_scan_tx(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bodega_cancel_scan_tx(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.trg_boxes_require_deletion_approval() IS
  'Bloquea ELIMINADO gobernado salvo aprobación gerencial o bypass operacional (dispersión/scan).';

NOTIFY pgrst, 'reload schema';
