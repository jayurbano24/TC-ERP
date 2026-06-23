-- Fase 2 Bodega Central: warehouse_movements + RPCs + historial + create_bodega_box_tx log
-- Idempotente: seguro re-ejecutar en staging/prod.

-- 042: tabla (si falta) + columnas legacy
CREATE TABLE IF NOT EXISTS public.warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  movement_type text NOT NULL CHECK (movement_type IN ('INGRESO', 'SALIDA', 'TRASLADO', 'DISPERSION_CAJA')),
  source_module text NOT NULL,
  target_module text,
  source_location text,
  target_location text,
  performed_by uuid REFERENCES public.profiles(id),
  performed_by_name text,
  box_id uuid REFERENCES public.boxes(id),
  box_code text,
  reception_id uuid REFERENCES public.receptions(id),
  guide_number text,
  reference_doc text,
  series_ids uuid[] DEFAULT '{}',
  series_count integer NOT NULL DEFAULT 0,
  reason text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  dispatch_id uuid REFERENCES public.dispatches(id),
  audit_log_id uuid REFERENCES public.erp_audit_logs(id),
  idempotency_key uuid UNIQUE
);

ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS reference_doc text;
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS guide_number text;
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS reception_id uuid REFERENCES public.receptions(id);
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.dispatches(id);
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS audit_log_id uuid REFERENCES public.erp_audit_logs(id);
ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS idempotency_key uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_series_count_match'
  ) THEN
    ALTER TABLE public.warehouse_movements
      ADD CONSTRAINT chk_series_count_match
      CHECK (series_count = coalesce(array_length(series_ids, 1), 0));
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_wh_movements_box ON public.warehouse_movements(box_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_movements_type ON public.warehouse_movements(movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_movements_series ON public.warehouse_movements USING GIN (series_ids);
CREATE INDEX IF NOT EXISTS idx_wh_movements_reception ON public.warehouse_movements(reception_id);

ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_movements_auth ON public.warehouse_movements;
CREATE POLICY warehouse_movements_auth ON public.warehouse_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 043: RPCs
CREATE OR REPLACE FUNCTION public.warehouse_log_movement_internal(
  p_movement_type text,
  p_source_module text,
  p_target_module text,
  p_source_location text,
  p_target_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_box_id uuid,
  p_box_code text,
  p_reception_id uuid,
  p_guide_number text,
  p_series_ids uuid[],
  p_reason text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
BEGIN
  INSERT INTO public.warehouse_movements (
    movement_type, source_module, target_module,
    source_location, target_location,
    performed_by, performed_by_name,
    box_id, box_code, reception_id, guide_number,
    series_ids, series_count, reason, idempotency_key
  ) VALUES (
    p_movement_type, p_source_module, p_target_module,
    p_source_location, p_target_location,
    p_operator_id, p_operator_name,
    p_box_id, p_box_code, p_reception_id, p_guide_number,
    p_series_ids, coalesce(array_length(p_series_ids, 1), 0),
    p_reason, p_idempotency_key
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_ingreso_tx(
  p_series text[],
  p_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_source_module text DEFAULT 'bodega_manual',
  p_reason text DEFAULT 'Ingreso directo manual',
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_code text;
  v_box_id uuid;
  v_series_ids uuid[] := '{}';
  v_sn text;
  v_s_row record;
BEGIN
  v_box_code := public.next_box_code();
  INSERT INTO public.boxes (box_code, rack_location, status, capacity)
  VALUES (v_box_code, p_location, 'closed'::public.box_status, array_length(p_series, 1))
  RETURNING id INTO v_box_id;

  FOREACH v_sn IN ARRAY p_series LOOP
    SELECT * INTO v_s_row FROM public.series WHERE serial_number = v_sn FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.series (serial_number, current_status, current_box_id)
      VALUES (v_sn, 'in_central_warehouse', v_box_id)
      RETURNING id INTO v_s_row.id;
    ELSE
      IF v_s_row.current_box_id IS NOT NULL THEN
         RAISE EXCEPTION 'DUPLICATE_ASSIGNMENT: Serie % ya está en otra caja', v_sn;
      END IF;
      UPDATE public.series
      SET current_status = 'in_central_warehouse', current_box_id = v_box_id
      WHERE id = v_s_row.id;
    END IF;
    v_series_ids := array_append(v_series_ids, v_s_row.id);
  END LOOP;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', p_source_module, 'bodega_central',
    'EXTERNO', p_location,
    p_operator_id, p_operator_name,
    v_box_id, v_box_code, NULL, NULL,
    v_series_ids, p_reason, p_idempotency_key
  );

  RETURN jsonb_build_object('box_id', v_box_id, 'box_code', v_box_code, 'series_count', array_length(p_series, 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_salida_tx(
  p_box_id uuid,
  p_destination text,
  p_guide_number text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id) INTO v_series_ids FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;

  UPDATE public.boxes SET rack_location = 'DESPACHO' WHERE id = p_box_id;
  UPDATE public.series SET current_status = 'dispatched' WHERE current_box_id = p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'SALIDA', 'bodega_central', 'despacho',
    v_box.rack_location, 'DESPACHO',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, p_guide_number,
    coalesce(v_series_ids, '{}'), 'Despacho cliente', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_traslado_tx(
  p_box_id uuid,
  p_target_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id) INTO v_series_ids FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;
  UPDATE public.boxes SET rack_location = p_target_location WHERE id = p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'TRASLADO', 'bodega_central', 'bodega_central',
    v_box.rack_location, p_target_location,
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    coalesce(v_series_ids, '{}'), 'Traslado de ubicación', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_dispersion_tx(
  p_box_id uuid,
  p_target_module text,
  p_operator_id uuid,
  p_operator_name text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_series_ids uuid[];
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  SELECT array_agg(id) INTO v_series_ids FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;

  UPDATE public.series
  SET current_box_id = NULL, current_status = 'in_workshop'
  WHERE current_box_id = p_box_id;

  UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = p_box_id;

  PERFORM public.warehouse_log_movement_internal(
    'DISPERSION_CAJA', 'bodega_central', p_target_module,
    v_box.rack_location, 'TALLER',
    p_operator_id, p_operator_name,
    v_box.id, v_box.box_code, NULL, NULL,
    coalesce(v_series_ids, '{}'), 'Dispersión a taller', p_idempotency_key
  );

  RETURN jsonb_build_object('success', true, 'series_count', array_length(v_series_ids, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_ingreso_tx(text[], text, uuid, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_salida_tx(uuid, text, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_traslado_tx(uuid, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_dispersion_tx(uuid, text, uuid, text, uuid) TO authenticated, service_role;

-- 044: historial
CREATE OR REPLACE FUNCTION public.warehouse_get_box_history(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(m) ORDER BY m.ts DESC)
  INTO v_history
  FROM (
    SELECT
      movement_type,
      source_module,
      target_module,
      source_location,
      target_location,
      performed_by_name AS user_name,
      created_at AS ts,
      created_at AS timestamp,
      series_count,
      reason
    FROM public.warehouse_movements
    WHERE box_id = p_box_id
  ) m;

  RETURN coalesce(v_history, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_get_box_history(uuid) TO authenticated, service_role;

-- 045: create_bodega_box_tx con log de movimiento
CREATE OR REPLACE FUNCTION public.create_bodega_box_tx(
  p_reception_id uuid,
  p_brand_id uuid,
  p_model_id uuid,
  p_capacity integer,
  p_rack_location text DEFAULT 'P-01',
  p_serial_numbers text[] DEFAULT '{}'::text[],
  p_box_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_code text;
  v_box_id uuid;
  v_sn text;
  v_linked integer := 0;
  v_assigned boolean := false;
  v_operator_id uuid;
BEGIN
  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'RECEPTION_REQUIRED: Falta recepción de origen.';
  END IF;
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe escanear al menos una serie.';
  END IF;

  IF p_box_code IS NOT NULL AND trim(p_box_code) ~ '^BOX-[0-9]+$' THEN
    BEGIN
      v_box_code := upper(trim(p_box_code));
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location
      ) VALUES (
        p_reception_id,
        v_box_code,
        p_brand_id,
        p_model_id,
        greatest(coalesce(p_capacity, 0), 1),
        'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01')
      )
      RETURNING id INTO v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      v_assigned := false;
    END;
  END IF;

  WHILE NOT v_assigned LOOP
    v_box_code := public.next_box_code();
    BEGIN
      INSERT INTO public.boxes (
        reception_id, box_code, brand_id, model_id, capacity, status, rack_location
      ) VALUES (
        p_reception_id,
        v_box_code,
        p_brand_id,
        p_model_id,
        greatest(coalesce(p_capacity, 0), 1),
        'open',
        coalesce(nullif(trim(p_rack_location), ''), 'P-01')
      )
      RETURNING id INTO v_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;
    UPDATE public.series SET
      current_box_id = v_box_id,
      current_status = 'in_central_warehouse',
      updated_at = now()
    WHERE upper(serial_number) = v_sn;
    IF FOUND THEN
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  IF v_linked = 0 THEN
    UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = v_box_id;
    RAISE EXCEPTION 'NO_SERIES_LINKED: Ninguna serie pudo vincularse. Verifique clasificación Backoffice/PX.';
  END IF;

  BEGIN
    v_operator_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator_id := NULL;
  END;

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', 'bodega_recepcion', 'bodega_central',
    'EXTERNO', coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
    v_operator_id, 'Operador (Recepción)',
    v_box_id, v_box_code, p_reception_id, NULL,
    NULL, 'Ingreso consolidado en caja desde CAC/PX', NULL
  );

  RETURN jsonb_build_object(
    'box_id', v_box_id,
    'box_code', v_box_code,
    'series_linked', v_linked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bodega_box_tx(uuid, uuid, uuid, integer, text, text[], text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
