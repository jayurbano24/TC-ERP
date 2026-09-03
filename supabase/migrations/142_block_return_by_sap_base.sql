-- 142: Devolver Bloque SAP por Número SAP Base (atómico).
--
-- Ejemplo: 416104851-1 / -2 / -3 / -4 → base 416104851
-- Una sola transacción; si alguna serie no es devolvible, se cancela todo.
--
-- Reemplaza el cuerpo de block_return_by_sap_transfer_tx para operar
-- sobre TODOS los sap_transfer_documents con la misma base.

CREATE OR REPLACE FUNCTION public.sap_document_base(p_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN nullif(trim(p_doc), '') IS NULL THEN NULL
    WHEN trim(p_doc) ~ '-\d+$' THEN regexp_replace(trim(p_doc), '-\d+$', '')
    ELSE trim(p_doc)
  END;
$$;

REVOKE ALL ON FUNCTION public.sap_document_base(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sap_document_base(text) TO authenticated, service_role;

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
  v_seed public.sap_transfer_documents%ROWTYPE;
  v_base text;
  v_doc_ids uuid[];
  v_doc_numbers text[];
  v_invalid_count integer;
  v_invalid_status text;
  v_series_updated integer := 0;
  v_units_count integer := 0;
  v_docs_count integer := 0;
  v_return_note text;
  v_now timestamptz := now();
  v_os_id uuid;
  v_motivo text := nullif(trim(COALESCE(p_motivo, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.app_assert_any_role('admin', 'supervisor');

  IF p_sap_transfer_id IS NULL THEN
    RAISE EXCEPTION 'Documento SAP no indicado.';
  END IF;

  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'El motivo de la devolución es obligatorio.';
  END IF;

  SELECT * INTO v_seed
  FROM public.sap_transfer_documents
  WHERE id = p_sap_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento SAP no encontrado.';
  END IF;

  v_base := public.sap_document_base(v_seed.sap_document_number);
  IF v_base IS NULL OR v_base = '' THEN
    RAISE EXCEPTION 'Número SAP Base inválido.';
  END IF;

  -- Lock de todos los documentos del bloque (misma base), orden estable anti-deadlock
  PERFORM 1
  FROM public.sap_transfer_documents
  WHERE public.sap_document_base(sap_document_number) = v_base
  ORDER BY id
  FOR UPDATE;

  SELECT
    COALESCE(array_agg(d.id ORDER BY d.sap_document_number), ARRAY[]::uuid[]),
    COALESCE(array_agg(d.sap_document_number ORDER BY d.sap_document_number), ARRAY[]::text[])
  INTO v_doc_ids, v_doc_numbers
  FROM public.sap_transfer_documents d
  WHERE public.sap_document_base(d.sap_document_number) = v_base;

  v_docs_count := COALESCE(cardinality(v_doc_ids), 0);

  IF v_docs_count = 0 THEN
    RAISE EXCEPTION 'No se encontraron documentos SAP para la base %.', v_base;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.series WHERE sap_transfer_id = ANY (v_doc_ids)
  ) THEN
    RAISE EXCEPTION 'No hay equipos asociados al bloque SAP %.', v_base;
  END IF;

  -- Validación: si alguna serie del bloque no es devolvible → aborta toda la TX
  SELECT COUNT(*)::integer, MIN(s.current_status::text)
  INTO v_invalid_count, v_invalid_status
  FROM public.series s
  WHERE s.sap_transfer_id = ANY (v_doc_ids)
    AND lower(s.current_status::text) NOT IN (
      'recepcionado_bodega_general',
      'pendiente_ingreso_bodega',
      'in_central_warehouse',
      'ingresado_bodega',
      'returned'
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'Devolución Bloque SAP %: % serie(s) en estado no permitido (%). Operación cancelada.',
      v_base, v_invalid_count, COALESCE(v_invalid_status, 'desconocido');
  END IF;

  v_return_note :=
    '--- DEVOLUCIÓN BLOQUE SAP ---' || E'\n' ||
    'SAP Base: ' || v_base || E'\n' ||
    'Documentos: ' || array_to_string(v_doc_numbers, ', ') || E'\n' ||
    'Motivo: ' || v_motivo || E'\n' ||
    'Guía Salida: ' || COALESCE(p_guia_salida, '') || E'\n' ||
    'Cat: BODEGA DEVOLUCIÓN' || E'\n' ||
    'Estatus: Devolución' || E'\n' ||
    'Usuario: ' || COALESCE(p_user, '') || E'\n' ||
    'Fecha: ' || to_char(v_now AT TIME ZONE 'America/Guatemala', 'DD/MM/YYYY, HH12:MI:SS AM');

  IF p_observaciones IS NOT NULL AND trim(p_observaciones) <> '' THEN
    v_return_note := v_return_note || E'\n' || 'Observaciones: ' || trim(p_observaciones);
  END IF;

  UPDATE public.series s
  SET
    current_status = 'returned',
    current_box_id = NULL,
    notes = v_return_note,
    updated_at = v_now
  WHERE s.sap_transfer_id = ANY (v_doc_ids)
    AND lower(s.current_status::text) IN (
      'recepcionado_bodega_general',
      'pendiente_ingreso_bodega',
      'in_central_warehouse',
      'ingresado_bodega'
    );

  GET DIAGNOSTICS v_series_updated = ROW_COUNT;

  UPDATE public.service_orders so
  SET
    status = 'DEVUELTO',
    closed_at = coalesce(so.closed_at, v_now)
  WHERE so.id IN (
    SELECT DISTINCT s.service_order_id
    FROM public.series s
    WHERE s.sap_transfer_id = ANY (v_doc_ids)
      AND s.service_order_id IS NOT NULL
  )
  AND NOT public.service_order_status_is_closed(so.status);

  UPDATE public.sap_transfer_documents
  SET
    status = 'DEVUELTO_BLOQUE',
    updated_at = v_now
  WHERE id = ANY (v_doc_ids);

  FOR v_os_id IN
    SELECT DISTINCT s.service_order_id
    FROM public.series s
    WHERE s.sap_transfer_id = ANY (v_doc_ids)
      AND s.service_order_id IS NOT NULL
  LOOP
    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);
  END LOOP;

  SELECT COUNT(DISTINCT s.service_order_id)::integer
  INTO v_units_count
  FROM public.series s
  WHERE s.sap_transfer_id = ANY (v_doc_ids)
    AND s.service_order_id IS NOT NULL;

  -- Auditoría atómica (misma TX)
  INSERT INTO public.erp_audit_logs (
    user_id,
    user_role,
    module,
    table_name,
    record_id,
    action,
    severity,
    new_values,
    observations,
    user_agent
  ) VALUES (
    auth.uid(),
    'supervisor',
    'Logística',
    'sap_transfer_documents',
    v_base,
    'DEVOLUCION_BLOQUE_SAP',
    'INFO'::public.audit_severity,
    jsonb_build_object(
      'sap_base', v_base,
      'documents', v_doc_numbers,
      'documents_count', v_docs_count,
      'units_count', COALESCE(v_units_count, 0),
      'series_updated', COALESCE(v_series_updated, 0),
      'motivo', v_motivo,
      'guia_salida', p_guia_salida,
      'usuario', p_user,
      'seed_sap_transfer_id', p_sap_transfer_id
    ),
    format(
      'Devolución Bloque SAP base %s · %s documento(s) · %s equipo(s) · Motivo: %s',
      v_base, v_docs_count, COALESCE(v_units_count, 0), v_motivo
    ),
    'block_return_by_sap_transfer_tx'
  );

  RETURN jsonb_build_object(
    'units_count', COALESCE(v_units_count, 0),
    'series_updated', COALESCE(v_series_updated, 0),
    'sap_document_number', v_seed.sap_document_number,
    'sap_base', v_base,
    'documents', to_jsonb(v_doc_numbers),
    'documents_count', v_docs_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_return_by_sap_transfer_tx(uuid, text, text, text, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.block_return_by_sap_transfer_tx(uuid, text, text, text, text)
  FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
