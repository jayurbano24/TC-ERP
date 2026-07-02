-- 085: Idempotencia en movimientos de bodega — evita duplicados por doble clic / reintentos.
-- Requiere idempotency_key estable por caja+acción desde el cliente (uuid v5).

CREATE OR REPLACE FUNCTION public.warehouse_log_movement_internal(
  p_movement_type text,
  p_source_module text,
  p_target_module text,
  p_source_location text,
  p_target_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_box_id uuid,
  p_box_code text,
  p_reception_id uuid,
  p_guide_number text,
  p_series_ids uuid[],
  p_reason text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_rpc_result jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_operator_id uuid := p_operator_id;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_movement_id
    FROM public.warehouse_movements
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_movement_id;
    END IF;
  END IF;

  IF v_operator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_operator_id) THEN
    v_operator_id := NULL;
  END IF;

  INSERT INTO public.warehouse_movements (
    movement_type, source_module, target_module,
    source_location, target_location,
    performed_by, performed_by_name,
    box_id, box_code, reception_id, guide_number,
    series_ids, series_count, reason, idempotency_key, metadata
  ) VALUES (
    p_movement_type, p_source_module, p_target_module,
    p_source_location, p_target_location,
    v_operator_id, p_operator_name,
    p_box_id, p_box_code, p_reception_id, p_guide_number,
    p_series_ids, coalesce(array_length(p_series_ids, 1), 0),
    p_reason, p_idempotency_key,
    CASE WHEN p_rpc_result IS NULL THEN '{}'::jsonb
         ELSE jsonb_build_object('rpc_result', p_rpc_result) END
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_movement_id;

  IF v_movement_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_movement_id
    FROM public.warehouse_movements
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
  END IF;

  RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_traslado_tx(
  p_box_id uuid,
  p_target_location text,
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
  v_result jsonb;
  v_prior jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.metadata->'rpc_result' INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF upper(trim(coalesce(v_box.rack_location, ''))) = upper(trim(p_target_location)) THEN
    v_result := jsonb_build_object(
      'success', true,
      'box_code', v_box.box_code,
      'already_done', true
    );
    RETURN v_result;
  END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  UPDATE public.boxes SET rack_location = p_target_location WHERE id = p_box_id;

  v_result := jsonb_build_object(
    'success', true,
    'box_code', v_box.box_code,
    'series_count', coalesce(array_length(v_series_ids, 1), 0)
  );

  PERFORM public.warehouse_log_movement_internal(
    'TRASLADO', 'bodega_central', 'bodega_central',
    v_box.rack_location, p_target_location,
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    v_series_ids, 'Traslado de ubicación', p_idempotency_key, v_result
  );

  RETURN v_result;
END;
$$;

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
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.metadata->'rpc_result' INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
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
    RAISE EXCEPTION 'ALREADY_DISPERSED: La caja ya fue dispersada.';
  END IF;

  UPDATE public.series
  SET current_box_id = NULL, current_status = 'in_workshop'
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

NOTIFY pgrst, 'reload schema';
