-- =============================================================================
-- 117 — Al despachar Outbound: cerrar caja (status closed) + rack DESPACHO
-- Así desaparece de Gestión de Outbound y queda en Historial con Nº Conduce.
-- =============================================================================

-- Cierra cajas ya despachadas que quedaron abiertas
UPDATE public.boxes b
SET
  status = 'closed'::public.box_status,
  rack_location = 'DESPACHO'
WHERE EXISTS (
  SELECT 1 FROM public.dispatches d WHERE d.box_id = b.id
)
AND b.status::text = 'open';

CREATE OR REPLACE FUNCTION public.warehouse_salida_tx(
  p_box_id uuid,
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
  v_dispatch_id uuid;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id ORDER BY created_at), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series.';
  END IF;

  UPDATE public.series
  SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
  WHERE current_box_id = p_box_id;

  UPDATE public.boxes
  SET
    rack_location = 'DESPACHO',
    status = 'closed'::public.box_status,
    last_dispatch_batch_id = p_dispatch_batch_id
  WHERE id = p_box_id;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'single_box'::public.dispatch_type,
    coalesce(nullif(trim(p_guide_number), ''), p_destination),
    p_operator_id,
    p_destination,
    p_dispatch_batch_id,
    p_box_id
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, coalesce(nullif(trim(p_guide_number), ''), p_destination),
    v_series_ids, 'Despacho caja completa', p_idempotency_key
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1),
    'guide_number', coalesce(nullif(trim(p_guide_number), ''), p_destination)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
