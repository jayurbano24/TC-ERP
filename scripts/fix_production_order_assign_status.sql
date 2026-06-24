-- Parche: production_order_assign_os_tx — quitar IN_CENTRAL_WAREHOUSE inválido del enum series_status
CREATE OR REPLACE FUNCTION public.production_order_assign_os_tx(
  p_po_id uuid,
  p_service_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po public.production_orders%ROWTYPE;
  v_os public.service_orders%ROWTYPE;
  v_series_status text;
BEGIN
  SELECT * INTO v_po FROM public.production_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: PO no encontrada.'; END IF;
  IF v_po.status NOT IN ('APROBADA', 'EN_PROCESO') THEN
    RAISE EXCEPTION 'INVALID_STATE: PO debe estar APROBADA o EN_PROCESO.';
  END IF;

  SELECT * INTO v_os FROM public.service_orders WHERE id = p_service_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: OS no encontrada.'; END IF;

  IF v_os.production_order_id IS NOT NULL AND v_os.production_order_id <> p_po_id THEN
    RAISE EXCEPTION 'ALREADY_ASSIGNED: La OS ya pertenece a otra PO.';
  END IF;

  SELECT s.current_status::text INTO v_series_status
  FROM public.series s
  WHERE s.service_order_id = p_service_order_id
  ORDER BY s.created_at
  LIMIT 1;

  IF v_series_status IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES: La OS no tiene series.';
  END IF;

  IF v_series_status NOT IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL') THEN
    RAISE EXCEPTION 'INELIGIBLE: El equipo no está en bodega (estado: %).', v_series_status;
  END IF;

  UPDATE public.service_orders
  SET production_order_id = p_po_id
  WHERE id = p_service_order_id;

  IF v_po.status = 'APROBADA' THEN
    UPDATE public.production_orders
    SET status = 'EN_PROCESO', updated_at = timezone('utc', now())
    WHERE id = p_po_id;
  END IF;

  RETURN jsonb_build_object(
    'po_id', p_po_id,
    'service_order_id', p_service_order_id,
    'po_status', CASE WHEN v_po.status = 'APROBADA' THEN 'EN_PROCESO' ELSE v_po.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.production_order_assign_os_tx(uuid, uuid) TO authenticated, service_role;
