-- =============================================================================
-- 118 — Al despachar Outbound: sincronizar series hermanas de la OS + bitácora
--
-- Problema: warehouse_salida_tx solo actualizaba series con current_box_id = caja.
-- Series hermanas (MAC / S2–S4 como filas propias) quedaban en in_validation →
-- el buscador / taller mostraban "Control de Calidad" aunque el equipo salió.
-- Además no se escribía erp_audit_logs → la bitácora no mostraba DESPACHADO.
-- =============================================================================

-- Backfill: hermanas de series ya despachadas (caja o dispatch_items)
UPDATE public.series sib
SET
  current_status = 'dispatched',
  current_box_id = NULL,
  updated_at = now()
WHERE sib.service_order_id IS NOT NULL
  AND sib.current_status::text IS DISTINCT FROM 'dispatched'
  AND EXISTS (
    SELECT 1
    FROM public.series main
    WHERE main.service_order_id = sib.service_order_id
      AND main.id <> sib.id
      AND (
        main.current_status::text = 'dispatched'
        OR EXISTS (
          SELECT 1 FROM public.dispatch_items di WHERE di.series_id = main.id
        )
      )
  );

-- Bitácora retroactiva (una entrada por OS ya despachada, sobre la serie principal si existe)
INSERT INTO public.erp_audit_logs (
  user_id,
  user_role,
  module,
  table_name,
  record_id,
  action,
  severity,
  new_values,
  observations
)
SELECT
  d.dispatched_by,
  'bodega',
  'Despacho',
  'series',
  s.id::text,
  'DESPACHADO',
  'INFO'::public.audit_severity,
  jsonb_build_object(
    'status', 'DESPACHADO',
    'current_status', 'dispatched',
    'guide_number', d.guide_number,
    'dispatch_id', d.id,
    'box_id', d.box_id,
    'backfill', '118_warehouse_salida_sync_os_siblings'
  ),
  coalesce('Despacho (backfill) · ' || nullif(trim(d.guide_number), ''), 'Despacho (backfill)')
FROM public.dispatches d
JOIN public.dispatch_items di ON di.dispatch_id = d.id
JOIN public.series s ON s.id = di.series_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.erp_audit_logs a
  WHERE a.table_name = 'series'
    AND a.record_id = s.id::text
    AND a.action IN ('DESPACHADO', 'SALIDA BODEGA')
);

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
  v_sibling_ids uuid[];
  v_all_ids uuid[];
  v_dispatch_id uuid;
  v_guide text;
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

  -- Hermanas de la misma OS (MAC S2–S4 como filas propias, etc.)
  SELECT coalesce(array_agg(DISTINCT sib.id), '{}') INTO v_sibling_ids
  FROM public.series box_s
  JOIN public.series sib
    ON sib.service_order_id IS NOT NULL
   AND sib.service_order_id = box_s.service_order_id
  WHERE box_s.id = ANY (v_series_ids)
    AND NOT (sib.id = ANY (v_series_ids));

  IF v_sibling_ids IS NOT NULL AND array_length(v_sibling_ids, 1) IS NOT NULL THEN
    PERFORM 1 FROM public.series WHERE id = ANY (v_sibling_ids) FOR UPDATE;
  END IF;

  v_all_ids := v_series_ids || coalesce(v_sibling_ids, '{}');
  v_guide := coalesce(nullif(trim(p_guide_number), ''), p_destination);

  UPDATE public.series
  SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
  WHERE id = ANY (v_all_ids);

  UPDATE public.boxes
  SET
    rack_location = 'DESPACHO',
    status = 'closed'::public.box_status,
    last_dispatch_batch_id = p_dispatch_batch_id
  WHERE id = p_box_id;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'single_box'::public.dispatch_type,
    v_guide,
    p_operator_id,
    p_destination,
    p_dispatch_batch_id,
    p_box_id
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  -- Bitácora: una entrada por serie (caja + hermanas) para Consulta / taller
  INSERT INTO public.erp_audit_logs (
    user_id,
    user_role,
    module,
    table_name,
    record_id,
    action,
    severity,
    new_values,
    observations,
    user_agent
  )
  SELECT
    p_operator_id,
    'bodega',
    'Despacho',
    'series',
    s.id::text,
    'DESPACHADO',
    'INFO'::public.audit_severity,
    jsonb_build_object(
      'status', 'DESPACHADO',
      'current_status', 'dispatched',
      'guide_number', v_guide,
      'dispatch_id', v_dispatch_id,
      'box_id', p_box_id,
      'box_code', v_box.box_code,
      'operator_name', p_operator_name,
      'destination', p_destination
    ),
    coalesce('Despacho · ' || v_guide, 'Despacho caja completa'),
    'warehouse_salida_tx'
  FROM public.series s
  WHERE s.id = ANY (v_all_ids);

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, v_guide,
    v_series_ids, 'Despacho caja completa', p_idempotency_key
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1),
    'sibling_count', coalesce(array_length(v_sibling_ids, 1), 0),
    'guide_number', v_guide
  );
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
