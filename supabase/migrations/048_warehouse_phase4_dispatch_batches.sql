-- Fase 4 Bodega / outbound-dispatch: dispatch_batches (CHG-010)
-- Lote de salida opcional; despachos legacy siguen funcionando sin lote.

CREATE SEQUENCE IF NOT EXISTS public.dispatch_batch_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

CREATE OR REPLACE FUNCTION public.next_dispatch_batch_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'LS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.dispatch_batch_seq')::text, 5, '0');
$$;

CREATE TABLE IF NOT EXISTS public.dispatch_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ABIERTO'
    CHECK (status IN ('ABIERTO', 'CERRADO', 'DESPACHADO')),
  destination text,
  guide_outbound text,
  opened_by uuid REFERENCES public.profiles(id),
  opened_by_name text,
  closed_at timestamptz,
  document_center_ref text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabla legacy previa puede existir sin estas columnas (CREATE IF NOT EXISTS no las agrega)
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS opened_by_name text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS guide_outbound text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS document_center_ref text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_dispatch_batches_status ON public.dispatch_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_batches_number ON public.dispatch_batches(batch_number);

ALTER TABLE public.dispatches ADD COLUMN IF NOT EXISTS dispatch_batch_id uuid REFERENCES public.dispatch_batches(id);
ALTER TABLE public.dispatches ADD COLUMN IF NOT EXISTS box_id uuid REFERENCES public.boxes(id);
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS last_dispatch_batch_id uuid REFERENCES public.dispatch_batches(id);

CREATE INDEX IF NOT EXISTS idx_dispatches_batch ON public.dispatches(dispatch_batch_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_box ON public.dispatches(box_id);

ALTER TABLE public.dispatch_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_batches_auth ON public.dispatch_batches;
CREATE POLICY dispatch_batches_auth ON public.dispatch_batches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Abrir lote de salida
CREATE OR REPLACE FUNCTION public.dispatch_batch_open_tx(
  p_destination text DEFAULT NULL,
  p_guide_outbound text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'Operador',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
BEGIN
  v_number := public.next_dispatch_batch_number();
  INSERT INTO public.dispatch_batches (
    batch_number, status, destination, guide_outbound,
    opened_by, opened_by_name, notes
  ) VALUES (
    v_number, 'ABIERTO', nullif(trim(p_destination), ''), nullif(trim(p_guide_outbound), ''),
    p_operator_id, p_operator_name, p_notes
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('batch_id', v_id, 'batch_number', v_number, 'status', 'ABIERTO');
END;
$$;

-- Cerrar lote (todas las cajas del lote deben estar despachadas)
CREATE OR REPLACE FUNCTION public.dispatch_batch_close_tx(
  p_batch_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'Operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.dispatch_batches%ROWTYPE;
  v_pending integer;
BEGIN
  SELECT * INTO v_batch FROM public.dispatch_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Lote no encontrado.'; END IF;
  IF v_batch.status <> 'ABIERTO' THEN
    RAISE EXCEPTION 'INVALID_STATE: El lote no está abierto.';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.dispatches d
  INNER JOIN public.boxes b ON b.id = d.box_id
  WHERE d.dispatch_batch_id = p_batch_id
    AND coalesce(b.rack_location, '') <> 'DESPACHO';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'PENDING_BOXES: Hay % caja(s) del lote sin despachar.', v_pending;
  END IF;

  UPDATE public.dispatch_batches
  SET status = 'CERRADO', closed_at = now(), updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'CERRADO');
END;
$$;

-- Parche salida completa: vincular lote opcional
CREATE OR REPLACE FUNCTION public.warehouse_salida_tx(
  p_box_id uuid,
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
  v_dispatch_id uuid;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id ORDER BY created_at) INTO v_series_ids
  FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_BOX: La caja no tiene series.';
  END IF;

  UPDATE public.series
  SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
  WHERE current_box_id = p_box_id;

  UPDATE public.boxes SET rack_location = 'DESPACHO', last_dispatch_batch_id = p_dispatch_batch_id
  WHERE id = p_box_id;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'single_box'::public.dispatch_type,
    coalesce(nullif(trim(p_guide_number), ''), p_destination),
    p_operator_id,
    p_destination,
    p_dispatch_batch_id,
    p_box_id
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, coalesce(nullif(trim(p_guide_number), ''), p_destination),
    v_series_ids, 'Despacho caja completa', p_idempotency_key
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1)
  );
END;
$$;

-- Parche salida parcial: lote opcional
CREATE OR REPLACE FUNCTION public.warehouse_salida_parcial_tx(
  p_box_id uuid,
  p_serial_numbers text[],
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_dispatch_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_sn text;
  v_series_ids uuid[] := '{}';
  v_dispatch_id uuid;
  v_remaining integer;
  v_s_id uuid;
BEGIN
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe indicar al menos una serie.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;

    SELECT id INTO v_s_id
    FROM public.series
    WHERE upper(serial_number) = v_sn AND current_box_id = p_box_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERIE_NOT_IN_BOX: % no pertenece a la caja %', v_sn, v_box.box_code;
    END IF;

    UPDATE public.series
    SET current_status = 'dispatched', current_box_id = NULL, updated_at = now()
    WHERE id = v_s_id;

    v_series_ids := array_append(v_series_ids, v_s_id);
  END LOOP;

  IF array_length(v_series_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES_UPDATED: Ninguna serie pudo despacharse.';
  END IF;

  INSERT INTO public.dispatches (dispatch_type, guide_number, dispatched_by, notes, dispatch_batch_id, box_id)
  VALUES (
    'individual'::public.dispatch_type,
    coalesce(nullif(trim(p_guide_number), ''), p_destination, ''),
    p_operator_id,
    coalesce(p_notes, p_destination),
    p_dispatch_batch_id,
    p_box_id
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.dispatch_items (dispatch_id, series_id, box_id)
  SELECT v_dispatch_id, unnest(v_series_ids), p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, coalesce(nullif(trim(p_guide_number), ''), p_destination, 'DESPACHO'),
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, v_box.reception_id, coalesce(nullif(trim(p_guide_number), ''), p_destination),
    v_series_ids, 'Despacho parcial por series', p_idempotency_key
  );

  SELECT count(*) INTO v_remaining FROM public.series WHERE current_box_id = p_box_id;
  IF v_remaining = 0 THEN
    UPDATE public.boxes
    SET rack_location = 'DESPACHO', last_dispatch_batch_id = coalesce(p_dispatch_batch_id, last_dispatch_batch_id)
    WHERE id = p_box_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_batch_id', p_dispatch_batch_id,
    'series_count', array_length(v_series_ids, 1),
    'box_empty', v_remaining = 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_dispatch_batch_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_batch_open_tx(text, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_batch_close_tx(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_parcial_tx(uuid, text[], text, text, uuid, text, text, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
