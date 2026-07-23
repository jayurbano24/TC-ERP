-- =============================================================================
-- 168 — Bandeja CAC: received_by_name = clasificador Backoffice (no recepcionista)
-- =============================================================================
-- Bug: upsert_cac_tray_unit_from_os corría ANTES de grabar classified_by / notas
-- CLASIFICACIÓN Por:, y no recibía p_registered_by del classify RPC. En la UI
-- "Recibió" mostraba quien recepcionó (Recibido Por:) en vez de quien clasificó.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_cac_classifier_label(p_raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := NULLIF(trim(COALESCE(p_raw, '')), '');
  v_name text;
BEGIN
  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;

  -- Email → nombre de perfil
  IF position('@' IN v_raw) > 0 THEN
    SELECT NULLIF(trim(p.full_name), '') INTO v_name
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(v_raw)
    LIMIT 1;

    RETURN COALESCE(v_name, split_part(v_raw, '@', 1));
  END IF;

  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.extract_cac_classifier_from_notes(p_notes text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_matches text[];
  v_last text;
BEGIN
  SELECT ARRAY(
    SELECT trim(m[1])
    FROM regexp_matches(
      COALESCE(p_notes, ''),
      'CLASIFICACI[ÓO]N[^\n]*Por:\s*([^\n]+)',
      'gi'
    ) AS m
  ) INTO v_matches;

  IF v_matches IS NULL OR cardinality(v_matches) = 0 THEN
    RETURN NULL;
  END IF;

  v_last := v_matches[cardinality(v_matches)];
  RETURN public.resolve_cac_classifier_label(v_last);
END;
$$;

-- ---------------------------------------------------------------------------
-- upsert: acepta clasificador explícito; NUNCA usa "Recibido Por" / receptions.received_by
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_cac_tray_unit_from_os(uuid);

CREATE OR REPLACE FUNCTION public.upsert_cac_tray_unit_from_os(
  p_os_id uuid,
  p_classifier_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os public.service_orders%ROWTYPE;
  v_rec public.receptions%ROWTYPE;
  v_rg public.reception_guides%ROWTYPE;
  v_sap public.sap_transfer_documents%ROWTYPE;
  v_model public.models%ROWTYPE;
  v_serials text[];
  v_series_ids uuid[];
  v_classified_at timestamptz;
  v_guide text;
  v_agency_raw text;
  v_unit_status text;
  v_unit_status_label text;
  v_os_number integer;
  v_excluded_reason text;
  v_is_active boolean := true;
  v_all_excluded boolean;
  v_rec_status text;
  v_search_text text;
  v_classifier text;
BEGIN
  SELECT * INTO v_os FROM public.service_orders WHERE id = p_os_id;
  IF NOT FOUND OR COALESCE(v_os.os_label, '') NOT LIKE 'TC-%' THEN
    RETURN;
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = v_os.reception_id;
  IF NOT FOUND OR lower(COALESCE(v_rec.source::text, '')) <> 'cac' THEN
    RETURN;
  END IF;

  v_rec_status := upper(trim(COALESCE(v_rec.status, '')));
  IF v_rec_status IN (
    'ELIMINADO', 'ELIMINADO POR BODEGA', 'DEVUELTO_A_AGENCIA', 'FINALIZADO', 'PROCESADO'
  ) THEN
    v_is_active := false;
    v_excluded_reason := 'reception_' || lower(v_rec_status);
  END IF;

  IF v_os.reception_guide_id IS NOT NULL THEN
    SELECT * INTO v_rg FROM public.reception_guides WHERE id = v_os.reception_guide_id;
  END IF;

  IF v_os.sap_transfer_id IS NOT NULL THEN
    SELECT * INTO v_sap FROM public.sap_transfer_documents WHERE id = v_os.sap_transfer_id;
  END IF;

  IF v_os.model_id IS NOT NULL THEN
    SELECT * INTO v_model FROM public.models WHERE id = v_os.model_id;
  END IF;

  SELECT
    COALESCE(array_agg(s.serial_number ORDER BY
      CASE WHEN upper(trim(s.serial_number)) = upper(trim(v_os.main_serial)) THEN 0 ELSE 1 END,
      s.created_at
    ), '{}'),
    COALESCE(array_agg(s.id ORDER BY
      CASE WHEN upper(trim(s.serial_number)) = upper(trim(v_os.main_serial)) THEN 0 ELSE 1 END,
      s.created_at
    ), '{}')
  INTO v_serials, v_series_ids
  FROM public.series s
  WHERE s.service_order_id = p_os_id
    AND s.brand_id IS NOT NULL;

  IF COALESCE(array_length(v_serials, 1), 0) = 0 THEN
    v_is_active := false;
    v_excluded_reason := COALESCE(v_excluded_reason, 'no_series');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.service_order_id = p_os_id
      AND s.brand_id IS NOT NULL
      AND lower(COALESCE(s.current_status::text, '')) NOT IN ('in_scraps', 'dispatched')
  ) INTO v_all_excluded;

  IF v_all_excluded AND COALESCE(array_length(v_serials, 1), 0) > 0 THEN
    v_is_active := false;
    v_excluded_reason := COALESCE(v_excluded_reason, 'series_excluded');
  END IF;

  v_guide := COALESCE(v_rg.guide_number, v_rec.guide_number, '---');
  v_agency_raw := NULLIF(trim(COALESCE(v_sap.agency, v_rg.agency, '')), '');

  v_classified_at := COALESCE(
    v_os.created_at,
    v_rg.classified_at,
    v_rec.created_at,
    now()
  );

  v_os_number := COALESCE(NULLIF(regexp_replace(COALESCE(v_os.os_label, ''), '\D', '', 'g'), '')::integer, 0);

  IF COALESCE(v_sap.status, '') = 'DEVUELTO_BLOQUE' THEN
    v_unit_status := 'returned';
    v_unit_status_label := 'Devuelto';
  ELSIF EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.service_order_id = p_os_id
      AND lower(COALESCE(s.current_status::text, '')) = 'returned'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.service_order_id = p_os_id
      AND lower(COALESCE(s.current_status::text, '')) NOT IN ('returned')
  ) THEN
    v_unit_status := 'returned';
    v_unit_status_label := 'Devuelto';
  ELSIF EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.service_order_id = p_os_id
      AND upper(COALESCE(s.current_status::text, '')) = 'RECEPCIONADO_BODEGA_GENERAL'
  ) OR COALESCE(v_sap.status, '') = 'PENDIENTE_INGRESO_BODEGA' THEN
    v_unit_status := 'RECEPCIONADO_BODEGA_GENERAL';
    v_unit_status_label := public.cac_tray_status_label(v_unit_status);
  ELSE
    SELECT COALESCE(
      (SELECT s.current_status::text FROM public.series s
       WHERE s.service_order_id = p_os_id AND s.brand_id IS NOT NULL
       ORDER BY s.updated_at DESC NULLS LAST LIMIT 1),
      '---'
    ) INTO v_unit_status;
    v_unit_status_label := public.cac_tray_status_label(v_unit_status);
  END IF;

  v_search_text := lower(concat_ws(' ',
    v_guide,
    v_os.os_label,
    COALESCE(v_sap.sap_document_number, ''),
    COALESCE(v_os.main_serial, ''),
    array_to_string(v_serials, ' ')
  ));

  -- Clasificador (prioridad): argumento → guide.classified_by → notas CLASIFICACIÓN Por:
  -- Nunca "Recibido Por" (eso es recepción logística).
  v_classifier := COALESCE(
    public.resolve_cac_classifier_label(p_classifier_name),
    public.resolve_cac_classifier_label(v_rg.classified_by),
    public.extract_cac_classifier_from_notes(v_rec.notes)
  );

  INSERT INTO public.cac_tray_units (
    service_order_id, reception_id, sap_transfer_id, reception_guide_id,
    classified_at, os_label, os_number,
    guide_number, pilot_name, carrier, received_by_name,
    agency_code, agency_name, sap_document_number,
    unit_status, unit_status_label, reentry_count,
    tech_id, brand_id, model_id,
    serial_numbers, series_ids,
    search_text,
    is_active, excluded_reason, updated_at
  ) VALUES (
    p_os_id, v_rec.id, v_os.sap_transfer_id, v_os.reception_guide_id,
    v_classified_at, v_os.os_label, v_os_number,
    v_guide,
    NULLIF(trim(substring(COALESCE(v_rec.notes, '') FROM 'Piloto:\s*([^\n]+)')), ''),
    v_rec.carrier,
    v_classifier,
    v_agency_raw,
    v_agency_raw,
    COALESCE(v_sap.sap_document_number, '---'),
    v_unit_status, v_unit_status_label, COALESCE(v_os.reentry_count, 1),
    v_model.technology_id, v_os.brand_id, v_os.model_id,
    v_serials, v_series_ids,
    v_search_text,
    v_is_active, v_excluded_reason, now()
  )
  ON CONFLICT (service_order_id) DO UPDATE SET
    reception_id = EXCLUDED.reception_id,
    sap_transfer_id = EXCLUDED.sap_transfer_id,
    reception_guide_id = EXCLUDED.reception_guide_id,
    classified_at = EXCLUDED.classified_at,
    os_label = EXCLUDED.os_label,
    os_number = EXCLUDED.os_number,
    guide_number = EXCLUDED.guide_number,
    pilot_name = EXCLUDED.pilot_name,
    carrier = EXCLUDED.carrier,
    -- No pisar un clasificador bueno con NULL
    received_by_name = COALESCE(EXCLUDED.received_by_name, public.cac_tray_units.received_by_name),
    agency_code = EXCLUDED.agency_code,
    agency_name = EXCLUDED.agency_name,
    sap_document_number = EXCLUDED.sap_document_number,
    unit_status = EXCLUDED.unit_status,
    unit_status_label = EXCLUDED.unit_status_label,
    reentry_count = EXCLUDED.reentry_count,
    tech_id = EXCLUDED.tech_id,
    brand_id = EXCLUDED.brand_id,
    model_id = EXCLUDED.model_id,
    serial_numbers = EXCLUDED.serial_numbers,
    series_ids = EXCLUDED.series_ids,
    search_text = EXCLUDED.search_text,
    is_active = EXCLUDED.is_active,
    excluded_reason = EXCLUDED.excluded_reason,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_cac_tray_unit_from_os(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- classify RPC: pasar p_registered_by al upsert de bandeja
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
  v_unit_idx integer := 0;
  v_reentry_map jsonb := '{}'::jsonb;
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

    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id, p_registered_by);

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

GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Refresh puntual tras finalizar clasificación (cliente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_cac_tray_classifier(
  p_reception_id uuid,
  p_guide_numbers text[] DEFAULT NULL,
  p_classifier_name text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := public.resolve_cac_classifier_label(p_classifier_name);
  v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_label IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.cac_tray_units t
  SET
    received_by_name = v_label,
    updated_at = now()
  WHERE t.reception_id = p_reception_id
    AND t.is_active = true
    AND (
      p_guide_numbers IS NULL
      OR cardinality(p_guide_numbers) = 0
      OR t.guide_number = ANY (p_guide_numbers)
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_cac_tray_classifier(uuid, text[], text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill filas existentes: clasificador real (no "Recibido Por")
-- ---------------------------------------------------------------------------
UPDATE public.cac_tray_units t
SET
  received_by_name = COALESCE(
    public.resolve_cac_classifier_label(rg.classified_by),
    public.extract_cac_classifier_from_notes(r.notes),
    t.received_by_name
  ),
  updated_at = now()
FROM public.service_orders so
JOIN public.receptions r ON r.id = so.reception_id
LEFT JOIN public.reception_guides rg ON rg.id = so.reception_guide_id
WHERE t.service_order_id = so.id
  AND t.is_active = true
  AND lower(COALESCE(r.source::text, '')) = 'cac';

-- Si quedó igual al recepcionista y hay CLASIFICACIÓN Por: distinta, corregir
UPDATE public.cac_tray_units t
SET
  received_by_name = public.extract_cac_classifier_from_notes(r.notes),
  updated_at = now()
FROM public.service_orders so
JOIN public.receptions r ON r.id = so.reception_id
WHERE t.service_order_id = so.id
  AND t.is_active = true
  AND public.extract_cac_classifier_from_notes(r.notes) IS NOT NULL
  AND lower(trim(COALESCE(t.received_by_name, '')))
    = lower(trim(COALESCE(substring(r.notes FROM 'Recibido Por:\s*([^\n]+)'), '')));

NOTIFY pgrst, 'reload schema';
