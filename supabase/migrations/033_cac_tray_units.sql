-- CHG-CAC-TRAY: Read-model para bandeja historial CAC (escala a millones de filas)
-- Una fila por equipo con OS TC-XXX. Escrita al clasificar; consultada con índices.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.cac_tray_units (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id      UUID NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE CASCADE,
  reception_id          UUID NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  sap_transfer_id       UUID REFERENCES public.sap_transfer_documents(id) ON DELETE SET NULL,
  reception_guide_id    UUID REFERENCES public.reception_guides(id) ON DELETE SET NULL,

  classified_at         TIMESTAMPTZ NOT NULL,
  os_label              TEXT NOT NULL,
  os_number             INTEGER NOT NULL DEFAULT 0,

  guide_number          TEXT NOT NULL DEFAULT '---',
  pilot_name            TEXT,
  carrier               TEXT,
  received_by_name      TEXT,
  agency_code           TEXT,
  agency_name           TEXT,
  sap_document_number   TEXT,

  unit_status           TEXT NOT NULL DEFAULT '---',
  unit_status_label     TEXT NOT NULL DEFAULT '---',
  reentry_count         INTEGER NOT NULL DEFAULT 1,

  tech_id               UUID,
  brand_id              UUID,
  model_id              UUID,

  serial_numbers        TEXT[] NOT NULL DEFAULT '{}',
  series_ids            UUID[] NOT NULL DEFAULT '{}',
  search_text           TEXT NOT NULL DEFAULT '',

  is_active             BOOLEAN NOT NULL DEFAULT true,
  excluded_reason       TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cac_tray_classified_at
  ON public.cac_tray_units (classified_at DESC, os_number DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_os_label
  ON public.cac_tray_units (os_label)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_guide
  ON public.cac_tray_units (guide_number)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_agency_code
  ON public.cac_tray_units (agency_code)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_status
  ON public.cac_tray_units (unit_status)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_tech
  ON public.cac_tray_units (tech_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_brand_model
  ON public.cac_tray_units (brand_id, model_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_serials
  ON public.cac_tray_units USING GIN (serial_numbers);

CREATE INDEX IF NOT EXISTS idx_cac_tray_search
  ON public.cac_tray_units USING GIN (search_text gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cac_tray_reception
  ON public.cac_tray_units (reception_id);

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cac_tray_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_status, '')))
    WHEN 'recepcionado_bodega_general' THEN 'Pendiente de Ingreso a Bodega General'
    WHEN 'pendiente_ingreso_bodega' THEN 'Pendiente de Ingreso a Bodega General'
    WHEN 'in_central_warehouse' THEN 'Ingresado a Bodega General'
    WHEN 'ingresado_bodega' THEN 'Ingresado a Bodega General'
    WHEN 'returned' THEN 'Devuelto'
    WHEN 'devuelto_bloque' THEN 'Devuelto'
    ELSE COALESCE(NULLIF(trim(p_status), ''), '---')
  END;
$$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_cac_tray_unit_from_os(p_os_id uuid)
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
    COALESCE(v_rg.classified_by, NULLIF(trim(substring(COALESCE(v_rec.notes, '') FROM 'CLASIFICACIÓN[^\n]*Por:\s*([^\n]+)')), '')),
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
    received_by_name = EXCLUDED.received_by_name,
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

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_cac_tray_units(
  p_batch_size integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os_id uuid;
  v_processed integer := 0;
BEGIN
  FOR v_os_id IN
    SELECT so.id
    FROM public.service_orders so
    INNER JOIN public.receptions r ON r.id = so.reception_id
    WHERE so.os_label LIKE 'TC-%'
      AND lower(r.source::text) = 'cac'
    ORDER BY so.created_at DESC
    OFFSET GREATEST(p_offset, 0)
    LIMIT GREATEST(p_batch_size, 1)
  LOOP
    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'offset', p_offset,
    'batch_size', p_batch_size
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_cac_tray_units(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cac_tray_unit_from_os(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Hook: classify_equipment_batch_tx → upsert read-model por OS creada
CREATE OR REPLACE FUNCTION public.classify_equipment_batch_tx(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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
    IF v_main_serial = '' THEN
      CONTINUE;
    END IF;

    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    SELECT COUNT(*)::integer INTO v_reentry_count
    FROM public.service_orders
    WHERE main_serial = v_main_serial;

    v_reentry_count := COALESCE(v_reentry_count, 0) + 1;

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

    v_service_orders := v_service_orders || row_to_json(v_os_rec)::jsonb;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  RETURN jsonb_build_object(
    'service_orders', v_service_orders,
    'series_ids', v_series_ids,
    'registered_by', p_registered_by
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Hook: devolución bloque SAP → actualizar read-model
CREATE OR REPLACE FUNCTION public.block_return_by_sap_transfer_tx(
  p_sap_transfer_id uuid,
  p_motivo text,
  p_guia_salida text,
  p_user text,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sap public.sap_transfer_documents%ROWTYPE;
  v_invalid_count integer;
  v_invalid_status text;
  v_series_updated integer;
  v_units_count integer;
  v_return_note text;
  v_now timestamptz := now();
  v_os_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_sap_transfer_id IS NULL THEN
    RAISE EXCEPTION 'Documento SAP no indicado.';
  END IF;

  SELECT * INTO v_sap
  FROM public.sap_transfer_documents
  WHERE id = p_sap_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento SAP no encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.series WHERE sap_transfer_id = p_sap_transfer_id
  ) THEN
    RAISE EXCEPTION 'No hay equipos asociados a este Documento SAP.';
  END IF;

  SELECT COUNT(*)::integer, MIN(s.current_status)
  INTO v_invalid_count, v_invalid_status
  FROM public.series s
  WHERE s.sap_transfer_id = p_sap_transfer_id
    AND s.current_status NOT IN ('RECEPCIONADO_BODEGA_GENERAL', 'returned');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Devolución en bloque: % serie(s) en estado no permitido (%).',
      v_invalid_count, COALESCE(v_invalid_status, 'desconocido');
  END IF;

  v_return_note :=
    '--- DEVOLUCIÓN BLOQUE SAP ---' || E'\n' ||
    'SAP: ' || v_sap.sap_document_number || E'\n' ||
    'Motivo: ' || COALESCE(p_motivo, '') || E'\n' ||
    'Guía Salida: ' || COALESCE(p_guia_salida, '') || E'\n' ||
    'Cat: BODEGA DEVOLUCIÓN' || E'\n' ||
    'Usuario: ' || COALESCE(p_user, '') || E'\n' ||
    'Fecha: ' || to_char(v_now AT TIME ZONE 'America/Guatemala', 'DD/MM/YYYY, HH12:MI:SS AM');

  IF p_observaciones IS NOT NULL AND trim(p_observaciones) <> '' THEN
    v_return_note := v_return_note || E'\n' || 'Observaciones: ' || trim(p_observaciones);
  END IF;

  UPDATE public.series
  SET
    current_status = 'returned',
    notes = v_return_note,
    updated_at = v_now
  WHERE sap_transfer_id = p_sap_transfer_id
    AND current_status = 'RECEPCIONADO_BODEGA_GENERAL';

  GET DIAGNOSTICS v_series_updated = ROW_COUNT;

  UPDATE public.service_orders
  SET status = 'DEVUELTO'
  WHERE id IN (
    SELECT DISTINCT s.service_order_id
    FROM public.series s
    WHERE s.sap_transfer_id = p_sap_transfer_id
      AND s.service_order_id IS NOT NULL
  );

  UPDATE public.sap_transfer_documents
  SET
    status = 'DEVUELTO_BLOQUE',
    updated_at = v_now
  WHERE id = p_sap_transfer_id;

  FOR v_os_id IN
    SELECT DISTINCT s.service_order_id
    FROM public.series s
    WHERE s.sap_transfer_id = p_sap_transfer_id
      AND s.service_order_id IS NOT NULL
  LOOP
    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);
  END LOOP;

  SELECT COUNT(DISTINCT s.service_order_id)::integer
  INTO v_units_count
  FROM public.series s
  WHERE s.sap_transfer_id = p_sap_transfer_id
    AND s.service_order_id IS NOT NULL;

  RETURN jsonb_build_object(
    'units_count', COALESCE(v_units_count, 0),
    'series_updated', COALESCE(v_series_updated, 0),
    'sap_document_number', v_sap.sap_document_number
  );
END;
$$;

COMMENT ON TABLE public.cac_tray_units IS
  'Read-model: una fila por equipo CAC con OS TC-XXX para bandeja historial de alto volumen.';

-- Backfill inicial (idempotente)
SELECT public.backfill_cac_tray_units(5000, 0);
