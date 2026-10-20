-- =============================================================================
-- 274 — compensatoria idempotente (42723 / dual overload / permisos escritor interno)
-- classify-equipment-identity-final-v1
--
-- Posiciones S2–S4: `all_series` es un conjunto (sin slot en `series`).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_serial(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN valor IS NULL THEN ''
    ELSE upper(
      regexp_replace(
        regexp_replace(trim(valor), E'[\\r\\n\\t]+', '', 'g'),
        E'\\s+',
        '',
        'g'
      )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_equipment_serial(p_serial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT public.normalize_serial(p_serial);
$$;

CREATE OR REPLACE FUNCTION public.series_active_service_order(p_serial text)
RETURNS TABLE (
  service_order_id uuid,
  os_label text,
  status text,
  series_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sn AS (
    SELECT public.normalize_equipment_serial(p_serial) AS serial
    WHERE public.is_valid_equipment_serial(p_serial)
  )
  SELECT
    so.id,
    so.os_label,
    so.status,
    s.current_status::text
  FROM sn
  JOIN public.series s ON public.normalize_equipment_serial(s.serial_number) = sn.serial
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE NOT public.service_order_status_is_closed(so.status)
    AND NOT public.series_status_is_terminal(s.current_status::text)

  UNION ALL

  SELECT
    so.id,
    so.os_label,
    so.status,
    NULL::text
  FROM sn
  JOIN public.service_orders so
    ON public.normalize_equipment_serial(so.main_serial) = sn.serial
  WHERE NOT public.service_order_status_is_closed(so.status)
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.classify_equipment_batch_tx(uuid, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS public.classify_equipment_batch_tx_validated_write(uuid, uuid, jsonb, text, text);


CREATE OR REPLACE FUNCTION public.classify_equipment_batch_tx_validated_write(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300s'
AS $$
DECLARE
  v_sap public.sap_transfer_documents%ROWTYPE;
  v_unit jsonb;
  v_main_serial text;
  v_main_key text;
  v_model_id uuid;
  v_brand_id uuid;
  v_material text;
  v_reentry_count integer;
  v_os_id uuid;
  v_os_rec public.service_orders%ROWTYPE;
  v_sn text;
  v_series_id uuid;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_service_orders jsonb := '[]'::jsonb;
  v_series_ids jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_correlation text;
  v_all_serials text[];
  v_sorted_serials text[];
  v_active record;
  v_seen_main text[] := ARRAY[]::text[];
  v_serial_owners jsonb := '{}'::jsonb;
  v_reuse boolean;
  v_unit_skip boolean;
  v_existing_os uuid;
  v_existing_main text;
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_correlation := coalesce(nullif(trim(p_correlation_id), ''), p_reception_id::text);

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  SELECT * INTO v_sap
  FROM public.sap_transfer_documents
  WHERE id = p_sap_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento SAP no encontrado.';
  END IF;

  IF v_sap.reception_id <> p_reception_id THEN
    RAISE EXCEPTION 'El documento SAP no pertenece a la recepción indicada.';
  END IF;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_unit_skip := false;
    v_main_serial := trim(COALESCE(v_unit->>'main_serial', ''));
    IF v_main_serial = '' OR NOT public.is_valid_equipment_serial(v_main_serial) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'code', 'INVALID_MAIN_SERIAL',
        'error', 'Serie principal inválida.'
      );
      CONTINUE;
    END IF;

    v_main_key := public.normalize_equipment_serial(v_main_serial);

    IF v_main_key = ANY (v_seen_main) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'code', 'BATCH_DUPLICATE_MAIN',
        'error', format(
          'Serie duplicada: %s está repetida en este mismo lote. Quite el duplicado e intente de nuevo.',
          v_main_serial
        )
      );
      CONTINUE;
    END IF;
    v_seen_main := array_append(v_seen_main, v_main_key);

    PERFORM pg_advisory_xact_lock(hashtext('classify_identity:' || v_main_key));

    SELECT COALESCE(
      array_agg(DISTINCT public.normalize_equipment_serial(x)) FILTER (WHERE public.is_valid_equipment_serial(x)),
      ARRAY[v_main_key]
    )
    INTO v_all_serials
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array'
          THEN v_unit->'all_series'
        ELSE jsonb_build_array(v_main_serial)
      END
    ) AS t(x);

    IF NOT (v_main_key = ANY (v_all_serials)) THEN
      v_all_serials := array_append(v_all_serials, v_main_key);
    END IF;

    -- Anti-duplicado cruzado en lote (cualquier S1–S4)
    FOREACH v_sn IN ARRAY v_all_serials
    LOOP
      IF v_serial_owners ? v_sn THEN
        IF (v_serial_owners->>v_sn) IS DISTINCT FROM v_main_key THEN
          v_skipped := v_skipped + 1;
          v_errors := v_errors || jsonb_build_object(
            'main_serial', v_main_serial,
            'serial', v_sn,
            'code', 'BATCH_SERIAL_CROSS_EQUIPMENT',
            'error', format(
              'La serie %s ya fue reclamada por otro equipo en este mismo lote (S1 %s).',
              v_sn,
              v_serial_owners->>v_sn
            )
          );
          v_unit_skip := true;
          EXIT;
        END IF;
      ELSE
        v_serial_owners := v_serial_owners || jsonb_build_object(v_sn, v_main_key);
      END IF;
    END LOOP;

    IF v_unit_skip THEN
      CONTINUE;
    END IF;

    SELECT array_agg(x ORDER BY x)
    INTO v_sorted_serials
    FROM unnest(v_all_serials) AS t(x);

    FOREACH v_sn IN ARRAY v_sorted_serials
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('classify_identity:' || v_sn));
    END LOOP;

    v_reuse := false;
    v_os_id := NULL;

    -- Idempotencia: solo por S1 (main_serial) con mismo recepción Y mismo SAP
    SELECT * INTO v_active
    FROM public.series_active_service_order(v_main_key)
    LIMIT 1;

    IF FOUND AND v_active.service_order_id IS NOT NULL THEN
      SELECT * INTO v_os_rec
      FROM public.service_orders
      WHERE id = v_active.service_order_id;

      IF public.normalize_equipment_serial(v_os_rec.main_serial) = v_main_key
         AND v_os_rec.sap_transfer_id IS NOT DISTINCT FROM p_sap_transfer_id
         AND v_os_rec.reception_id IS NOT DISTINCT FROM p_reception_id THEN
        v_reuse := true;
        v_os_id := v_os_rec.id;
      ELSE
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'main_serial', v_main_serial,
          'active_os', v_active.os_label,
          'active_status', v_active.status,
          'code', 'ACTIVE_OS_CONTEXT_MISMATCH',
          'error', format(
            'Serie duplicada: %s ya está registrada con la orden %s (estado %s). No se puede ingresar de nuevo hasta cerrar o despachar ese ciclo.',
            v_main_serial,
            coalesce(v_active.os_label, v_active.service_order_id::text),
            v_active.status
          )
        );
        CONTINUE;
      END IF;
    END IF;

    -- Series secundarias (o cualquier slot) en OS activa de otro equipo
    IF NOT v_reuse THEN
      FOREACH v_sn IN ARRAY v_all_serials
      LOOP
        SELECT * INTO v_active
        FROM public.series_active_service_order(v_sn)
        LIMIT 1;

        IF FOUND AND v_active.service_order_id IS NOT NULL THEN
          SELECT * INTO v_os_rec
          FROM public.service_orders
          WHERE id = v_active.service_order_id;

          IF public.normalize_equipment_serial(v_os_rec.main_serial) IS DISTINCT FROM v_main_key THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object(
              'main_serial', v_main_serial,
              'serial', v_sn,
              'active_os', v_active.os_label,
              'active_status', v_active.status,
              'code', 'SERIAL_OWNED_BY_OTHER_EQUIPMENT',
              'error', format(
                'La serie %s ya pertenece al equipo %s (orden %s). No se puede fusionar con %s.',
                v_sn,
                v_os_rec.main_serial,
                coalesce(v_active.os_label, v_active.service_order_id::text),
                v_main_serial
              )
            );
            v_unit_skip := true;
            EXIT;
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF v_unit_skip THEN
      CONTINUE;
    END IF;

    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    IF NOT v_reuse THEN
      UPDATE public.service_orders so
      SET status = 'DESPACHADO',
          closed_at = coalesce(so.closed_at, now())
      WHERE public.normalize_equipment_serial(so.main_serial) = v_main_key
        AND NOT public.service_order_status_is_closed(so.status)
        AND EXISTS (
          SELECT 1
          FROM public.series s
          WHERE public.normalize_equipment_serial(s.serial_number) = ANY (v_all_serials)
            AND public.series_status_is_terminal(s.current_status::text)
        );

      v_reentry_count := public.next_equipment_reentry_count(v_all_serials);

      BEGIN
        INSERT INTO public.service_orders (
          reception_id,
          reception_guide_id,
          sap_transfer_id,
          model_id,
          brand_id,
          main_serial,
          reentry_count,
          status
        ) VALUES (
          p_reception_id,
          v_sap.reception_guide_id,
          p_sap_transfer_id,
          v_model_id,
          v_brand_id,
          v_main_serial,
          v_reentry_count,
          'INGRESADO'
        )
        RETURNING * INTO v_os_rec;

        v_os_id := v_os_rec.id;
      EXCEPTION
        WHEN unique_violation THEN
          SELECT * INTO v_os_rec
          FROM public.service_orders so
          WHERE public.normalize_equipment_serial(so.main_serial) = v_main_key
            AND NOT public.service_order_status_is_closed(so.status)
          ORDER BY so.created_at DESC
          LIMIT 1;

          IF FOUND
             AND v_os_rec.sap_transfer_id IS NOT DISTINCT FROM p_sap_transfer_id
             AND v_os_rec.reception_id IS NOT DISTINCT FROM p_reception_id THEN
            v_reuse := true;
            v_os_id := v_os_rec.id;
          ELSE
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object(
              'main_serial', v_main_serial,
              'active_os', v_os_rec.os_label,
              'active_status', v_os_rec.status,
              'code', 'ACTIVE_MAIN_SERIAL_RACE',
              'error', format(
                'Serie duplicada: %s ya está registrada con la orden %s (estado %s). No se puede ingresar de nuevo hasta cerrar o despachar ese ciclo.',
                v_main_serial,
                coalesce(v_os_rec.os_label, v_os_rec.id::text),
                coalesce(v_os_rec.status, '?')
              )
            );
            CONTINUE;
          END IF;
      END;
    END IF;

    FOREACH v_sn IN ARRAY v_all_serials
    LOOP
      BEGIN
        SELECT s.service_order_id, public.normalize_equipment_serial(so.main_serial)
        INTO v_existing_os, v_existing_main
        FROM public.series s
        JOIN public.service_orders so ON so.id = s.service_order_id
        WHERE public.normalize_equipment_serial(s.serial_number) = v_sn
          AND NOT public.service_order_status_is_closed(so.status)
          AND NOT public.series_status_is_terminal(s.current_status::text)
        LIMIT 1;

        IF FOUND
           AND v_existing_os IS NOT NULL
           AND v_existing_os IS DISTINCT FROM v_os_id
           AND v_existing_main IS DISTINCT FROM v_main_key THEN
          RAISE EXCEPTION
            'La serie % ya posee una Orden de Servicio activa de otro equipo.',
            v_sn
            USING ERRCODE = 'check_violation';
        END IF;

        INSERT INTO public.series (
          serial_number,
          current_reception_id,
          service_order_id,
          sap_transfer_id,
          current_status,
          model_id,
          brand_id,
          material,
          updated_at
        ) VALUES (
          v_sn,
          p_reception_id,
          v_os_id,
          p_sap_transfer_id,
          'RECEPCIONADO_BODEGA_GENERAL',
          v_model_id,
          v_brand_id,
          v_material,
          now()
        )
        ON CONFLICT (serial_number) DO UPDATE SET
          current_reception_id = EXCLUDED.current_reception_id,
          service_order_id = EXCLUDED.service_order_id,
          sap_transfer_id = EXCLUDED.sap_transfer_id,
          current_status = EXCLUDED.current_status,
          model_id = EXCLUDED.model_id,
          brand_id = EXCLUDED.brand_id,
          material = COALESCE(EXCLUDED.material, public.series.material),
          updated_at = now()
        WHERE
          public.series.service_order_id IS NULL
          OR public.series.service_order_id = EXCLUDED.service_order_id
          OR public.service_order_status_is_closed((
               SELECT so2.status FROM public.service_orders so2
               WHERE so2.id = public.series.service_order_id
             ))
          OR public.series_status_is_terminal(public.series.current_status::text)
        RETURNING id INTO v_series_id;

        IF v_series_id IS NOT NULL THEN
          v_series_ids := v_series_ids || to_jsonb(v_series_id);
        ELSE
          RAISE EXCEPTION
            'La serie % ya posee una Orden de Servicio activa.',
            v_sn
            USING ERRCODE = 'check_violation';
        END IF;
      EXCEPTION
        WHEN check_violation THEN
          IF NOT v_reuse THEN
            DELETE FROM public.service_orders WHERE id = v_os_id;
          END IF;
          v_skipped := v_skipped + 1;
          v_errors := v_errors || jsonb_build_object(
            'main_serial', v_main_serial,
            'serial', v_sn,
            'code', 'SERIAL_ACTIVE_CONFLICT',
            'error', SQLERRM
          );
          v_os_id := NULL;
          EXIT;
      END;
    END LOOP;

    IF v_os_id IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id, p_registered_by);

    IF NOT v_reuse AND to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
      PERFORM public.emit_domain_event(
        'equipment.classified',
        'service_order',
        v_os_id::text,
        jsonb_build_object(
          'receptionId', p_reception_id,
          'sapTransferId', p_sap_transfer_id,
          'mainSerial', v_main_serial,
          'reentryCount', v_reentry_count,
          'registeredBy', p_registered_by
        ),
        v_correlation,
        'cac',
        p_registered_by
      );
    END IF;

    SELECT * INTO v_os_rec FROM public.service_orders WHERE id = v_os_id;
    v_service_orders := v_service_orders || row_to_json(v_os_rec)::jsonb;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar. %',
      CASE WHEN jsonb_array_length(v_errors) > 0
        THEN coalesce(v_errors->0->>'error', 'Validación fallida.')
        ELSE 'Lote vacío o series inválidas.'
      END;
  END IF;

  RETURN jsonb_build_object(
    'service_orders', v_service_orders,
    'series_ids', v_series_ids,
    'registered_by', p_registered_by,
    'correlation_id', v_correlation,
    'units_processed', v_processed,
    'units_skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.classify_equipment_batch_tx_validated_write(uuid, uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


CREATE OR REPLACE FUNCTION public.classify_equipment_batch_tx(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300s'
AS $$
DECLARE
  v_unit jsonb;
  v_main text;
  v_main_key text;
  v_serials text[];
  v_lock_serial text;
  v_all_locks text[] := ARRAY[]::text[];
  v_claims jsonb := '{}'::jsonb;
  v_seen_main text[] := ARRAY[]::text[];
  v_valid_units jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_skipped integer := 0;
  v_skip boolean;
  v_conflict_serial text;
  v_active record;
  v_active_order public.service_orders%ROWTYPE;
  v_existing_serials text[];
  v_result jsonb;
BEGIN
  -- classify-equipment-identity-final-v1 (public preflight face)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  -- Acquire every identity lock before reading existing ownership. Sorting the
  -- union prevents crossed S1/S2 batches from deadlocking in opposite order.
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_main_key := public.normalize_equipment_serial(coalesce(v_unit->>'main_serial', ''));
    SELECT coalesce(array_agg(DISTINCT public.normalize_equipment_serial(x)), ARRAY[]::text[])
      INTO v_serials
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array'
          THEN v_unit->'all_series'
        ELSE jsonb_build_array(v_main_key)
      END
    ) AS t(x)
    WHERE public.is_valid_equipment_serial(x);

    IF public.is_valid_equipment_serial(v_main_key) AND NOT (v_main_key = ANY(v_serials)) THEN
      v_serials := array_append(v_serials, v_main_key);
    END IF;
    v_all_locks := v_all_locks || v_serials;
  END LOOP;

  FOR v_lock_serial IN
    SELECT DISTINCT sn FROM unnest(v_all_locks) AS t(sn) ORDER BY sn
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('classify_identity:' || v_lock_serial));
  END LOOP;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_skip := false;
    v_conflict_serial := NULL;
    v_main := trim(coalesce(v_unit->>'main_serial', ''));
    v_main_key := public.normalize_equipment_serial(v_main);

    IF v_main = '' OR NOT public.is_valid_equipment_serial(v_main) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'code', 'INVALID_MAIN_SERIAL',
        'main_serial', v_main,
        'error', 'Serie principal inválida.'
      );
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg(DISTINCT public.normalize_equipment_serial(x) ORDER BY public.normalize_equipment_serial(x)), ARRAY[]::text[])
      INTO v_serials
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array'
          THEN v_unit->'all_series'
        ELSE jsonb_build_array(v_main)
      END
    ) AS t(x)
    WHERE public.is_valid_equipment_serial(x);

    IF NOT (v_main_key = ANY(v_serials)) THEN
      SELECT array_agg(sn ORDER BY sn) INTO v_serials
      FROM unnest(array_append(v_serials, v_main_key)) AS t(sn);
    END IF;

    IF v_main_key = ANY(v_seen_main) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'code', 'BATCH_DUPLICATE_MAIN',
        'main_serial', v_main,
        'error', format('Serie duplicada: %s está repetida en este mismo lote.', v_main)
      );
      CONTINUE;
    END IF;
    v_seen_main := array_append(v_seen_main, v_main_key);

    FOREACH v_lock_serial IN ARRAY v_serials
    LOOP
      IF v_claims ? v_lock_serial AND (v_claims->>v_lock_serial) IS DISTINCT FROM v_main_key THEN
        v_conflict_serial := v_lock_serial;
        v_skip := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_skip THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'code', 'BATCH_SERIAL_CROSS_EQUIPMENT',
        'main_serial', v_main,
        'serial', v_conflict_serial,
        'error', format('La serie %s ya fue reclamada por otro equipo en este mismo lote.', v_conflict_serial)
      );
      CONTINUE;
    END IF;

    FOREACH v_lock_serial IN ARRAY v_serials
    LOOP
      v_claims := v_claims || jsonb_build_object(v_lock_serial, v_main_key);
    END LOOP;

    SELECT * INTO v_active
    FROM public.series_active_service_order(v_main_key)
    LIMIT 1;

    IF FOUND AND v_active.service_order_id IS NOT NULL THEN
      SELECT * INTO v_active_order
      FROM public.service_orders
      WHERE id = v_active.service_order_id;

      SELECT coalesce(array_agg(DISTINCT public.normalize_equipment_serial(s.serial_number) ORDER BY public.normalize_equipment_serial(s.serial_number)), ARRAY[]::text[])
        INTO v_existing_serials
      FROM public.series s
      WHERE s.service_order_id = v_active_order.id
        AND public.is_valid_equipment_serial(s.serial_number);

      IF public.normalize_equipment_serial(v_active_order.main_serial) IS DISTINCT FROM v_main_key
         OR v_active_order.reception_id IS DISTINCT FROM p_reception_id
         OR v_active_order.sap_transfer_id IS DISTINCT FROM p_sap_transfer_id
         OR v_existing_serials IS DISTINCT FROM v_serials THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'code', 'EQUIPMENT_IDENTITY_MISMATCH',
          'main_serial', v_main,
          'active_os', v_active.os_label,
          'active_status', v_active.status,
          'error', 'La identidad S1-S4 o el contexto recepción/SAP no coincide con la OS activa.'
        );
        CONTINUE;
      END IF;
    ELSE
      SELECT q.sn, q.service_order_id, q.os_label, q.status
        INTO v_active
      FROM (
        SELECT sn, a.*
        FROM unnest(v_serials) AS u(sn)
        CROSS JOIN LATERAL public.series_active_service_order(u.sn) a
        LIMIT 1
      ) q;

      IF FOUND AND v_active.service_order_id IS NOT NULL THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'code', 'PARTIAL_SERIAL_MATCH',
          'main_serial', v_main,
          'serial', v_active.sn,
          'active_os', v_active.os_label,
          'active_status', v_active.status,
          'error', format('La serie %s pertenece a otra identidad de equipo activa.', v_active.sn)
        );
        CONTINUE;
      END IF;
    END IF;

    -- Pass the normalized, complete identity to the already installed writer.
    v_valid_units := v_valid_units || jsonb_build_array(
      jsonb_set(v_unit, '{main_serial}', to_jsonb(v_main_key), true)
        || jsonb_build_object('all_series', to_jsonb(v_serials))
    );
  END LOOP;

  IF jsonb_array_length(v_valid_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar. %',
      coalesce(v_errors->0->>'error', 'Validación fallida.');
  END IF;

  v_result := public.classify_equipment_batch_tx_validated_write(
    p_reception_id,
    p_sap_transfer_id,
    v_valid_units,
    p_registered_by,
    p_correlation_id
  );

  
  IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
    PERFORM public.emit_domain_event(
      'equipment.batch_classified',
      'reception',
      p_reception_id::text,
      jsonb_build_object(
        'sapTransferId', p_sap_transfer_id,
        'unitsProcessed', coalesce((v_result->>'units_processed')::integer, 0),
        'unitsSkipped', coalesce((v_result->>'units_skipped')::integer, 0) + v_skipped,
        'errors', coalesce(v_result->'errors', '[]'::jsonb) || v_errors,
        'registeredBy', p_registered_by
      ),
      coalesce(nullif(trim(p_correlation_id), ''), p_reception_id::text),
      'cac',
      p_registered_by
    );
  END IF;

  RETURN jsonb_set(
    jsonb_set(
      v_result,
      '{units_skipped}',
      to_jsonb(coalesce((v_result->>'units_skipped')::integer, 0) + v_skipped)
    ),
    '{errors}',
    coalesce(v_result->'errors', '[]'::jsonb) || v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  TO authenticated, service_role;


-- Cycle close on terminal status (normalize_equipment_serial — single definition)
CREATE OR REPLACE FUNCTION public.trg_close_serial_cycle_on_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_order_id IS NOT NULL
     AND public.series_status_is_terminal(NEW.current_status::text)
     AND NOT public.series_status_is_terminal(OLD.current_status::text) THEN
    UPDATE public.service_order_serial_cycles
    SET unlinked_at = coalesce(unlinked_at, now())
    WHERE public.normalize_equipment_serial(serial_number)
        = public.normalize_equipment_serial(NEW.serial_number)
      AND service_order_id = NEW.service_order_id
      AND unlinked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_close_serial_cycle_on_terminal_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_close_serial_cycle_on_terminal_status ON public.series;
CREATE TRIGGER trg_close_serial_cycle_on_terminal_status
  AFTER UPDATE OF current_status
  ON public.series
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_close_serial_cycle_on_terminal_status();

NOTIFY pgrst, 'reload schema';
