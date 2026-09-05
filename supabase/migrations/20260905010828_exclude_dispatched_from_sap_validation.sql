-- =============================================================================
-- SAP G985: las OS despachadas quedan fuera del universo de revalidación.
--
-- Regla de negocio:
--   * Para despachar, la OS ya tuvo que estar validada en SAP.
--   * Después del despacho, sus series desaparecen del inventario SAP.
--   * Su ausencia en cargas G985 posteriores NO es "Sin Coincidencia".
--
-- Se protege el estado en triggers para cerrar bypasses y se corrige el
-- finalizador para que los contadores de la carga tampoco incluyan despachadas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_dispatched_os_sap_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.series s
    WHERE s.service_order_id = NEW.id
      AND s.current_status::text = 'dispatched'
  ) THEN
    NEW.sap_integration_status := 'Validado SAP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_dispatched_os_sap_status ON public.service_orders;
CREATE TRIGGER protect_dispatched_os_sap_status
BEFORE UPDATE OF sap_integration_status
ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_dispatched_os_sap_status();

CREATE OR REPLACE FUNCTION public.protect_dispatched_series_sap_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.service_order_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.series sd
       WHERE sd.service_order_id = NEW.service_order_id
         AND sd.current_status::text = 'dispatched'
     ) THEN
    NEW.sap_status := 'Validado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_dispatched_series_sap_status ON public.series;
CREATE TRIGGER protect_dispatched_series_sap_status
BEFORE UPDATE OF sap_status
ON public.series
FOR EACH ROW
EXECUTE FUNCTION public.protect_dispatched_series_sap_status();

-- Finalización chunked (migraciones 184/185): solo marca faltantes activos.
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
    -- Equipos activos sin ninguna serie en el G985.
    UPDATE public.service_orders so
    SET sap_integration_status = 'Sin Coincidencia',
        last_sap_sync = now()
    WHERE EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = so.id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM public.series sd
        WHERE sd.service_order_id = so.id
          AND sd.current_status::text = 'dispatched'
      )
      AND NOT (so.id = ANY (coalesce(p_matched_equipo_ids, '{}'::uuid[])));
    GET DIAGNOSTICS v_equipos_unmatched = ROW_COUNT;

    -- Solo series de las OS activas realmente sin match.
    UPDATE public.series s
    SET sap_status = 'Sin Coincidencia',
        sap_validation_id = p_session_id
    WHERE s.service_order_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.series sd
        WHERE sd.service_order_id = s.service_order_id
          AND sd.current_status::text = 'dispatched'
      )
      AND s.service_order_id = ANY (
        SELECT so.id
        FROM public.service_orders so
        WHERE so.sap_integration_status = 'Sin Coincidencia'
          AND EXISTS (
            SELECT 1
            FROM public.series sx
            WHERE sx.service_order_id = so.id
          )
          AND NOT (so.id = ANY (coalesce(p_matched_equipo_ids, '{}'::uuid[])))
      )
      AND NOT (s.id = ANY (coalesce(p_matched_series_ids, '{}'::uuid[])));
    GET DIAGNOSTICS v_series_unmatched = ROW_COUNT;

    -- Hermanas de OS matched: alinear a Validado.
    UPDATE public.series s
    SET sap_status = 'Validado',
        sap_validation_id = p_session_id
    WHERE s.service_order_id = ANY (coalesce(p_matched_equipo_ids, '{}'::uuid[]))
      AND NOT (s.id = ANY (coalesce(p_matched_series_ids, '{}'::uuid[])))
      AND coalesce(s.sap_status, '') IS DISTINCT FROM 'Validado';

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

