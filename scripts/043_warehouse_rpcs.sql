-- 043: RPCs transaccionales de Bodega Central (FASE 2)
-- Implementación del libro de movimientos y funciones atómicas.

-- 1. Helper interno para loguear movimientos (No exponer a clientes externos)
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
  p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
BEGIN
  INSERT INTO public.warehouse_movements (
    movement_type, source_module, target_module,
    source_location, target_location,
    performed_by, performed_by_name,
    box_id, box_code, reception_id, guide_number,
    series_ids, series_count, reason, idempotency_key
  ) VALUES (
    p_movement_type, p_source_module, p_target_module,
    p_source_location, p_target_location,
    p_operator_id, p_operator_name,
    p_box_id, p_box_code, p_reception_id, p_guide_number,
    p_series_ids, coalesce(array_length(p_series_ids, 1), 0),
    p_reason, p_idempotency_key
  ) RETURNING id INTO v_movement_id;
  
  RETURN v_movement_id;
END;
$$;

-- 2. Ingreso (reemplaza logic client / extends create_bodega_box_tx)
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
  -- 1. Crear caja (Caja Única)
  v_box_code := public.next_box_code();
  INSERT INTO public.boxes (box_code, rack_location, status, capacity)
  VALUES (v_box_code, p_location, 'closed'::public.box_status, array_length(p_series, 1))
  RETURNING id INTO v_box_id;

  -- 2. Actualizar series (Serie Única)
  FOREACH v_sn IN ARRAY p_series LOOP
    -- Lock serie
    SELECT * INTO v_s_row FROM public.series WHERE serial_number = v_sn FOR UPDATE;
    IF NOT FOUND THEN
      -- Se podría insertar si no existe, o lanzar error según la lógica del ERP
      INSERT INTO public.series (serial_number, current_status, current_box_id)
      VALUES (v_sn, 'in_central_warehouse', v_box_id)
      RETURNING id INTO v_s_row.id;
    ELSE
      -- Validar que no esté ya en una caja activa
      IF v_s_row.current_box_id IS NOT NULL THEN
         RAISE EXCEPTION 'DUPLICATE_ASSIGNMENT: Serie % ya está en otra caja', v_sn;
      END IF;
      UPDATE public.series 
      SET current_status = 'in_central_warehouse', current_box_id = v_box_id
      WHERE id = v_s_row.id;
    END IF;
    
    v_series_ids := array_append(v_series_ids, v_s_row.id);
  END LOOP;

  -- 3. Log de auditoría
  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', p_source_module, 'bodega_central',
    'EXTERNO', p_location,
    p_operator_id, p_operator_name,
    v_box_id, v_box_code, NULL, NULL,
    v_series_ids, p_reason, p_idempotency_key
  );

  RETURN jsonb_build_object('box_id', v_box_id, 'box_code', v_box_code, 'series_count', array_length(p_series, 1));
END;
$$;

-- 3. Salida (Despacho)
CREATE OR REPLACE FUNCTION public.warehouse_salida_tx(
  p_box_id uuid,
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
BEGIN
  -- Lock caja
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  -- Lock y obtener series
  SELECT array_agg(id) INTO v_series_ids FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  
  -- Actualizar estado de caja
  UPDATE public.boxes SET rack_location = 'DESPACHO' WHERE id = p_box_id;
  
  -- Actualizar estado de series
  UPDATE public.series SET current_status = 'dispatched' WHERE current_box_id = p_box_id;

  -- Registrar en dispatch (asumiendo lógica básica)
  -- INSERT INTO dispatches ...
  
  -- Auditoría
  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, p_guide_number,
    coalesce(v_series_ids, '{}'), 'Despacho cliente', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Traslado (Cambio de área sin perder estructura de caja)
CREATE OR REPLACE FUNCTION public.warehouse_traslado_tx(
  p_box_id uuid,
  p_target_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id) INTO v_series_ids FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;

  UPDATE public.boxes SET rack_location = p_target_location WHERE id = p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'TRASLADO', 'bodega_central', 'bodega_central',
    v_box.rack_location, p_target_location,
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    coalesce(v_series_ids, '{}'), 'Traslado de ubicación', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Dispersión (Llegada a taller, caja deja de existir como unidad)
CREATE OR REPLACE FUNCTION public.warehouse_dispersion_tx(
  p_box_id uuid,
  p_target_module text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id) INTO v_series_ids FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;

  -- 1. Desvincular series de la caja
  UPDATE public.series 
  SET current_box_id = NULL, current_status = 'in_workshop' 
  WHERE current_box_id = p_box_id;

  -- 2. Marcar caja como ELIMINADA operativa
  UPDATE public.boxes 
  SET rack_location = 'ELIMINADO' -- O status = 'dispersed' si lo definieron en su enum
  WHERE id = p_box_id;

  -- 3. Auditoría
  PERFORM public.warehouse_log_movement_internal(
    'DISPERSION_CAJA', 'bodega_central', p_target_module,
    v_box.rack_location, 'TALLER',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    coalesce(v_series_ids, '{}'), 'Dispersión a taller', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true, 'series_count', array_length(v_series_ids, 1));
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.warehouse_ingreso_tx(text[], text, uuid, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_traslado_tx(uuid, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
