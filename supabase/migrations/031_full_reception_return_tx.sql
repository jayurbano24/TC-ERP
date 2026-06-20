-- CHG-005: Devolución de lote completo (recepción) — transacción atómica
-- Actualiza todas las series + recepción en una sola TX.

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

GRANT EXECUTE ON FUNCTION public.full_reception_return_tx(uuid, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.full_reception_return_tx IS
  'CHG-005: Devolución de lote completo (recepción) en una transacción atómica.';