REVOKE ALL ON FUNCTION public.sap_sync_matches_finalize(uuid, uuid, uuid[], uuid[], boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sap_sync_matches_finalize(uuid, uuid, uuid[], uuid[], boolean)
  TO service_role;

-- Camino compacto para archivos pequeños: misma exclusión.
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
  VALUES (
    v_upload_id,
    coalesce(p_file_info->>'user', 'Desconocido'),
    'Finalizado',
    now(),
    true
  )
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
  FROM jsonb_to_recordset(coalesce(p_validation_details, '[]'::jsonb)) AS x(
    equipo_id uuid, tipo_serie text, serie text, material text, descripcion text,
    centro text, almacen text, lote text, estado_sap text, valoracion text,
    coincidencia boolean
  )
  WHERE (
    x.equipo_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.service_orders so
      WHERE so.id = x.equipo_id
    )
  )
    AND (
      x.equipo_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.series sd
        WHERE sd.service_order_id = x.equipo_id
          AND sd.current_status::text = 'dispatched'
      )
    );

  UPDATE public.series s
  SET sap_status = 'Validado',
      sap_validation_id = v_session_id,
      material = coalesce(nullif(trim(m.material), ''), s.material),
      valuation = coalesce(nullif(trim(m.valuation), ''), s.valuation)
  FROM jsonb_to_recordset(coalesce(p_matched_series, '[]'::jsonb))
    AS m(id uuid, material text, valuation text)
  WHERE s.id = m.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.series sd
      WHERE sd.service_order_id = s.service_order_id
        AND sd.current_status::text = 'dispatched'
    );

  UPDATE public.service_orders so
  SET sap_integration_status = e.sap_integration_status,
      last_sap_sync = now()
  FROM jsonb_to_recordset(coalesce(p_matched_equipos, '[]'::jsonb))
    AS e(id uuid, sap_integration_status text)
  WHERE so.id = e.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.series sd
      WHERE sd.service_order_id = so.id
        AND sd.current_status::text = 'dispatched'
    );

  IF p_reset_unmatched THEN
    UPDATE public.service_orders so
    SET sap_integration_status = 'Sin Coincidencia',
        last_sap_sync = now()
    WHERE EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = so.id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM public.series sd
        WHERE sd.service_order_id = so.id
          AND sd.current_status::text = 'dispatched'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(coalesce(p_matched_equipos, '[]'::jsonb))
          AS e(id uuid, sap_integration_status text)
        WHERE e.id = so.id
      );
    GET DIAGNOSTICS v_equipos_unmatched = ROW_COUNT;

    UPDATE public.series s
    SET sap_status = 'Sin Coincidencia',
        sap_validation_id = v_session_id
    WHERE s.service_order_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.series sd
        WHERE sd.service_order_id = s.service_order_id
          AND sd.current_status::text = 'dispatched'
      )
      AND s.service_order_id = ANY (
        SELECT so.id
        FROM public.service_orders so
        WHERE so.sap_integration_status = 'Sin Coincidencia'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(coalesce(p_matched_series, '[]'::jsonb))
          AS m(id uuid, material text, valuation text)
        WHERE m.id = s.id
      );
    GET DIAGNOSTICS v_series_unmatched = ROW_COUNT;

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

REVOKE ALL ON FUNCTION public.sap_sync_matches_tx(jsonb, jsonb, jsonb, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sap_sync_matches_tx(jsonb, jsonb, jsonb, jsonb, jsonb, boolean)
  TO authenticated, service_role;

-- Reparación de falsos negativos existentes: conserva la validación histórica
-- obligatoria que permitió el despacho.
UPDATE public.service_orders so
SET sap_integration_status = 'Validado SAP'
WHERE so.sap_integration_status IS DISTINCT FROM 'Validado SAP'
  AND EXISTS (
    SELECT 1
    FROM public.series sd
    WHERE sd.service_order_id = so.id
      AND sd.current_status::text = 'dispatched'
  );

UPDATE public.series s
SET sap_status = 'Validado'
WHERE s.sap_status IS DISTINCT FROM 'Validado'
  AND EXISTS (
    SELECT 1
    FROM public.series sd
    WHERE sd.service_order_id = s.service_order_id
      AND sd.current_status::text = 'dispatched'
  );

COMMENT ON FUNCTION public.protect_dispatched_os_sap_status() IS
  'Impide reclasificar como Sin Coincidencia una OS ya despachada.';
COMMENT ON FUNCTION public.protect_dispatched_series_sap_status() IS
  'Conserva Validado en las series de una OS ya despachada.';

REVOKE ALL ON FUNCTION public.protect_dispatched_os_sap_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_dispatched_series_sap_status()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
