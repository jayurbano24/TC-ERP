-- 184: Sync G985 por chunks (begin / apply / finalize).
-- El RPC monolítico fallaba con ~20k matches (timeout / memoria en reset jsonb).

CREATE OR REPLACE FUNCTION public.sap_sync_matches_begin(
  p_file_info jsonb,
  p_results jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upload_id uuid;
  v_session_id uuid;
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

  RETURN jsonb_build_object(
    'upload_id', v_upload_id,
    'session_id', v_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_sync_matches_apply_chunk(
  p_session_id uuid,
  p_matched_series jsonb DEFAULT '[]'::jsonb,
  p_matched_equipos jsonb DEFAULT '[]'::jsonb,
  p_validation_details jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series int := 0;
  v_equipos int := 0;
  v_details int := 0;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_REQUIRED';
  END IF;

  UPDATE public.series s
  SET sap_status = 'Validado',
      sap_validation_id = p_session_id,
      material = COALESCE(NULLIF(trim(m.material), ''), s.material),
      valuation = COALESCE(NULLIF(trim(m.valuation), ''), s.valuation)
  FROM jsonb_to_recordset(coalesce(p_matched_series, '[]'::jsonb))
    AS m(id uuid, material text, valuation text)
  WHERE s.id = m.id;
  GET DIAGNOSTICS v_series = ROW_COUNT;

  UPDATE public.service_orders so
  SET sap_integration_status = e.sap_integration_status,
      last_sap_sync = now()
  FROM jsonb_to_recordset(coalesce(p_matched_equipos, '[]'::jsonb))
    AS e(id uuid, sap_integration_status text)
  WHERE so.id = e.id;
  GET DIAGNOSTICS v_equipos = ROW_COUNT;

  INSERT INTO public.sap_validation_details (
    validation_id, equipo_id, tipo_serie, serie, material, descripcion,
    centro, almacen, lote, estado_sap, valoracion, coincidencia
  )
  SELECT
    p_session_id, x.equipo_id, x.tipo_serie, x.serie, x.material, x.descripcion,
    x.centro, x.almacen, x.lote, x.estado_sap, x.valoracion, coalesce(x.coincidencia, true)
  FROM jsonb_to_recordset(coalesce(p_validation_details, '[]'::jsonb)) AS x(
    equipo_id uuid, tipo_serie text, serie text, material text, descripcion text,
    centro text, almacen text, lote text, estado_sap text, valoracion text, coincidencia boolean
  )
  WHERE x.equipo_id IS NULL
     OR EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = x.equipo_id);
  GET DIAGNOSTICS v_details = ROW_COUNT;

  RETURN jsonb_build_object(
    'series_updated', v_series,
    'equipos_updated', v_equipos,
    'details_inserted', v_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_sync_matches_finalize(
  p_upload_id uuid,
  p_session_id uuid,
  p_matched_series_ids uuid[] DEFAULT '{}',
  p_matched_equipo_ids uuid[] DEFAULT '{}',
  p_reset_unmatched boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_unmatched int := 0;
  v_equipos_unmatched int := 0;
BEGIN
  IF p_reset_unmatched THEN
    -- ANY(uuid[]) es mucho más eficiente que jsonb_to_recordset por fila.
    UPDATE public.series s
    SET sap_status = 'Sin Coincidencia',
        sap_validation_id = p_session_id
    WHERE s.service_order_id IS NOT NULL
      AND NOT (s.id = ANY (coalesce(p_matched_series_ids, '{}'::uuid[])));
    GET DIAGNOSTICS v_series_unmatched = ROW_COUNT;

    UPDATE public.service_orders so
    SET sap_integration_status = 'Sin Coincidencia',
        last_sap_sync = now()
    WHERE EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
    )
    AND NOT (so.id = ANY (coalesce(p_matched_equipo_ids, '{}'::uuid[])));
    GET DIAGNOSTICS v_equipos_unmatched = ROW_COUNT;

    IF p_upload_id IS NOT NULL THEN
      UPDATE public.sap_uploads
      SET no_encontrados = v_equipos_unmatched
      WHERE id = p_upload_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'series_unmatched', v_series_unmatched,
    'equipos_unmatched', v_equipos_unmatched,
    'series_matched', coalesce(cardinality(p_matched_series_ids), 0),
    'equipos_matched', coalesce(cardinality(p_matched_equipo_ids), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sap_sync_matches_begin(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sap_sync_matches_apply_chunk(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sap_sync_matches_finalize(uuid, uuid, uuid[], uuid[], boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sap_sync_matches_begin(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_sync_matches_apply_chunk(uuid, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_sync_matches_finalize(uuid, uuid, uuid[], uuid[], boolean) TO service_role;

-- Si existe schema internal (CHG-014), espejo para rpcInternal.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'internal') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION internal.sap_sync_matches_begin(p_file_info jsonb, p_results jsonb)
      RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
      AS $s$ SELECT public.sap_sync_matches_begin(p_file_info, p_results) $s$
    $fn$;
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION internal.sap_sync_matches_apply_chunk(
        p_session_id uuid, p_matched_series jsonb, p_matched_equipos jsonb, p_validation_details jsonb
      ) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
      AS $s$ SELECT public.sap_sync_matches_apply_chunk(p_session_id, p_matched_series, p_matched_equipos, p_validation_details) $s$
    $fn$;
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION internal.sap_sync_matches_finalize(
        p_upload_id uuid, p_session_id uuid, p_matched_series_ids uuid[], p_matched_equipo_ids uuid[], p_reset_unmatched boolean
      ) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
      AS $s$ SELECT public.sap_sync_matches_finalize(p_upload_id, p_session_id, p_matched_series_ids, p_matched_equipo_ids, p_reset_unmatched) $s$
    $fn$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION internal.sap_sync_matches_begin(jsonb, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION internal.sap_sync_matches_apply_chunk(uuid, jsonb, jsonb, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION internal.sap_sync_matches_finalize(uuid, uuid, uuid[], uuid[], boolean) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
