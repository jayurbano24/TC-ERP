-- Fase 2A — accessories-dispatch: lote opcional en salidas (CHG-030)
-- Reutiliza dispatch_batches (mismo lote que equipos).

ALTER TABLE public.accessory_movements
  ADD COLUMN IF NOT EXISTS dispatch_batch_id uuid REFERENCES public.dispatch_batches(id);

ALTER TABLE public.accessory_movements
  ADD COLUMN IF NOT EXISTS dispatch_mode text
    CHECK (dispatch_mode IS NULL OR dispatch_mode IN ('WITH_BATCH', 'WITHOUT_BATCH'));

ALTER TABLE public.accessory_movements
  ADD COLUMN IF NOT EXISTS service_order_id uuid REFERENCES public.service_orders(id);

CREATE INDEX IF NOT EXISTS idx_accessory_movements_batch
  ON public.accessory_movements (dispatch_batch_id, created_at DESC)
  WHERE dispatch_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accessory_movements_dispatch_mode
  ON public.accessory_movements (dispatch_mode, created_at DESC)
  WHERE dispatch_mode IS NOT NULL;

-- Salida OUT con validación de stock y lote opcional
CREATE OR REPLACE FUNCTION public.accessory_dispatch_out_tx(
  p_accessory_id uuid,
  p_condition text,
  p_quantity int,
  p_destination text,
  p_notes text DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_box_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc public.accessories%ROWTYPE;
  v_box public.accessory_boxes%ROWTYPE;
  v_mode text;
  v_movement_id uuid;
  v_clean_total int;
  v_remaining int;
  v_deduct int;
  r_box record;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: Cantidad debe ser mayor a 0.';
  END IF;

  IF p_condition NOT IN ('NEW', 'RECOVERED') THEN
    RAISE EXCEPTION 'INVALID_CONDITION: Use NEW o RECOVERED.';
  END IF;

  IF nullif(trim(p_destination), '') IS NULL THEN
    RAISE EXCEPTION 'DESTINATION_REQUIRED: Destino obligatorio.';
  END IF;

  v_mode := CASE WHEN p_dispatch_batch_id IS NULL THEN 'WITHOUT_BATCH' ELSE 'WITH_BATCH' END;

  IF v_mode = 'WITH_BATCH' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dispatch_batches
      WHERE id = p_dispatch_batch_id AND status = 'ABIERTO'
    ) THEN
      RAISE EXCEPTION 'INVALID_BATCH: Lote no encontrado o no está ABIERTO.';
    END IF;
  END IF;

  SELECT * INTO v_acc FROM public.accessories WHERE id = p_accessory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Accesorio no encontrado.'; END IF;

  IF p_condition = 'NEW' THEN
    IF v_acc.qty_new < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stock nuevo insuficiente (% disponibles).', v_acc.qty_new;
    END IF;
  ELSE
    IF v_acc.qty_recovered < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stock recuperado insuficiente (% disponibles).', v_acc.qty_recovered;
    END IF;

    IF p_box_id IS NOT NULL THEN
      SELECT * INTO v_box FROM public.accessory_boxes WHERE id = p_box_id FOR UPDATE;
      IF NOT FOUND OR v_box.status <> 'Clasificado Y Limpio' THEN
        RAISE EXCEPTION 'INVALID_BOX: Caja no encontrada o no está Limpia.';
      END IF;
      IF v_box.quantity < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_BOX: La caja solo tiene % unidades.', v_box.quantity;
      END IF;
      UPDATE public.accessory_boxes
      SET quantity = quantity - p_quantity, updated_at = now()
      WHERE id = p_box_id;
    ELSE
      SELECT coalesce(sum(quantity), 0) INTO v_clean_total
      FROM public.accessory_boxes
      WHERE accessory_id = p_accessory_id
        AND status = 'Clasificado Y Limpio'
        AND quantity > 0;

      IF v_clean_total < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_CLEAN: Stock LIMPIO insuficiente (% disponibles).', v_clean_total;
      END IF;

      v_remaining := p_quantity;
      FOR r_box IN
        SELECT id, quantity FROM public.accessory_boxes
        WHERE accessory_id = p_accessory_id
          AND status = 'Clasificado Y Limpio'
          AND quantity > 0
        ORDER BY created_at
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_deduct := least(r_box.quantity, v_remaining);
        v_remaining := v_remaining - v_deduct;
        UPDATE public.accessory_boxes
        SET quantity = quantity - v_deduct, updated_at = now()
        WHERE id = r_box.id;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.accessory_movements (
    accessory_id, movement_type, condition, quantity,
    destination, notes, created_by,
    dispatch_batch_id, dispatch_mode
  ) VALUES (
    p_accessory_id, 'OUT', p_condition, p_quantity,
    trim(p_destination), nullif(trim(p_notes), ''), p_operator_id,
    p_dispatch_batch_id, v_mode
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'dispatch_mode', v_mode,
    'dispatch_batch_id', p_dispatch_batch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accessory_dispatch_out_tx(uuid, text, int, text, text, uuid, uuid, uuid) TO authenticated, service_role;
