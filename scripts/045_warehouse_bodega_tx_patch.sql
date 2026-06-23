-- 045_warehouse_bodega_tx_patch.sql
-- Parche para create_bodega_box_tx: Agregar registro en el historial inmutable (warehouse_movements)
-- Ejecutar en SQL Editor para que los ingresos desde PX/CAC aparezcan en la Línea de Tiempo.

CREATE OR REPLACE FUNCTION public.create_bodega_box_tx(
  p_reception_id uuid,
  p_brand_id uuid,
  p_model_id uuid,
  p_capacity integer,
  p_rack_location text DEFAULT 'P-01',
  p_serial_numbers text[] DEFAULT '{}'::text[],
  p_box_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_code text;
  v_box_id uuid;
  v_sn text;
  v_linked integer := 0;
  v_assigned boolean := false;
  v_operator_id uuid;
BEGIN
  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'RECEPTION_REQUIRED: Falta recepción de origen.';
  END IF;
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe escanear al menos una serie.';
  END IF;

  IF p_box_code IS NOT NULL AND trim(p_box_code) ~ '^BOX-[0-9]+$' THEN
    BEGIN
      v_box_code := upper(trim(p_box_code));
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location
      ) VALUES (
        p_reception_id,
        v_box_code,
        p_brand_id,
        p_model_id,
        greatest(coalesce(p_capacity, 0), 1),
        'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01')
      )
      RETURNING id INTO v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      v_assigned := false;
    END;
  END IF;

  WHILE NOT v_assigned LOOP
    v_box_code := public.next_box_code();
    BEGIN
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location
      ) VALUES (
        p_reception_id,
        v_box_code,
        p_brand_id,
        p_model_id,
        greatest(coalesce(p_capacity, 0), 1),
        'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01')
      )
      RETURNING id INTO v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;
    UPDATE public.series SET
      current_box_id = v_box_id,
      current_status = 'in_central_warehouse',
      updated_at = now()
    WHERE upper(serial_number) = v_sn;
    IF FOUND THEN
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  IF v_linked = 0 THEN
    UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = v_box_id;
    RAISE EXCEPTION 'NO_SERIES_LINKED: Ninguna serie pudo vincularse. Verifique clasificación Backoffice/PX.';
  END IF;

  -- NUEVO: Obtener usuario autenticado y registrar movimiento
  BEGIN
    v_operator_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator_id := NULL;
  END;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', 'bodega_recepcion', 'bodega_central',
    'EXTERNO', coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
    v_operator_id, 'Operador (Recepción)',
    v_box_id, v_box_code, NULL, NULL,
    NULL, 'Ingreso consolidado en caja desde CAC/PX', NULL
  );

  RETURN jsonb_build_object(
    'box_id', v_box_id,
    'box_code', v_box_code,
    'series_linked', v_linked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bodega_box_tx(uuid, uuid, uuid, integer, text, text[], text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
