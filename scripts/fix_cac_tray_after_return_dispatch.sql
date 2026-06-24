-- Sincroniza cac_tray_units tras despacho desde Gestión de Devoluciones.
-- Ejecutar en Supabase SQL Editor.

-- 1) Etiqueta "Despachado" en el read-model
CREATE OR REPLACE FUNCTION public.cac_tray_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_status, '')))
    WHEN 'recepcionado_bodega_general' THEN 'Ingresado a Backoffice'
    WHEN 'pendiente_ingreso_bodega' THEN 'Ingresado a Backoffice'
    WHEN 'in_central_warehouse' THEN 'Ingresado a Bodega General'
    WHEN 'ingresado_bodega' THEN 'Ingresado a Bodega General'
    WHEN 'returned' THEN 'Devuelto'
    WHEN 'devuelto_bloque' THEN 'Devuelto'
    WHEN 'dispatched' THEN 'Despachado'
    WHEN 'despachado' THEN 'Despachado'
    ELSE COALESCE(NULLIF(trim(p_status), ''), '---')
  END;
$$;

-- 2) upsert: despachado oculta fila aunque SAP siga DEVUELTO_BLOQUE
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
    'ELIMINADO', 'ELIMINADO POR BODEGA', 'DEVUELTO_A_AGENCIA', 'FINALIZADO', 'PROCESADO', 'DESPACHADO'
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
    v_unit_status := 'dispatched';
    v_unit_status_label := 'Despachado';
  ELSIF COALESCE(v_sap.status, '') = 'DESPACHADO' THEN
    v_unit_status := 'dispatched';
    v_unit_status_label := 'Despachado';
    v_is_active := false;
    v_excluded_reason := COALESCE(v_excluded_reason, 'sap_despachado');
  ELSIF COALESCE(v_sap.status, '') = 'DEVUELTO_BLOQUE' THEN
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

  v_guide := COALESCE(v_rg.guide_number, v_rec.guide_number, '---');
  v_agency_raw := NULLIF(trim(COALESCE(v_sap.agency, v_rg.agency, '')), '');

  v_classified_at := COALESCE(
    v_os.created_at,
    v_rg.classified_at,
    v_rec.created_at,
    now()
  );

  v_os_number := COALESCE(NULLIF(regexp_replace(COALESCE(v_os.os_label, ''), '\D', '', 'g'), '')::integer, 0);

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

-- 3) Reparar OS ya despachadas (ajuste TC-01134 u otras)
DO $$
DECLARE
  v_os_id uuid;
BEGIN
  FOR v_os_id IN
    SELECT DISTINCT s.service_order_id
    FROM public.series s
    INNER JOIN public.service_orders so ON so.id = s.service_order_id
    WHERE s.service_order_id IS NOT NULL
      AND so.os_label LIKE 'TC-%'
      AND NOT EXISTS (
        SELECT 1 FROM public.series s2
        WHERE s2.service_order_id = s.service_order_id
          AND s2.brand_id IS NOT NULL
          AND lower(COALESCE(s2.current_status::text, '')) NOT IN ('dispatched', 'in_scraps')
      )
      AND EXISTS (
        SELECT 1 FROM public.series s3
        WHERE s3.service_order_id = s.service_order_id
          AND lower(COALESCE(s3.current_status::text, '')) = 'dispatched'
      )
  LOOP
    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);
  END LOOP;
END;
$$;

-- Verificación rápida
SELECT os_label, unit_status_label, is_active, excluded_reason
FROM public.cac_tray_units
WHERE os_label = 'TC-01134';
