-- SEC/TX-01 — sap_sync_tx: hace atómica la sincronización SAP.
--
-- Antes, /api/sap/sync ejecutaba ~6 escrituras secuenciales desde el cliente sin
-- transacción (upload, sesión, update de sesiones, detalles, service_orders, series).
-- Un fallo a mitad dejaba datos parciales y los errores de lotes se tragaban.
-- Esta función envuelve todo en una sola transacción (rollback total ante error) y
-- usa operaciones set-based (más rápidas que el loop anterior). Los detalles con
-- equipo_id huérfano se filtran para no abortar toda la sincronización.

CREATE OR REPLACE FUNCTION public.sap_sync_tx(
  p_file_info jsonb,
  p_results jsonb,
  p_validation_details jsonb DEFAULT '[]'::jsonb,
  p_equipos_updates jsonb DEFAULT '[]'::jsonb,
  p_series_updates jsonb DEFAULT '[]'::jsonb
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
  -- 1) Registro de carga
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

  -- 2) Sesión de validación
  INSERT INTO public.sap_validation_sessions (upload_id, usuario, estado, fecha_fin, activa)
  VALUES (v_upload_id, coalesce(p_file_info->>'user', 'Desconocido'), 'Finalizado', now(), true)
  RETURNING id INTO v_session_id;

  -- 3) Desactivar sesiones previas
  UPDATE public.sap_validation_sessions
  SET activa = false
  WHERE id <> v_session_id;

  -- 4) Insertar detalles (filtrando equipo_id huérfano para no romper la transacción)
  INSERT INTO public.sap_validation_details (
    validation_id, equipo_id, tipo_serie, serie, material, descripcion,
    centro, almacen, lote, estado_sap, valoracion, coincidencia
  )
  SELECT
    v_session_id, x.equipo_id, x.tipo_serie, x.serie, x.material, x.descripcion,
    x.centro, x.almacen, x.lote, x.estado_sap, x.valoracion, coalesce(x.coincidencia, false)
  FROM jsonb_to_recordset(p_validation_details) AS x(
    equipo_id uuid, tipo_serie text, serie text, material text, descripcion text,
    centro text, almacen text, lote text, estado_sap text, valoracion text, coincidencia boolean
  )
  WHERE x.equipo_id IS NULL
     OR EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = x.equipo_id);

  -- 5) Actualizar service_orders (equipos)
  UPDATE public.service_orders so
  SET sap_integration_status = e.sap_integration_status,
      last_sap_sync = now()
  FROM jsonb_to_recordset(p_equipos_updates) AS e(id uuid, sap_integration_status text)
  WHERE so.id = e.id;

  -- 6) Actualizar series
  UPDATE public.series s
  SET sap_status = u.sap_status,
      sap_validation_id = v_session_id
  FROM jsonb_to_recordset(p_series_updates) AS u(id uuid, sap_status text)
  WHERE s.id = u.id;

  RETURN jsonb_build_object('session_id', v_session_id, 'upload_id', v_upload_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sap_sync_tx(jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
