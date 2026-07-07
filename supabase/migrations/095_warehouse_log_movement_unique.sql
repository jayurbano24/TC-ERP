-- 095: Eliminar sobrecarga ambigua de warehouse_log_movement_internal.
-- Migraciones 084 (14 params) y 085/086 (15 params) crearon dos firmas; las llamadas
-- con 14 argumentos fallan con "function ... is not unique" (p. ej. create_bodega_box_tx).

DROP FUNCTION IF EXISTS public.warehouse_log_movement_internal(
  text, text, text, text, text,
  uuid, text, uuid, text, uuid,
  text, uuid[], text, uuid
);

CREATE OR REPLACE FUNCTION public.warehouse_log_movement_internal(
  p_movement_type text,
  p_source_module text,
  p_target_module text,
  p_source_location text,
  p_target_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_box_id uuid,
  p_box_code text,
  p_reception_id uuid,
  p_guide_number text,
  p_series_ids uuid[],
  p_reason text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_rpc_result jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_operator_id uuid := p_operator_id;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_movement_id
    FROM public.warehouse_movements
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_movement_id;
    END IF;
  END IF;

  IF v_operator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_operator_id) THEN
    v_operator_id := NULL;
  END IF;

  BEGIN
    INSERT INTO public.warehouse_movements (
      movement_type, source_module, target_module,
      source_location, target_location,
      performed_by, performed_by_name,
      box_id, box_code, reception_id, guide_number,
      series_ids, series_count, reason, idempotency_key, metadata
    ) VALUES (
      p_movement_type, p_source_module, p_target_module,
      p_source_location, p_target_location,
      v_operator_id, p_operator_name,
      p_box_id, p_box_code, p_reception_id, p_guide_number,
      p_series_ids, coalesce(array_length(p_series_ids, 1), 0),
      p_reason, p_idempotency_key,
      CASE WHEN p_rpc_result IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object('rpc_result', p_rpc_result) END
    )
    RETURNING id INTO v_movement_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id
        FROM public.warehouse_movements
        WHERE idempotency_key = p_idempotency_key
        LIMIT 1;
      END IF;
      IF v_movement_id IS NULL THEN
        RAISE;
      END IF;
  END;

  RETURN v_movement_id;
END;
$$;

-- create_bodega_box_tx: pasar 15º argumento explícito (Finalizar Caja en Gestión de Bodega)
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
  v_series_ids uuid[] := '{}';
  v_s_id uuid;
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
        p_reception_id, v_box_code, p_brand_id, p_model_id,
        greatest(coalesce(p_capacity, 0), 1), 'open',
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
        p_reception_id, v_box_code, p_brand_id, p_model_id,
        greatest(coalesce(p_capacity, 0), 1), 'open',
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

  BEGIN
    v_operator_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator_id := NULL;
  END;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', 'bodega_recepcion', 'bodega_central',
    'EXTERNO', coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
    v_operator_id, 'Operador (Recepción)',
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

GRANT EXECUTE ON FUNCTION public.create_bodega_box_tx(uuid, uuid, uuid, integer, text, text[], text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
