-- 186: Tras salida parcial, capacity SIEMPRE = equipos restantes en bodega.
-- Bug visto: TC-INV-101 sacó 5 de BOX-1142 → quedan 54 series pero capacity 59 → PARCIAL 54/59.
-- Causa: reintento idempotente devolvía rpc_result viejo sin re-sincronizar capacity.
-- Fix: al early-return y al finalizar, alinear capacity con el mismo filtro del listado.

CREATE OR REPLACE FUNCTION public.warehouse_sync_box_capacity(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
  v_remaining_os integer;
  v_new_capacity integer;
BEGIN
  SELECT count(*)::integer,
         count(DISTINCT coalesce(service_order_id, id))::integer
  INTO v_remaining, v_remaining_os
  FROM public.series
  WHERE current_box_id = p_box_id
    AND current_status IN ('in_central_warehouse', 'in_control_warehouse');

  IF coalesce(v_remaining, 0) = 0 THEN
    UPDATE public.boxes
    SET capacity = 0
    WHERE id = p_box_id;
    v_new_capacity := 0;
  ELSE
    v_new_capacity := greatest(coalesce(v_remaining_os, 0), 1);
    UPDATE public.boxes
    SET capacity = v_new_capacity
    WHERE id = p_box_id;
  END IF;

  RETURN jsonb_build_object(
    'equipos_remaining', coalesce(v_remaining_os, 0),
    'series_remaining', coalesce(v_remaining, 0),
    'capacity', v_new_capacity,
    'box_empty', coalesce(v_remaining, 0) = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_sync_box_capacity(uuid) FROM PUBLIC, anon, authenticated;
-- service_role: API post-salida; authenticated: por si se invoca vía RPC de usuario
GRANT EXECUTE ON FUNCTION public.warehouse_sync_box_capacity(uuid) TO authenticated, service_role;

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
  v_seed_ids uuid[] := '{}';
  v_series_ids uuid[] := '{}';
  v_sibling_ids uuid[] := '{}';
  v_dispatch_id uuid;
  v_s_id uuid;
  v_guide text;
  v_prior jsonb;
  v_result jsonb;
  v_cap jsonb;
  v_still_in_box boolean := false;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe indicar al menos una serie.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT wm.metadata->'rpc_result' INTO v_prior
    FROM public.warehouse_movements wm
    WHERE wm.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_prior IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.current_box_id = p_box_id
          AND upper(trim(s.serial_number)) = ANY (
            SELECT upper(trim(x))
            FROM unnest(p_serial_numbers) AS x
            WHERE nullif(trim(x), '') IS NOT NULL
          )
      ) INTO v_still_in_box;

      IF NOT v_still_in_box THEN
        -- Trabajo ya hecho: aún así resincronizar capacity (evita PARCIAL N/vieja)
        PERFORM 1 FROM public.boxes WHERE id = p_box_id FOR UPDATE;
        v_cap := public.warehouse_sync_box_capacity(p_box_id);
        RETURN coalesce(v_prior, '{}'::jsonb) || v_cap || jsonb_build_object(
          'success', true,
          'capacity_resynced', true
        );
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;

    SELECT id INTO v_s_id
    FROM public.series
    WHERE upper(serial_number) = v_sn
      AND current_box_id = p_box_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERIE_NOT_IN_BOX: % no pertenece a la caja %', v_sn, v_box.box_code;
    END IF;

    IF NOT (v_s_id = ANY (v_seed_ids)) THEN
      v_seed_ids := array_append(v_seed_ids, v_s_id);
    END IF;
  END LOOP;

  IF array_length(v_seed_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES_UPDATED: Ninguna serie pudo despacharse.';
  END IF;

  SELECT coalesce(array_agg(DISTINCT s.id), v_seed_ids) INTO v_series_ids
  FROM public.series seed
  JOIN public.series s
    ON s.current_box_id = p_box_id
   AND (
     s.id = seed.id
     OR (
       seed.service_order_id IS NOT NULL
       AND s.service_order_id = seed.service_order_id
     )
   )
  WHERE seed.id = ANY (v_seed_ids);

  SELECT coalesce(array_agg(DISTINCT sib.id), '{}') INTO v_sibling_ids
  FROM public.series box_s
  JOIN public.series sib
    ON sib.service_order_id IS NOT NULL
   AND sib.service_order_id = box_s.service_order_id
   AND sib.id <> box_s.id
  WHERE box_s.id = ANY (v_series_ids)
    AND NOT (sib.id = ANY (v_series_ids));

  IF v_sibling_ids IS NOT NULL AND array_length(v_sibling_ids, 1) IS NOT NULL THEN
    PERFORM 1 FROM public.series WHERE id = ANY (v_sibling_ids) FOR UPDATE;
  END IF;

  v_series_ids := v_series_ids || coalesce(v_sibling_ids, '{}');
  v_guide := coalesce(nullif(trim(p_guide_number), ''), p_destination, '');

  UPDATE public.series
  SET current_status = 'dispatched',
      current_box_id = NULL,
      updated_at = now()
  WHERE id = ANY (v_series_ids);

  SELECT d.id INTO v_dispatch_id
  FROM public.dispatches d
  WHERE trim(d.guide_number) = v_guide
    AND (d.box_id IS NULL OR d.box_id = p_box_id)
  ORDER BY d.dispatched_at DESC NULLS LAST, d.id DESC
  LIMIT 1;

  IF v_dispatch_id IS NULL THEN
    INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
    VALUES (
      'individual'::public.dispatch_type,
      v_guide,
      p_operator_id,
      coalesce(p_notes, p_destination),
      p_dispatch_batch_id,
      p_box_id
    )
    RETURNING id INTO v_dispatch_id;
  END IF;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, x.id, p_box_id
  FROM unnest(v_series_ids) AS x(id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.dispatch_items di
    WHERE di.dispatch_id = v_dispatch_id
      AND di.series_id = x.id
  );

  INSERT INTO public.erp_audit_logs (
    user_id, user_role, module, table_name, record_id, action, severity, new_values, observations, user_agent
  )
  SELECT
    p_operator_id,
    'bodega',
    'Despacho',
    'series',
    s.id::text,
    'DESPACHADO',
    'INFO'::public.audit_severity,
    jsonb_build_object(
      'status', 'DESPACHADO',
      'current_status', 'dispatched',
      'guide_number', v_guide,
      'dispatch_id', v_dispatch_id,
      'box_id', p_box_id,
      'box_code', v_box.box_code,
      'partial', true
    ),
    coalesce('Despacho parcial · ' || v_guide, 'Despacho parcial'),
    'warehouse_salida_parcial_tx'
  FROM public.series s
  WHERE s.id = ANY (v_series_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.erp_audit_logs a
      WHERE a.table_name = 'series'
        AND a.record_id = s.id::text
        AND a.action = 'DESPACHADO'
        AND a.new_values->>'guide_number' = v_guide
    );

  v_cap := public.warehouse_sync_box_capacity(p_box_id);

  IF (v_cap->>'box_empty')::boolean THEN
    UPDATE public.boxes
    SET rack_location = 'DESPACHO',
        last_dispatch_batch_id = coalesce(p_dispatch_batch_id, last_dispatch_batch_id)
    WHERE id = p_box_id;
  ELSE
    UPDATE public.boxes
    SET last_dispatch_batch_id = coalesce(p_dispatch_batch_id, last_dispatch_batch_id)
    WHERE id = p_box_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1)
  ) || v_cap;

  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.warehouse_movements wm WHERE wm.idempotency_key = p_idempotency_key
  ) THEN
    UPDATE public.warehouse_movements
    SET series_ids = v_series_ids,
        series_count = coalesce(array_length(v_series_ids, 1), 0),
        guide_number = nullif(v_guide, ''),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('rpc_result', v_result, 'repaired_stale_idempotency', true),
        reason = 'Despacho parcial por series (OS completo · reintento)'
    WHERE idempotency_key = p_idempotency_key;
  ELSE
    PERFORM public.warehouse_log_movement_internal(
      'SALIDA', 'bodega_central', 'despacho',
      v_box.rack_location, coalesce(nullif(v_guide, ''), 'DESPACHO'),
      p_operator_id, p_operator_name,
      v_box.id, v_box.box_code, v_box.reception_id, nullif(v_guide, ''),
      v_series_ids, 'Despacho parcial por series (OS completo)', p_idempotency_key,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_salida_parcial_tx(uuid, text[], text, text, uuid, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_parcial_tx(uuid, text[], text, text, uuid, text, text, uuid, uuid)
  TO authenticated, service_role;

-- Reparación one-shot: BOX-1142 / TC-INV-100/101 y cajas con capacity ≠ equipos
DO $$
DECLARE
  r record;
  v_cap jsonb;
  v_os integer;
  v_old integer;
BEGIN
  FOR r IN
    WITH targets AS (
      SELECT b.id, b.box_code, b.capacity
      FROM public.boxes b
      WHERE upper(b.box_code) LIKE '%1142%'
      UNION
      SELECT b.id, b.box_code, b.capacity
      FROM public.dispatches d
      JOIN public.boxes b ON b.id = d.box_id
      WHERE trim(d.guide_number) IN ('TC-INV-100', 'TC-INV-101')
      UNION
      SELECT b.id, b.box_code, b.capacity
      FROM public.dispatches d
      JOIN public.dispatch_items di ON di.dispatch_id = d.id
      JOIN public.boxes b ON b.id = di.box_id
      WHERE trim(d.guide_number) IN ('TC-INV-100', 'TC-INV-101')
      UNION
      SELECT b.id, b.box_code, b.capacity
      FROM public.boxes b
      JOIN LATERAL (
        SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer AS equipos
        FROM public.series s
        WHERE s.current_box_id = b.id
          AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
      ) c ON true
      WHERE c.equipos > 0
        AND c.equipos <> coalesce(b.capacity, 0)
        AND coalesce(b.deletion_status, 'active') = 'active'
    )
    SELECT DISTINCT id, box_code, capacity FROM targets
  LOOP
    v_old := r.capacity;
    v_cap := public.warehouse_sync_box_capacity(r.id);
    v_os := coalesce((v_cap->>'equipos_remaining')::integer, 0);
    RAISE NOTICE '186: % capacity % → % (equipos=%)', r.box_code, v_old, v_cap->>'capacity', v_os;
  END LOOP;
END $$;

SELECT
  b.box_code,
  b.capacity,
  (
    SELECT count(DISTINCT coalesce(s.service_order_id, s.id))
    FROM public.series s
    WHERE s.current_box_id = b.id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  ) AS equipos_bodega
FROM public.boxes b
WHERE upper(b.box_code) LIKE '%1142%'
   OR b.id IN (
     SELECT d.box_id FROM public.dispatches d
     WHERE trim(d.guide_number) IN ('TC-INV-100', 'TC-INV-101') AND d.box_id IS NOT NULL
   );

NOTIFY pgrst, 'reload schema';
