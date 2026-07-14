-- =============================================================================
-- 122 — Classify CAC: timeout 300s + conteo de reingreso set-based (1 query)
--
-- El log 57014 a las 10:08 fue ANTES de la 121. Esta migración endurece el
-- camino por si el lote SAP sigue siendo grande.
-- =============================================================================

-- Índices con trim (datos pueden traer espacios)
CREATE INDEX IF NOT EXISTS idx_service_orders_main_serial_upper_trim
  ON public.service_orders (upper(trim(main_serial)));

CREATE INDEX IF NOT EXISTS idx_series_serial_number_upper_trim
  ON public.series (upper(trim(serial_number)));

CREATE OR REPLACE FUNCTION public.next_equipment_reentry_count(p_serials text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cleaned AS (
    SELECT DISTINCT upper(trim(sn)) AS sn
    FROM unnest(COALESCE(p_serials, ARRAY[]::text[])) AS t(sn)
    WHERE nullif(trim(sn), '') IS NOT NULL
  ),
  prior AS (
    SELECT so.id
    FROM public.service_orders so
    JOIN cleaned c ON upper(trim(so.main_serial)) = c.sn

    UNION

    SELECT s.service_order_id AS id
    FROM public.series s
    JOIN cleaned c ON upper(trim(s.serial_number)) = c.sn
    WHERE s.service_order_id IS NOT NULL
  )
  SELECT COALESCE(COUNT(DISTINCT id), 0)::integer + 1
  FROM prior
  WHERE id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.next_equipment_reentry_count(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_equipment_reentry_count(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_equipment_reentry_count(text[]) TO service_role;

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
  v_model_id uuid;
  v_brand_id uuid;
  v_material text;
  v_reentry_count integer;
  v_os_id uuid;
  v_os_rec public.service_orders%ROWTYPE;
  v_sn text;
  v_series_id uuid;
  v_processed integer := 0;
  v_service_orders jsonb := '[]'::jsonb;
  v_series_ids jsonb := '[]'::jsonb;
  v_correlation text;
  v_all_serials text[];
  v_unit_idx integer := 0;
  v_reentry_map jsonb := '{}'::jsonb;
BEGIN
  -- Forzar timeout en la sesión (más fiable que solo el atributo de función)
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

  -- Una sola pasada: índice denso 0..n-1 solo sobre unidades con main_serial
  -- (debe coincidir con v_unit_idx del bucle, que también salta vacíos)
  WITH units AS (
    SELECT
      (row_number() OVER (ORDER BY u.ord) - 1)::integer AS idx,
      (
        SELECT COALESCE(
          array_agg(DISTINCT upper(trim(x))) FILTER (WHERE nullif(trim(x), '') IS NOT NULL),
          ARRAY[upper(trim(u.elem->>'main_serial'))]
        )
        FROM jsonb_array_elements_text(
          CASE
            WHEN u.elem->'all_series' IS NOT NULL AND jsonb_typeof(u.elem->'all_series') = 'array'
              THEN u.elem->'all_series'
            ELSE jsonb_build_array(u.elem->>'main_serial')
          END
        ) AS t(x)
      ) AS serials
    FROM jsonb_array_elements(p_units) WITH ORDINALITY AS u(elem, ord)
    WHERE nullif(trim(COALESCE(u.elem->>'main_serial', '')), '') IS NOT NULL
  ),
  exploded AS (
    SELECT u.idx, upper(trim(s.sn)) AS sn
    FROM units u
    CROSS JOIN LATERAL unnest(u.serials) AS s(sn)
    WHERE nullif(trim(s.sn), '') IS NOT NULL
  ),
  prior AS (
    SELECT DISTINCT e.idx, so.id AS os_id
    FROM exploded e
    JOIN public.service_orders so ON upper(trim(so.main_serial)) = e.sn

    UNION

    SELECT DISTINCT e.idx, s.service_order_id AS os_id
    FROM exploded e
    JOIN public.series s ON upper(trim(s.serial_number)) = e.sn
    WHERE s.service_order_id IS NOT NULL
  ),
  counted AS (
    SELECT u.idx, (COALESCE(COUNT(DISTINCT p.os_id), 0) + 1)::integer AS reentry_count
    FROM units u
    LEFT JOIN prior p ON p.idx = u.idx
    GROUP BY u.idx
  )
  SELECT COALESCE(jsonb_object_agg(idx::text, reentry_count), '{}'::jsonb)
  INTO v_reentry_map
  FROM counted;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_main_serial := trim(COALESCE(v_unit->>'main_serial', ''));
    IF v_main_serial = '' THEN
      CONTINUE;
    END IF;

    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    v_reentry_count := COALESCE((v_reentry_map->>v_unit_idx::text)::integer, 1);
    v_unit_idx := v_unit_idx + 1;

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

    IF v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array' THEN
      FOR v_sn IN SELECT jsonb_array_elements_text(v_unit->'all_series')
      LOOP
        v_sn := trim(v_sn);
        IF v_sn = '' THEN
          CONTINUE;
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
        RETURNING id INTO v_series_id;

        v_series_ids := v_series_ids || to_jsonb(v_series_id);
      END LOOP;
    END IF;

    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);

    IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
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

    v_service_orders := v_service_orders || row_to_json(v_os_rec)::jsonb;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
    PERFORM public.emit_domain_event(
      'equipment.batch_classified',
      'reception',
      p_reception_id::text,
      jsonb_build_object(
        'sapTransferId', p_sap_transfer_id,
        'unitsProcessed', v_processed,
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
    'correlation_id', v_correlation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
