-- =============================================================================
-- 272 — Identidad exacta de equipo en classify (anti-fusión por serie parcial)
-- =============================================================================
-- Corrige regresión 177: reutilizar OS si cualquier S1–S4 activa compartía
-- recepción O SAP (OR), fusionando equipos distintos (p. ej. SHARED en S2).
--
-- Reglas:
--   * Reintento idempotente solo si S1 coincide con main_serial de la OS activa
--     Y recepción Y documento SAP son los mismos.
--   * Cualquier serie del lote en OS activa de otro main_serial → conflicto.
--   * Anti-duplicado en lote sobre todas las series normalizadas (S1–S4).
--   * Locks advisory por cada serie del equipo (orden determinista).
-- =============================================================================

-- Post-20261020001356: actualiza solo el escritor interno; no toca la RPC pública preflight.
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

    v_main_key := upper(trim(v_main_serial));

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

    PERFORM pg_advisory_xact_lock(hashtext('classify_main:' || v_main_key));

    SELECT COALESCE(
      array_agg(DISTINCT upper(trim(x))) FILTER (WHERE public.is_valid_equipment_serial(x)),
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
      PERFORM pg_advisory_xact_lock(hashtext('classify_serial:' || v_sn));
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

      IF upper(trim(v_os_rec.main_serial)) = v_main_key
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

          IF upper(trim(v_os_rec.main_serial)) IS DISTINCT FROM v_main_key THEN
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
      WHERE upper(trim(so.main_serial)) = v_main_key
        AND NOT public.service_order_status_is_closed(so.status)
        AND EXISTS (
          SELECT 1
          FROM public.series s
          WHERE upper(trim(s.serial_number)) = ANY (v_all_serials)
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
          WHERE upper(trim(so.main_serial)) = v_main_key
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
        SELECT s.service_order_id, upper(trim(so.main_serial))
        INTO v_existing_os, v_existing_main
        FROM public.series s
        JOIN public.service_orders so ON so.id = s.service_order_id
        WHERE upper(trim(s.serial_number)) = v_sn
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

  IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
    PERFORM public.emit_domain_event(
      'equipment.batch_classified',
      'reception',
      p_reception_id::text,
      jsonb_build_object(
        'sapTransferId', p_sap_transfer_id,
        'unitsProcessed', v_processed,
        'unitsSkipped', v_skipped,
        'errors', v_errors,
        'registeredBy', p_registered_by
      ),
      v_correlation,
      'cac',
      p_registered_by
    );
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
