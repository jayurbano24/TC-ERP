-- =============================================================================
-- 106 — RPC authz bodega/despacho + revoke helpers internos (ADR-011 2D)
-- =============================================================================
-- Requiere 104 (app_assert_any_role). Log-only salvo app.enforce_rpc_roles=on.
-- PX *_tx siguen vía service_role en API (roleGuard HTTP); no se reescriben aquí.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.app_assert_bodega()
RETURNS void
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_assert_any_role('admin'::public.app_role, 'supervisor'::public.app_role, 'bodega'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.app_assert_bodega() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_bodega() TO authenticated, service_role;

-- Revocar SOLO helpers internos (no llamados desde browser JWT).
-- Se mantienen EXECUTE a authenticated: next_box_code, upsert_cac_tray_unit_from_os,
-- emit_domain_event (service role en app), etc.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'warehouse_log_movement_internal',
        'px_log_activity',
        'resolve_audit_log_os_id',
        'refresh_service_order_stage_summary',
        'px_next_bodega_box_code',
        'px_next_guide_number',
        'next_production_order_number',
        'next_dispatch_batch_number'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated, anon',
        r.proname,
        r.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '106: revoke %.%(%) → %', 'public', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

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
  v_result jsonb;
  v_prior jsonb;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.metadata->'rpc_result' INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF upper(trim(coalesce(v_box.rack_location, ''))) = upper(trim(p_target_location)) THEN
    v_result := jsonb_build_object(
      'success', true,
      'box_code', v_box.box_code,
      'already_done', true
    );
    RETURN v_result;
  END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  UPDATE public.boxes SET rack_location = p_target_location WHERE id = p_box_id;

  v_result := jsonb_build_object(
    'success', true,
    'box_code', v_box.box_code,
    'series_count', coalesce(array_length(v_series_ids, 1), 0)
  );

  PERFORM public.warehouse_log_movement_internal(
    'TRASLADO', 'bodega_central', 'bodega_central',
    v_box.rack_location, p_target_location,
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    v_series_ids, 'Traslado de ubicaciÃ³n', p_idempotency_key, v_result
  );

  RETURN v_result;
END;
$$;
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
  v_count integer;
  v_result jsonb;
  v_prior jsonb;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.metadata->'rpc_result' INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  v_count := coalesce(array_length(v_series_ids, 1), 0);

  IF v_count = 0 THEN
    SELECT jsonb_build_object(
      'success', true,
      'series_count', wm.series_count,
      'box_code', v_box.box_code,
      'already_done', true
    ) INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.box_id = p_box_id
      AND wm.movement_type = 'DISPERSION_CAJA'
      AND wm.series_count > 0
    ORDER BY wm.created_at DESC
    LIMIT 1;

    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;

    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series para dispersar.';
  END IF;

  IF upper(trim(coalesce(v_box.rack_location, ''))) = 'ELIMINADO' THEN
    RAISE EXCEPTION 'ALREADY_DISPERSED: La caja ya fue dispersada.';
  END IF;

  UPDATE public.series
  SET current_box_id = NULL, current_status = 'in_workshop'
  WHERE current_box_id = p_box_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = p_box_id;

  v_result := jsonb_build_object(
    'success', true,
    'series_count', v_count,
    'box_code', v_box.box_code
  );

  PERFORM public.warehouse_log_movement_internal(
    'DISPERSION_CAJA', 'bodega_central', p_target_module,
    v_box.rack_location, 'TALLER',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    v_series_ids, 'DispersiÃ³n a taller', p_idempotency_key, v_result
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_salida_tx(
  p_box_id uuid,
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL
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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  SELECT coalesce(array_agg(id ORDER BY created_at), '{}') INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series.';
  END IF;

  UPDATE public.series
  SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
  WHERE current_box_id = p_box_id;

  UPDATE public.boxes SET rack_location = 'DESPACHO', last_dispatch_batch_id = p_dispatch_batch_id
  WHERE id = p_box_id;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'single_box'::public.dispatch_type,
    coalesce(nullif(trim(p_guide_number), ''), p_destination),
    p_operator_id,
    p_destination,
    p_dispatch_batch_id,
    p_box_id
  )
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

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1)
  );
END;
$$;

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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
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
         RAISE EXCEPTION 'DUPLICATE_ASSIGNMENT: Serie % ya estÃ¡ en otra caja', v_sn;
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

CREATE OR REPLACE FUNCTION public.warehouse_salida_parcial_tx(
  p_box_id uuid,
  p_serial_numbers text[],
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL
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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
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

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'individual'::public.dispatch_type,
    coalesce(nullif(trim(p_guide_number), ''), p_destination, ''),
    p_operator_id,
    coalesce(p_notes, p_destination),
    p_dispatch_batch_id,
    p_box_id
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
    UPDATE public.boxes
    SET rack_location = 'DESPACHO', last_dispatch_batch_id = coalesce(p_dispatch_batch_id, last_dispatch_batch_id)
    WHERE id = p_box_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1),
    'box_empty', v_remaining = 0
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.dispatch_batch_open_tx(
  p_destination text DEFAULT NULL,
  p_guide_outbound text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'Operador',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  v_number := public.next_dispatch_batch_number();
  INSERT INTO public.dispatch_batches (
    batch_number, status, destination, guide_outbound,
    opened_by, opened_by_name, notes
  ) VALUES (
    v_number, 'ABIERTO', nullif(trim(p_destination), ''), nullif(trim(p_guide_outbound), ''),
    p_operator_id, p_operator_name, p_notes
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('batch_id', v_id, 'batch_number', v_number, 'status', 'ABIERTO');
END;
$$;
CREATE OR REPLACE FUNCTION public.dispatch_batch_close_tx(
  p_batch_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'Operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.dispatch_batches%ROWTYPE;
  v_pending integer;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  SELECT * INTO v_batch FROM public.dispatch_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Lote no encontrado.'; END IF;
  IF v_batch.status <> 'ABIERTO' THEN
    RAISE EXCEPTION 'INVALID_STATE: El lote no estÃ¡ abierto.';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.dispatches d
  INNER JOIN public.boxes b ON b.id = d.box_id
  WHERE d.dispatch_batch_id = p_batch_id
    AND coalesce(b.rack_location, '') <> 'DESPACHO';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'PENDING_BOXES: Hay % caja(s) del lote sin despachar.', v_pending;
  END IF;

  UPDATE public.dispatch_batches
  SET status = 'CERRADO', closed_at = now(), updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'CERRADO');
END;
$$;

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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
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
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');
  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'RECEPTION_REQUIRED: Falta recepciÃ³n de origen.';
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
    RAISE EXCEPTION 'NO_SERIES_LINKED: Ninguna serie pudo vincularse. Verifique clasificaciÃ³n Backoffice/PX.';
  END IF;

  BEGIN
    v_operator_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator_id := NULL;
  END;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', 'bodega_recepcion', 'bodega_central',
    'EXTERNO', coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
    v_operator_id, 'Operador (RecepciÃ³n)',
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


NOTIFY pgrst, 'reload schema';
