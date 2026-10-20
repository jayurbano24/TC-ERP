-- =============================================================================
-- 201b — Reparación puntual: hermanas de TC-03226 que quedaron en bodega
-- tras un traslado parcial de una sola serie a Taller.
-- Seguro / idempotente: solo mueve series aún in_central_warehouse / L3
-- de esa OS. Ajusta el status destino al de la hermana ya en taller.
-- =============================================================================

DO $$
DECLARE
  v_os_id uuid;
  v_target_status text;
  v_moved integer;
BEGIN
  SELECT id INTO v_os_id
  FROM public.service_orders
  WHERE os_label ILIKE 'TC-03226'
  LIMIT 1;

  IF v_os_id IS NULL THEN
    RAISE NOTICE 'TC-03226 no encontrada — nada que reparar.';
    RETURN;
  END IF;

  -- Destino = status de la(s) hermana(s) ya en pipeline de taller
  SELECT s.current_status::text INTO v_target_status
  FROM public.series s
  WHERE s.service_order_id = v_os_id
    AND s.current_status::text IN (
      'in_workshop', 'in_qc', 'in_validation', 'ready_to_dispatch', 'in_control_warehouse'
    )
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_target_status IS NULL THEN
    v_target_status := 'in_workshop';
  END IF;

  UPDATE public.series s
  SET
    current_status = v_target_status::public.series_status,
    current_box_id = NULL,
    updated_at = now()
  WHERE s.service_order_id = v_os_id
    AND s.current_status::text IN ('in_central_warehouse', 'in_control_warehouse');

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RAISE NOTICE 'TC-03226: % serie(s) hermanas movidas a %', v_moved, v_target_status;
END $$;
