-- 285: Fix warehouse_dispersion_tx after 281
-- 1) DELETE FROM temp table must include WHERE (PostgREST / safe-delete clients)
-- 2) Restore app.box_operational_eliminado bypass before marking box ELIMINADO
--    (closed boxes with series otherwise hit BOX_DELETION_REQUIRES_MANAGER_APPROVAL)

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
  v_movement_id uuid;
  v_audit_count integer;
  v_target_module text := lower(trim(coalesce(p_target_module, 'taller')));
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

  CREATE TEMP TABLE IF NOT EXISTS _dispersion_targets (
    id uuid PRIMARY KEY,
    from_status text
  ) ON COMMIT DROP;

  -- WHERE TRUE: evita error "DELETE requires a WHERE clause" en capas que lo exigen.
  DELETE FROM _dispersion_targets WHERE TRUE;

  INSERT INTO _dispersion_targets (id, from_status)
  SELECT s.id, s.current_status::text
  FROM public.series s
  WHERE s.current_box_id = p_box_id;

  SELECT coalesce(array_agg(id), '{}') INTO v_series_ids FROM _dispersion_targets;
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
  WHERE current_box_id = p_box_id
    AND id IN (SELECT id FROM _dispersion_targets);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> (SELECT count(*)::integer FROM _dispersion_targets) THEN
    RAISE EXCEPTION 'CONFLICT: actualización de series incompleta (% filas)', v_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Bypass trigger de baja gerencial (dispersión ≠ eliminación de caja).
  PERFORM set_config('app.box_operational_eliminado', 'dispersion', true);
  UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = p_box_id;

  v_result := jsonb_build_object(
    'success', true,
    'series_count', v_count,
    'box_code', v_box.box_code
  );

  v_movement_id := public.warehouse_log_movement_internal(
    'DISPERSION_CAJA', 'bodega_central', v_target_module,
    v_box.rack_location, 'TALLER',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    v_series_ids, 'Dispersión a taller', p_idempotency_key, v_result
  );

  INSERT INTO public.erp_audit_logs (
    user_id, user_role, module, table_name, record_id, action, severity, new_values, user_agent
  )
  SELECT
    p_operator_id,
    'bodega',
    'Bodega',
    'series',
    t.id::text,
    'INGRESO A TALLER',
    'INFO'::public.audit_severity,
    jsonb_strip_nulls(jsonb_build_object(
      'fromStatus', t.from_status,
      'nextStatus', 'in_workshop',
      'sourceModule', 'Bodega',
      'targetModule', 'Taller',
      'boxId', v_box.id,
      'boxCode', v_box.box_code,
      'operator_name', p_operator_name,
      'warehouseMovementId', v_movement_id,
      'equipment_complete', true,
      'idempotency_key', p_idempotency_key,
      'atomic_tx', true
    )),
    'rpc/warehouse_dispersion_tx'
  FROM _dispersion_targets t;

  GET DIAGNOSTICS v_audit_count = ROW_COUNT;
  IF v_audit_count <> (SELECT count(*)::integer FROM _dispersion_targets) THEN
    RAISE EXCEPTION 'CONFLICT: auditoría incompleta (% de % series)', v_audit_count, v_count
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) IS
  'Dispersión caja→taller. Bypass operacional ELIMINADO + temp DELETE con WHERE TRUE (285).';
