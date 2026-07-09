-- 100: G985 sync escribe Material + Valoración (Lote SAP) en series.
-- Así Detalle de Inventario / Historial pueden mostrarlos sin re-leer el Excel.

CREATE OR REPLACE FUNCTION public.sap_sync_matches_tx(
  p_file_info jsonb,
  p_results jsonb,
  p_matched_series jsonb DEFAULT '[]'::jsonb,
  p_matched_equipos jsonb DEFAULT '[]'::jsonb,
  p_validation_details jsonb DEFAULT '[]'::jsonb,
  p_reset_unmatched boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upload_id uuid;
  v_session_id uuid;
  v_series_matched int := 0;
  v_series_unmatched int := 0;
  v_equipos_matched int := 0;
  v_equipos_unmatched int := 0;
BEGIN
  INSERT INTO public.sap_uploads (
    archivo, hash_sha256, usuario, registros,
    encontrados, no_encontrados, inconsistencias, tiempo_proceso, estado
  ) VALUES (
    coalesce(p_file_info->>'name', 'archivo'),
    coalesce(p_file_info->>'hash', ''),
    coalesce(p_file_info->>'user', 'Desconocido'),
    coalesce((p_file_info->>'totalRows')::int, 0),
    coalesce((p_results->>'encontrados')::int, 0),
    coalesce((p_results->>'noEncontrados')::int, 0),
    coalesce((p_results->>'inconsistencias')::int, 0),
    coalesce(p_results->>'timeStr', ''),
    'Completado'
  )
  RETURNING id INTO v_upload_id;

  INSERT INTO public.sap_validation_sessions (upload_id, usuario, estado, fecha_fin, activa)
  VALUES (v_upload_id, coalesce(p_file_info->>'user', 'Desconocido'), 'Finalizado', now(), true)
  RETURNING id INTO v_session_id;

  UPDATE public.sap_validation_sessions
  SET activa = false
  WHERE id <> v_session_id;

  INSERT INTO public.sap_validation_details (
    validation_id, equipo_id, tipo_serie, serie, material, descripcion,
    centro, almacen, lote, estado_sap, valoracion, coincidencia
  )
  SELECT
    v_session_id, x.equipo_id, x.tipo_serie, x.serie, x.material, x.descripcion,
    x.centro, x.almacen, x.lote, x.estado_sap, x.valoracion, coalesce(x.coincidencia, true)
  FROM jsonb_to_recordset(p_validation_details) AS x(
    equipo_id uuid, tipo_serie text, serie text, material text, descripcion text,
    centro text, almacen text, lote text, estado_sap text, valoracion text, coincidencia boolean
  )
  WHERE x.equipo_id IS NULL
     OR EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = x.equipo_id);

  -- Series validadas + Material / Valoración (Lote SAP) desde el G985
  UPDATE public.series s
  SET sap_status = 'Validado',
      sap_validation_id = v_session_id,
      material = COALESCE(NULLIF(trim(m.material), ''), s.material),
      valuation = COALESCE(NULLIF(trim(m.valuation), ''), s.valuation)
  FROM jsonb_to_recordset(p_matched_series) AS m(id uuid, material text, valuation text)
  WHERE s.id = m.id;

  UPDATE public.service_orders so
  SET sap_integration_status = e.sap_integration_status,
      last_sap_sync = now()
  FROM jsonb_to_recordset(p_matched_equipos) AS e(id uuid, sap_integration_status text)
  WHERE so.id = e.id;

  IF p_reset_unmatched THEN
    UPDATE public.series s
    SET sap_status = 'Sin Coincidencia',
        sap_validation_id = v_session_id
    WHERE s.service_order_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_matched_series) AS m(id uuid, material text, valuation text)
        WHERE m.id = s.id
      );

    GET DIAGNOSTICS v_series_unmatched = ROW_COUNT;

    UPDATE public.service_orders so
    SET sap_integration_status = 'Sin Coincidencia',
        last_sap_sync = now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_matched_equipos) AS e(id uuid, sap_integration_status text)
      WHERE e.id = so.id
    )
    AND EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
    );

    GET DIAGNOSTICS v_equipos_unmatched = ROW_COUNT;

    UPDATE public.sap_uploads
    SET no_encontrados = v_equipos_unmatched
    WHERE id = v_upload_id;
  END IF;

  SELECT coalesce(jsonb_array_length(p_matched_series), 0) INTO v_series_matched;
  SELECT coalesce(jsonb_array_length(p_matched_equipos), 0) INTO v_equipos_matched;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'upload_id', v_upload_id,
    'series_matched', v_series_matched,
    'series_unmatched', v_series_unmatched,
    'equipos_matched', v_equipos_matched,
    'equipos_unmatched', v_equipos_unmatched
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sap_sync_matches_tx(jsonb, jsonb, jsonb, jsonb, jsonb, boolean)
  TO authenticated, service_role;
