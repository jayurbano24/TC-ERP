-- 084: Evitar FK 23503 en warehouse_movements.performed_by cuando el cliente
-- envía auth.uid() sin fila correspondiente en profiles.

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
  p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_operator_id uuid := p_operator_id;
BEGIN
  IF v_operator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_operator_id) THEN
    v_operator_id := NULL;
  END IF;

  INSERT INTO public.warehouse_movements (
    movement_type, source_module, target_module,
    source_location, target_location,
    performed_by, performed_by_name,
    box_id, box_code, reception_id, guide_number,
    series_ids, series_count, reason, idempotency_key
  ) VALUES (
    p_movement_type, p_source_module, p_target_module,
    p_source_location, p_target_location,
    v_operator_id, p_operator_name,
    p_box_id, p_box_code, p_reception_id, p_guide_number,
    p_series_ids, coalesce(array_length(p_series_ids, 1), 0),
    p_reason, p_idempotency_key
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
