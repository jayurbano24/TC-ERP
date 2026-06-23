-- Fase 3 Bodega Central: backfill movimientos, RPCs parciales, dispatches, sync SAP (CHG-002)
-- Ejecutar en Supabase SQL Editor después de Fase 2 + fix_warehouse_get_box_history

-- =============================================================================
-- 3A) Backfill INGRESO para cajas ya en bodega (idempotente)
-- =============================================================================
INSERT INTO public.warehouse_movements (
  movement_type,
  source_module,
  target_module,
  source_location,
  target_location,
  performed_by_name,
  box_id,
  box_code,
  reception_id,
  guide_number,
  series_ids,
  series_count,
  reason,
  metadata
)
SELECT
  'INGRESO',
  CASE WHEN r.source = 'px' THEN 'recepcion_px' ELSE 'recepcion_cac' END,
  'bodega_central',
  'EXTERNO',
  coalesce(nullif(trim(b.rack_location), ''), 'BODEGA_CENTRAL'),
  'Sistema (backfill Fase 3)',
  b.id,
  b.box_code,
  b.reception_id,
  r.guide_number,
  coalesce(agg.series_ids, '{}'::uuid[]),
  coalesce(agg.series_count, 0),
  'Ingreso histórico — backfill Fase 3',
  jsonb_build_object('backfill', true, 'sap_document', r.sap_document)
FROM public.boxes b
INNER JOIN public.receptions r ON r.id = b.reception_id
LEFT JOIN LATERAL (
  SELECT
    array_agg(s.id ORDER BY s.created_at) AS series_ids,
    count(*)::integer AS series_count
  FROM public.series s
  WHERE s.current_box_id = b.id
    AND s.current_status::text = 'in_central_warehouse'
) agg ON true
WHERE upper(coalesce(b.rack_location, '')) IN ('BODEGA_CENTRAL')
  AND coalesce(agg.series_count, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.box_id = b.id AND wm.movement_type = 'INGRESO'
  );

-- =============================================================================
-- 3D) CHG-002: sync sap_transfer_documents → INGRESADO_BODEGA
-- =============================================================================
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
    AND current_status::text = 'in_central_warehouse';

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

-- Backfill SAP docs ya completos en bodega
DO $$
DECLARE
  v_sap_id uuid;
  v_n integer := 0;
BEGIN
  FOR v_sap_id IN
    SELECT std.id
    FROM public.sap_transfer_documents std
    WHERE coalesce(std.status, '') IN ('PENDIENTE_INGRESO_BODEGA', '')
      AND EXISTS (SELECT 1 FROM public.series s WHERE s.sap_transfer_id = std.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.series s
        WHERE s.sap_transfer_id = std.id
          AND s.current_status::text <> 'in_central_warehouse'
      )
  LOOP
    IF public.warehouse_sync_sap_transfer_ingresado(v_sap_id) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'SAP docs sincronizados a INGRESADO_BODEGA: %', v_n;
END;
$$;

-- =============================================================================
-- 3B) Salida completa con dispatches + movimiento
-- =============================================================================
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
  v_dispatch_id uuid;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id ORDER BY created_at) INTO v_series_ids
  FROM public.series
  WHERE current_box_id = p_box_id
  FOR UPDATE;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series.';
  END IF;

  UPDATE public.series
  SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
  WHERE current_box_id = p_box_id;

  UPDATE public.boxes SET rack_location = 'DESPACHO' WHERE id = p_box_id;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes)
  VALUES ('single_box'::public.dispatch_type, coalesce(nullif(trim(p_guide_number), ''), p_destination), p_operator_id, p_destination)
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, coalesce(nullif(trim(p_guide_number), ''), p_destination),
    v_series_ids, 'Despacho caja completa', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true, 'dispatch_id', v_dispatch_id, 'series_count', array_length(v_series_ids, 1));
END;
$$;

