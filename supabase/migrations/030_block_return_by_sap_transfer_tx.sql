-- CHG-004: Devolución en bloque por Documento SAP — transacción atómica
-- Actualiza series + service_orders + sap_transfer_documents en una sola TX.

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

GRANT EXECUTE ON FUNCTION public.block_return_by_sap_transfer_tx(uuid, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.block_return_by_sap_transfer_tx IS
  'CHG-004: Devolución en bloque por Documento SAP en una transacción atómica.';
