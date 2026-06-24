-- C2A-01 / CHG-002: sync sap_transfer_documents → INGRESADO_BODEGA
-- Cuando todas las series del documento SAP están en in_central_warehouse.
-- Idempotente; seguro re-ejecutar si 047 ya aplicó las funciones base.

CREATE OR REPLACE FUNCTION public.warehouse_sync_sap_transfer_ingresado(p_sap_transfer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_in_bodega integer;
BEGIN
  IF p_sap_transfer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.series
  WHERE sap_transfer_id = p_sap_transfer_id;

  IF v_total = 0 THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_in_bodega
  FROM public.series
  WHERE sap_transfer_id = p_sap_transfer_id
    AND current_status::text = 'in_central_warehouse'
    AND current_box_id IS NOT NULL;

  IF v_in_bodega < v_total THEN
    RETURN false;
  END IF;

  UPDATE public.sap_transfer_documents
  SET status = 'INGRESADO_BODEGA',
      updated_at = now()
  WHERE id = p_sap_transfer_id
    AND coalesce(status, '') <> 'INGRESADO_BODEGA';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_sync_sap_for_series(p_series_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sap_id uuid;
  v_synced integer := 0;
BEGIN
  IF p_series_ids IS NULL OR array_length(p_series_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_sap_id IN
    SELECT DISTINCT s.sap_transfer_id
    FROM public.series s
    WHERE s.id = ANY(p_series_ids)
      AND s.sap_transfer_id IS NOT NULL
  LOOP
    IF public.warehouse_sync_sap_transfer_ingresado(v_sap_id) THEN
      v_synced := v_synced + 1;
    END IF;
  END LOOP;

  RETURN v_synced;
END;
$$;

-- Ingreso manual: disparar sync tras marcar series en bodega central
CREATE OR REPLACE FUNCTION public.warehouse_ingreso_tx(
  p_series text[],
  p_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_source_module text DEFAULT 'bodega_manual',
  p_reason text DEFAULT 'Ingreso directo manual',
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_code text;
  v_box_id uuid;
  v_series_ids uuid[] := '{}';
  v_sn text;
  v_s_row record;
BEGIN
  v_box_code := public.next_box_code();
  INSERT INTO public.boxes (box_code, rack_location, status, capacity)
  VALUES (v_box_code, p_location, 'closed'::public.box_status, array_length(p_series, 1))
  RETURNING id INTO v_box_id;

  FOREACH v_sn IN ARRAY p_series LOOP
    SELECT * INTO v_s_row FROM public.series WHERE serial_number = v_sn FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.series (serial_number, current_status, current_box_id)
      VALUES (v_sn, 'in_central_warehouse', v_box_id)
      RETURNING id INTO v_s_row.id;
    ELSE
      IF v_s_row.current_box_id IS NOT NULL THEN
         RAISE EXCEPTION 'DUPLICATE_ASSIGNMENT: Serie % ya está en otra caja', v_sn;
      END IF;
      UPDATE public.series
      SET current_status = 'in_central_warehouse', current_box_id = v_box_id
      WHERE id = v_s_row.id;
    END IF;
    v_series_ids := array_append(v_series_ids, v_s_row.id);
  END LOOP;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', p_source_module, 'bodega_central',
    'EXTERNO', p_location,
    p_operator_id, p_operator_name,
    v_box_id, v_box_code, NULL, NULL,
    v_series_ids, p_reason, p_idempotency_key
  );

  PERFORM public.warehouse_sync_sap_for_series(v_series_ids);

  RETURN jsonb_build_object('box_id', v_box_id, 'box_code', v_box_code, 'series_count', array_length(p_series, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_sync_sap_transfer_ingresado(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_sync_sap_for_series(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_ingreso_tx(text[], text, uuid, text, text, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