-- =============================================================================
-- 3B) Salida parcial por series
-- =============================================================================
CREATE OR REPLACE FUNCTION public.warehouse_salida_parcial_tx(
  p_box_id uuid,
  p_serial_numbers text[],
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_sn text;
  v_series_ids uuid[] := '{}';
  v_dispatch_id uuid;
  v_remaining integer;
  v_s_id uuid;
BEGIN
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe indicar al menos una serie.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;

    SELECT id INTO v_s_id
    FROM public.series
    WHERE upper(serial_number) = v_sn AND current_box_id = p_box_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERIE_NOT_IN_BOX: % no pertenece a la caja %', v_sn, v_box.box_code;
    END IF;

    UPDATE public.series
    SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
    WHERE id = v_s_id;

    v_series_ids := array_append(v_series_ids, v_s_id);
  END LOOP;

  IF array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES_UPDATED: Ninguna serie pudo despacharse.';
  END IF;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes)
  VALUES (
    'individual'::public.dispatch_type,
    coalesce(nullif(trim(p_guide_number), ''), p_destination, ''),
    p_operator_id,
    coalesce(p_notes, p_destination)
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, coalesce(nullif(trim(p_guide_number), ''), p_destination, 'DESPACHO'),
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, coalesce(nullif(trim(p_guide_number), ''), p_destination),
    v_series_ids, 'Despacho parcial por series', p_idempotency_key
  );

  SELECT count(*) INTO v_remaining FROM public.series WHERE current_box_id = p_box_id;
  IF v_remaining = 0 THEN
    UPDATE public.boxes SET rack_location = 'DESPACHO' WHERE id = p_box_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'series_count', array_length(v_series_ids, 1),
    'box_empty', v_remaining = 0
  );
END;
$$;

-- =============================================================================
-- 3B) Traslado parcial por series
-- =============================================================================
CREATE OR REPLACE FUNCTION public.warehouse_traslado_parcial_tx(
  p_box_id uuid,
  p_serial_numbers text[],
  p_target_location text,
  p_target_status text,
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
  v_sn text;
  v_series_ids uuid[] := '{}';
  v_remaining integer;
  v_s_id uuid;
BEGIN
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe indicar al menos una serie.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;

    SELECT id INTO v_s_id
    FROM public.series
    WHERE upper(serial_number) = v_sn AND current_box_id = p_box_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERIE_NOT_IN_BOX: % no pertenece a la caja %', v_sn, v_box.box_code;
    END IF;

    UPDATE public.series
    SET current_status = p_target_status::public.series_status,
        current_box_id = NULL,
        updated_at = now()
    WHERE id = v_s_id;

    v_series_ids := array_append(v_series_ids, v_s_id);
  END LOOP;

  IF array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES_UPDATED: Ninguna serie pudo trasladarse.';
  END IF;

  PERFORM public.warehouse_log_movement_internal(
    'TRASLADO', 'bodega_central', 'bodega_central',
    v_box.rack_location, coalesce(nullif(trim(p_target_location), ''), p_target_status),
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, NULL,
    v_series_ids, 'Traslado parcial por series', p_idempotency_key
  );

  PERFORM public.warehouse_sync_sap_for_series(v_series_ids);

  SELECT count(*) INTO v_remaining FROM public.series WHERE current_box_id = p_box_id;
  IF v_remaining = 0 THEN
    UPDATE public.boxes SET rack_location = 'DESPACHO' WHERE id = p_box_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'series_count', array_length(v_series_ids, 1),
    'box_empty', v_remaining = 0
  );
END;
$$;

-- Patch create_bodega_box_tx: sync SAP tras ingreso
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
    v_series_ids, 'Ingreso consolidado en caja desde CAC/PX', NULL
  );

  PERFORM public.warehouse_sync_sap_for_series(v_series_ids);

  RETURN jsonb_build_object(
    'box_id', v_box_id,
    'box_code', v_box_code,
    'series_linked', v_linked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_sync_sap_transfer_ingresado(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_sync_sap_for_series(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_parcial_tx(uuid, text[], text, text, uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_traslado_parcial_tx(uuid, text[], text, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_bodega_box_tx(uuid, uuid, uuid, integer, text, text[], text) TO authenticated, service_role;

-- =============================================================================
-- Verificación
-- =============================================================================
SELECT
  movement_type,
  count(*) AS n
FROM public.warehouse_movements
GROUP BY movement_type
ORDER BY movement_type;

SELECT status, count(*) AS n
FROM public.sap_transfer_documents
GROUP BY status
ORDER BY n DESC;

NOTIFY pgrst, 'reload schema';
