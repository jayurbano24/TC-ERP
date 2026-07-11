-- =============================================================================
-- 104 — RPC authz: helper + CHG en devoluciones (browser JWT)
-- =============================================================================
-- Contexto (ADR-011 §11.9): la mayoría de escrituras van por service_role en API;
-- el borde HTTP ya tiene logOnlyRoleCheck. Las devoluciones (y bodega) invocan
-- *_tx desde el browser con JWT de usuario → sí hace falta assert en el cuerpo.
--
-- app_assert_any_role:
--   * service_role / sin JWT de usuario en rol de servicio → no-op
--   * sin auth.uid() (anon) → FORBIDDEN
--   * sin rol → WARNING log-only; EXCEPTION solo si app.enforce_rpc_roles = 'on'
--
-- Activar enforce (después de observar WARNINGs):
--   ALTER ROLE authenticator SET app.enforce_rpc_roles = 'on';
--   (o SET LOCAL en sesión de prueba)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.app_assert_any_role(VARIADIC p_roles public.app_role[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  allowed boolean := false;
  r public.app_role;
BEGIN
  -- Llamadas server-side con service_role (PostgREST) o SQL como owner.
  IF jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF public.app_is_admin() THEN
    RETURN;
  END IF;

  FOREACH r IN ARRAY p_roles
  LOOP
    IF public.app_has_role(r) THEN
      allowed := true;
      EXIT;
    END IF;
  END LOOP;

  IF allowed THEN
    RETURN;
  END IF;

  RAISE WARNING '[AUTHZ_RPC_LOGONLY] deny uid=% required=%',
    auth.uid(), p_roles;

  IF coalesce(current_setting('app.enforce_rpc_roles', true), '') = 'on' THEN
    RAISE EXCEPTION 'FORBIDDEN: insufficient role'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.app_assert_any_role(public.app_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_any_role(public.app_role[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.app_assert_any_role(public.app_role[]) IS
  'CHG-006: assert rol operacional en RPCs invocadas con JWT de usuario. Log-only salvo app.enforce_rpc_roles=on.';

-- ---------------------------------------------------------------------------
-- block_return_by_sap_transfer_tx (cuerpo vigente = 033 + assert)
-- ---------------------------------------------------------------------------
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

  PERFORM public.app_assert_any_role('admin', 'supervisor');

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

-- ---------------------------------------------------------------------------
-- full_reception_return_tx (+ assert)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.full_reception_return_tx(
  p_reception_id uuid,
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
  v_reception public.receptions%ROWTYPE;
  v_series_count integer;
  v_series_header text;
  v_rec_block text;
  v_now timestamptz := now();
  v_fecha text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.app_assert_any_role('admin', 'supervisor');

  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'Recepción no indicada.';
  END IF;

  SELECT * INTO v_reception
  FROM public.receptions
  WHERE id = p_reception_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recepción no encontrada';
  END IF;

  SELECT COUNT(*)::integer INTO v_series_count
  FROM public.series
  WHERE current_reception_id = p_reception_id;

  IF v_series_count = 0 THEN
    RAISE EXCEPTION 'No se encontraron equipos registrados para esta recepción. Solo se pueden devolver recepciones con equipos clasificados.';
  END IF;

  v_fecha := to_char(v_now AT TIME ZONE 'America/Guatemala', 'DD/MM/YYYY, HH12:MI:SS AM');

  v_series_header :=
    '--- DEVOLUCIÓN ---' || E'\n' ||
    'Motivo: ' || COALESCE(p_motivo, '') || E'\n' ||
    'Guía Salida: ' || COALESCE(p_guia_salida, '') || E'\n' ||
    'Cat: BODEGA DEVOLUCIÓN' || E'\n' || E'\n';

  UPDATE public.series
  SET
    current_status = 'returned',
    notes = v_series_header || COALESCE(notes, ''),
    updated_at = v_now
  WHERE current_reception_id = p_reception_id;

  v_rec_block :=
    '--- DEVOLUCIÓN ---' || E'\n' ||
    'Motivo: ' || COALESCE(p_motivo, '') || E'\n' ||
    'Guía de Salida: ' || COALESCE(p_guia_salida, '') || E'\n' ||
    'Fecha: ' || v_fecha || E'\n' ||
    'Usuario: ' || COALESCE(p_user, '') || E'\n' ||
    'Observaciones: ' || COALESCE(NULLIF(trim(p_observaciones), ''), 'N/A');

  UPDATE public.receptions
  SET
    status = 'DEVUELTO',
    notes = COALESCE(notes, '') || E'\n\n' || v_rec_block
  WHERE id = p_reception_id;

  RETURN jsonb_build_object(
    'series_count', v_series_count,
    'reception_id', p_reception_id,
    'guide_number', v_reception.guide_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_return_by_sap_transfer_tx(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.full_reception_return_tx(uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Auditoría rápida (ejecutar en SQL Editor; no modifica datos):
-- -----------------------------------------------------------------------------
-- select p.proname,
--        (p.prosrc ilike '%app_assert_any_role%' or p.prosrc ilike '%app_has_role%') as has_role_guard
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef and p.proname like '%\_tx' escape '\'
-- order by has_role_guard, p.proname;
-- =============================================================================
