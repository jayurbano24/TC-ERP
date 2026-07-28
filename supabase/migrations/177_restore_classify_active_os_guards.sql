-- =============================================================================
-- 177 — Restaurar guards de classify (regresión de 168)
-- =============================================================================
-- La migración 168 reescribió classify_equipment_batch_tx para pasar
-- p_registered_by al upsert de bandeja, pero eliminó las reglas de 140:
--   * anti-duplicado en lote
--   * bloqueo / mensaje si hay OS activa
--   * cierre de cascarones cuando la serie ya está terminal
--
-- Resultado en producción: INSERT choca con
--   uniq_service_orders_active_main_serial
-- y Backoffice muestra error crudo de Postgres.
--
-- Esta migración:
--   1) Detecta OS activa también en cascarones (sin series)
--   2) Restaura classify endurecido + upsert(..., p_registered_by)
--   3) Reintento idempotente si la OS activa ya es del mismo SAP/recepción
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) OS activa por serie (incluye cascarón por main_serial sin series)
-- ---------------------------------------------------------------------------
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
    SELECT upper(trim(p_serial)) AS serial
    WHERE public.is_valid_equipment_serial(p_serial)
  )
  SELECT
    so.id,
    so.os_label,
    so.status,
    s.current_status::text
  FROM sn
  JOIN public.series s ON upper(trim(s.serial_number)) = sn.serial
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE NOT public.service_order_status_is_closed(so.status)
    AND NOT public.series_status_is_terminal(s.current_status::text)

  UNION ALL

  -- OS activa por main_serial (incluye cascarón sin series)
  SELECT
    so.id,
    so.os_label,
    so.status,
    NULL::text
  FROM sn
  JOIN public.service_orders so ON upper(trim(so.main_serial)) = sn.serial
  WHERE NOT public.service_order_status_is_closed(so.status)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.series_active_service_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_active_service_order(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Classify endurecido (140) + clasificador en bandeja (168) + idempotencia
-- ---------------------------------------------------------------------------
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
  v_active record;
  v_seen text[] := ARRAY[]::text[];
  v_reuse boolean;
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
    v_main_serial := trim(COALESCE(v_unit->>'main_serial', ''));
    IF v_main_serial = '' OR NOT public.is_valid_equipment_serial(v_main_serial) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'error', 'Serie principal inválida.'
      );
      CONTINUE;
    END IF;

    v_main_key := upper(v_main_serial);

    IF v_main_key = ANY (v_seen) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'error', format('La serie %s ya fue clasificada en este mismo lote.', v_main_serial)
      );
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_main_key);

    PERFORM pg_advisory_xact_lock(hashtext(v_main_key));

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

    v_active := NULL;
    v_reuse := false;
    SELECT * INTO v_active
    FROM (
      SELECT a.*
      FROM unnest(v_all_serials) AS u(sn)
      CROSS JOIN LATERAL public.series_active_service_order(u.sn) a
      LIMIT 1
    ) q;

    IF FOUND AND v_active.service_order_id IS NOT NULL THEN
      SELECT * INTO v_os_rec
      FROM public.service_orders
      WHERE id = v_active.service_order_id;

      -- Mismo documento SAP o misma recepción → reintento idempotente
      IF v_os_rec.sap_transfer_id IS NOT DISTINCT FROM p_sap_transfer_id
         OR v_os_rec.reception_id IS NOT DISTINCT FROM p_reception_id THEN
        v_reuse := true;
        v_os_id := v_os_rec.id;
      ELSE
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'main_serial', v_main_serial,
          'active_os', v_active.os_label,
          'active_status', v_active.status,
          'error', format(
            'La serie %s ya tiene una Orden de Servicio activa (%s / %s). Cierre o despache ese ciclo antes de reingresar.',
            v_main_serial,
            coalesce(v_active.os_label, v_active.service_order_id::text),
            v_active.status
          )
        );
        CONTINUE;
      END IF;
    END IF;

    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    IF NOT v_reuse THEN
      -- Cerrar OS huérfanas abiertas del main_serial si la serie ya está terminal
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
          -- Carrera / cascarón no detectado: reutilizar OS activa del mismo contexto o reportar
          SELECT * INTO v_os_rec
          FROM public.service_orders so
          WHERE upper(trim(so.main_serial)) = v_main_key
            AND NOT public.service_order_status_is_closed(so.status)
          ORDER BY so.created_at DESC
          LIMIT 1;

          IF FOUND AND (
            v_os_rec.sap_transfer_id IS NOT DISTINCT FROM p_sap_transfer_id
            OR v_os_rec.reception_id IS NOT DISTINCT FROM p_reception_id
          ) THEN
            v_reuse := true;
            v_os_id := v_os_rec.id;
          ELSE
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object(
              'main_serial', v_main_serial,
              'active_os', v_os_rec.os_label,
              'active_status', v_os_rec.status,
              'error', format(
                'La serie %s ya tiene una Orden de Servicio activa (%s / %s). Cierre o despache ese ciclo antes de reingresar.',
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

GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
