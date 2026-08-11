-- 198: Idempotencia obsoleta en warehouse_dispersion_tx.
-- Tras restaurar una caja (p.ej. BOX-1321 → BODEGA_CENTRAL con series),
-- la clave uuid v5 (box+dispersion+taller) aún apunta al movimiento viejo y
-- la RPC devolvía success sin volver a mover equipos → toast OK + caja en bodega.

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
        -- Caja restockeada: invalidar clave para permitir dispersión real.
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

  IF upper(trim(coalesce(v_box.rack_location, ''))) = 'ELIMINADO' THEN
    -- Rack marcado dispersado pero aún hay series → inconsistencia; permitir re-dispersión.
    NULL;
  END IF;

  UPDATE public.series
  SET current_box_id = NULL, current_status = 'in_workshop', updated_at = now()
  WHERE current_box_id = p_box_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

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

REVOKE ALL ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid)
  TO authenticated, service_role;

-- Limpieza puntual BOX-1321 (y cualquier otra con la misma clave stale + stock).
UPDATE public.warehouse_movements wm
SET
  idempotency_key = NULL,
  notes = trim(both FROM coalesce(notes, '') || ' [idempotency cleared: migration 198]')
WHERE wm.movement_type = 'DISPERSION_CAJA'
  AND wm.idempotency_key IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.series s
    WHERE s.current_box_id = wm.box_id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  );

NOTIFY pgrst, 'reload schema';
