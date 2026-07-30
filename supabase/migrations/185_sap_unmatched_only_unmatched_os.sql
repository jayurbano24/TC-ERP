-- 185: Sin Coincidencia solo en series de OS sin match.
-- Antes: al validar S1 de un equipo, S2/S3/MAC hermanas quedaban "Sin Coincidencia"
-- aunque el OS estaba "Validado SAP" → 43k series ruidosas vs 2.3k equipos reales.

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
    -- 1) Equipos sin ninguna serie en el G985
    UPDATE public.service_orders so
    SET sap_integration_status = 'Sin Coincidencia',
        last_sap_sync = now()
    WHERE EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
    )
    AND NOT (so.id = ANY (coalesce(p_matched_equipo_ids, '{}'::uuid[])));
    GET DIAGNOSTICS v_equipos_unmatched = ROW_COUNT;

    -- 2) Series: solo las de esos OS sin match (no hermanas de OS ya validados)
    UPDATE public.series s
    SET sap_status = 'Sin Coincidencia',
        sap_validation_id = p_session_id
    WHERE s.service_order_id IS NOT NULL
      AND s.service_order_id = ANY (
        SELECT so.id
        FROM public.service_orders so
        WHERE so.sap_integration_status = 'Sin Coincidencia'
          AND EXISTS (SELECT 1 FROM public.series sx WHERE sx.service_order_id = so.id)
          AND NOT (so.id = ANY (coalesce(p_matched_equipo_ids, '{}'::uuid[])))
      )
      AND NOT (s.id = ANY (coalesce(p_matched_series_ids, '{}'::uuid[])));
    GET DIAGNOSTICS v_series_unmatched = ROW_COUNT;

    -- 3) Hermanas de OS matched: alinear a Validado (no dejar Sin Coincidencia)
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

-- Reparación one-shot del ruido actual
DO $$
DECLARE
  v_fixed int;
BEGIN
  -- Hermanas de OS Validado / Pendiente Revisión → Validado
  UPDATE public.series s
  SET sap_status = 'Validado'
  FROM public.service_orders so
  WHERE s.service_order_id = so.id
    AND so.sap_integration_status IN ('Validado SAP', 'Pendiente Revisión')
    AND s.sap_status = 'Sin Coincidencia';
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE '185: series hermanas realineadas a Validado: %', v_fixed;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'internal') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION internal.sap_sync_matches_finalize(
        p_upload_id uuid, p_session_id uuid, p_matched_series_ids uuid[], p_matched_equipo_ids uuid[], p_reset_unmatched boolean
      ) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
      AS $s$ SELECT public.sap_sync_matches_finalize(p_upload_id, p_session_id, p_matched_series_ids, p_matched_equipo_ids, p_reset_unmatched) $s$
    $fn$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION internal.sap_sync_matches_finalize(uuid, uuid, uuid[], uuid[], boolean) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
