-- 133: Guardar operador real al crear caja + backfill assigned_operator_id.

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
  v_operator_name text;
  v_series_ids uuid[] := '{}';
  v_s_id uuid;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'RECEPTION_REQUIRED: Falta recepción de origen.';
  END IF;
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe escanear al menos una serie.';
  END IF;

  BEGIN
    v_operator_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator_id := NULL;
  END;

  SELECT coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Operador')
    INTO v_operator_name
  FROM public.profiles p
  WHERE p.id = v_operator_id;

  IF v_operator_name IS NULL THEN
    v_operator_name := 'Operador';
  END IF;

  IF p_box_code IS NOT NULL AND trim(p_box_code) ~ '^BOX-[0-9]+$' THEN
    BEGIN
      v_box_code := upper(trim(p_box_code));
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location, assigned_operator_id
      ) VALUES (
        p_reception_id, v_box_code, p_brand_id, p_model_id,
        greatest(coalesce(p_capacity, 0), 1), 'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
        v_operator_id
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
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location, assigned_operator_id
      ) VALUES (
        p_reception_id, v_box_code, p_brand_id, p_model_id,
        greatest(coalesce(p_capacity, 0), 1), 'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
        v_operator_id
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
    WHERE upper(serial_number) = v_sn
    RETURNING id INTO v_s_id;
    IF FOUND THEN
      v_linked := v_linked + 1;
      v_series_ids := array_append(v_series_ids, v_s_id);
    END IF;
  END LOOP;

  IF v_linked = 0 THEN
    UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = v_box_id;
    RAISE EXCEPTION 'NO_SERIES_LINKED: Ninguna serie pudo vincularse. Verifique clasificación Backoffice/PX.';
  END IF;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', 'bodega_recepcion', 'bodega_central',
    'EXTERNO', coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
    v_operator_id, v_operator_name,
    v_box_id, v_box_code, p_reception_id, NULL,
    v_series_ids, 'Ingreso consolidado en caja desde CAC/PX', NULL, NULL::jsonb
  );

  PERFORM public.warehouse_sync_sap_for_series(v_series_ids);

  RETURN jsonb_build_object(
    'box_id', v_box_id,
    'box_code', v_box_code,
    'series_linked', v_linked
  );
END;
$$;

-- Backfill: primer movimiento INGRESO con performed_by real
UPDATE public.boxes b
SET assigned_operator_id = m.performed_by
FROM (
  SELECT DISTINCT ON (wm.box_id)
    wm.box_id,
    wm.performed_by
  FROM public.warehouse_movements wm
  WHERE wm.movement_type = 'INGRESO'
    AND wm.performed_by IS NOT NULL
    AND coalesce(wm.performed_by_name, '') NOT ILIKE '%backfill%'
    AND coalesce(wm.performed_by_name, '') NOT ILIKE 'Sistema (%'
  ORDER BY wm.box_id, wm.created_at ASC
) m
WHERE b.id = m.box_id
  AND b.assigned_operator_id IS NULL;

GRANT EXECUTE ON FUNCTION public.create_bodega_box_tx(uuid, uuid, uuid, integer, text, text[], text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
