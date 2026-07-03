-- 076: Prep PX aislado — mueve cajas a BODEGA_CENTRAL sin promover equipos
-- Ejecutar UNA vez antes de finalize_px_reception_batch_tx (lotes de promoción)

CREATE OR REPLACE FUNCTION public.finalize_px_reception_prep_tx(
  p_reception_id uuid,
  p_expected_version integer,
  p_variance_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box record;
  v_new_box_code text;
  v_assigned boolean;
  v_total_captured integer := 0;
  v_total_expected integer := 0;
  v_variance integer;
  v_is_partial boolean := false;
  v_boxes_updated integer := 0;
BEGIN
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object('phase', 'done', 'already_finalized', true, 'status', v_rec.status);
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO') THEN
    RAISE EXCEPTION 'INVALID_STATE: Estado % no permite preparar.', v_rec.status;
  END IF;

  IF upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR')
     AND v_rec.version IS NOT NULL
     AND v_rec.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepción fue modificada por otro usuario.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.boxes b
    JOIN public.px_reception_equipment e ON e.box_id = b.id AND e.capture_status = 'active'
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
  ) THEN
    RETURN jsonb_build_object(
      'phase', 'prepared',
      'reception_id', p_reception_id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'boxes_already_in_bodega', true,
      'next', 'Ejecute finalize_px_reception_batch_tx para promover lotes.'
    );
  END IF;

  SELECT count(*)::integer INTO v_total_captured
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_total_captured = 0 THEN
    RAISE EXCEPTION 'RECEPTION_EMPTY: No hay equipos activos.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      )
      AND b.status::text NOT IN ('cerrada', 'closed')
  ) THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Debe cerrar todas las cajas con equipos antes de finalizar.';
  END IF;

  SELECT coalesce(sum(coalesce(b.declared_quantity, b.capacity, 0)), 0)::integer INTO v_total_expected
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    );

  v_variance := v_total_expected - v_total_captured;
  IF v_variance > 0 THEN
    v_is_partial := true;
    IF trim(coalesce(p_variance_reason, '')) = '' THEN
      RAISE EXCEPTION 'VARIANCE_REASON_REQUIRED: Faltan % equipos vs declarado — indique motivo.', v_variance;
    END IF;
  END IF;

  FOR v_box IN
    SELECT b.*
    FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      )
    ORDER BY b.created_at
  LOOP
    v_assigned := false;
    WHILE NOT v_assigned LOOP
      v_new_box_code := public.next_box_code();
      BEGIN
        UPDATE public.boxes SET
          box_code = v_new_box_code,
          rack_location = 'BODEGA_CENTRAL',
          status = 'closed'::public.box_status,
          capacity = coalesce(v_box.declared_quantity, v_box.capacity, 0),
          closed_at = now()
        WHERE id = v_box.id;
        v_assigned := true;
        v_boxes_updated := v_boxes_updated + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  UPDATE public.receptions SET
    status = 'FINALIZANDO',
    expected_units = v_total_expected,
    variance_units = CASE WHEN v_variance > 0 THEN v_variance ELSE NULL END,
    variance_reason = CASE WHEN v_variance > 0 THEN trim(p_variance_reason) ELSE NULL END,
    received_by = coalesce(v_rec.received_by, p_operator_id)
  WHERE id = p_reception_id
  RETURNING * INTO v_rec;

  RETURN jsonb_build_object(
    'phase', 'prepared',
    'reception_id', v_rec.id,
    'guide_number', v_rec.guide_number,
    'status', v_rec.status,
    'boxes_updated', v_boxes_updated,
    'remaining_active', v_total_captured,
    'is_partial', v_is_partial,
    'next', 'Ejecute finalize_px_reception_batch_tx (batch 10-25) hasta phase=done'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_px_reception_prep_tx(uuid, integer, text, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
