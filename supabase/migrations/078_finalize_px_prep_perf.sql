-- 078: Acelerar prep_one_box (índice box_id) y subir timeout a 120s

CREATE INDEX IF NOT EXISTS idx_px_reception_equipment_box_active
  ON public.px_reception_equipment (box_id)
  WHERE capture_status = 'active';

CREATE OR REPLACE FUNCTION public.finalize_px_reception_prep_one_box_tx(
  p_reception_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
SET lock_timeout = '10s'
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box_id uuid;
  v_new_box_code text;
  v_assigned boolean;
  v_remaining integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('prep_px:' || p_reception_id::text)) THEN
    RAISE EXCEPTION 'PREP_IN_PROGRESS: Otra sesión está preparando esta recepción.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object('phase', 'done', 'already_finalized', true);
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO') THEN
    RAISE EXCEPTION 'INVALID_STATE: Estado % no permite preparar.', v_rec.status;
  END IF;

  IF upper(coalesce(v_rec.status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR')
     AND v_rec.version IS NOT NULL
     AND v_rec.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepción fue modificada por otro usuario.';
  END IF;

  SELECT b.id INTO v_box_id
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    )
  ORDER BY b.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    IF upper(coalesce(v_rec.status, '')) <> 'FINALIZANDO' THEN
      UPDATE public.receptions SET status = 'FINALIZANDO'
      WHERE id = p_reception_id
        AND upper(coalesce(status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR');
    END IF;

    RETURN jsonb_build_object(
      'phase', 'prepared',
      'reception_id', p_reception_id,
      'boxes_remaining', 0,
      'box_code', NULL,
      'next', 'Ejecute finalize_px_reception_batch_tx'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.boxes
    WHERE id = v_box_id AND status::text IN ('cerrada', 'closed')
  ) THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Caja % no está cerrada.', v_box_id;
  END IF;

  v_assigned := false;
  WHILE NOT v_assigned LOOP
    v_new_box_code := public.next_box_code();
    BEGIN
      UPDATE public.boxes SET
        box_code = v_new_box_code,
        rack_location = 'BODEGA_CENTRAL',
        status = 'closed'::public.box_status,
        capacity = coalesce(declared_quantity, capacity, 0),
        closed_at = now()
      WHERE id = v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  SELECT count(*)::integer INTO v_remaining
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO', 'BODEGA_CENTRAL')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    );

  IF v_remaining = 0 THEN
    UPDATE public.receptions SET status = 'FINALIZANDO'
    WHERE id = p_reception_id
      AND upper(coalesce(status, '')) IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR');
  END IF;

  RETURN jsonb_build_object(
    'phase', CASE WHEN v_remaining = 0 THEN 'prepared' ELSE 'preparing' END,
    'reception_id', p_reception_id,
    'box_code', v_new_box_code,
    'boxes_remaining', v_remaining,
    'next', CASE WHEN v_remaining = 0 THEN 'Ejecute finalize_px_reception_batch_tx' ELSE 'Ejecute de nuevo prep_one_box' END
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
