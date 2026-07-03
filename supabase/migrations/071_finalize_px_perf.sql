-- 071: Finalizar recepción PX con muchos equipos (evita statement timeout)
-- 938 equipos × loop fila-a-fila superaba el límite de Supabase (~8s).

CREATE INDEX IF NOT EXISTS idx_service_orders_main_serial_upper
  ON public.service_orders (upper(main_serial));

CREATE OR REPLACE FUNCTION public.finalize_px_reception_tx(
  p_reception_id uuid,
  p_expected_version integer,
  p_variance_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box record;
  v_new_box_code text;
  v_total_captured integer := 0;
  v_total_expected integer := 0;
  v_variance integer;
  v_is_partial boolean := false;
  v_assigned boolean;
BEGIN
  -- Recepciones grandes (cientos de equipos) necesitan más tiempo que el default de Supabase.
  PERFORM set_config('statement_timeout', '300s', true);

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;

  IF (v_rec.version IS NOT NULL AND v_rec.version <> p_expected_version) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepción fue modificada por otro usuario.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object(
      'reception_id', v_rec.id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'received_units', coalesce(v_rec.received_units, 0),
      'expected_units', coalesce(v_rec.expected_units, 0),
      'is_partial', false,
      'already_finalized', true
    );
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no puede finalizarse en estado %.', v_rec.status;
  END IF;

  SELECT count(*)::integer INTO v_total_captured
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_total_captured = 0 THEN
    RAISE EXCEPTION 'RECEPTION_EMPTY: No hay equipos capturados para finalizar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      )
      AND b.status::text NOT IN ('cerrada', 'closed')
  ) THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Debe cerrar todas las cajas con equipos antes de finalizar.';
  END IF;

  SELECT coalesce(sum(coalesce(b.declared_quantity, b.capacity, 0)), 0)::integer INTO v_total_expected
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    );

  v_variance := v_total_expected - v_total_captured;
  IF v_variance > 0 THEN
    v_is_partial := true;
    IF trim(coalesce(p_variance_reason, '')) = '' THEN
      RAISE EXCEPTION 'VARIANCE_REASON_REQUIRED: Faltan % equipos vs declarado — indique motivo.', v_variance;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.reception_id = p_reception_id AND coalesce(b.is_partial_box, false)
  ) THEN
    v_is_partial := true;
  END IF;

  CREATE TEMP TABLE _px_reentry_counts (
    sn text PRIMARY KEY,
    cnt integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _px_reentry_counts (sn, cnt)
  SELECT upper(so.main_serial), count(*)::integer
  FROM public.service_orders so
  WHERE upper(so.main_serial) IN (
    SELECT upper(e.main_serial)
    FROM public.px_reception_equipment e
    WHERE e.reception_id = p_reception_id AND e.capture_status = 'active'
  )
  GROUP BY upper(so.main_serial);

  FOR v_box IN
    SELECT b.*
    FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      )
    ORDER BY b.created_at
  LOOP
    v_assigned := false;
    WHILE NOT v_assigned LOOP
      v_new_box_code := public.next_box_code();
      BEGIN
        UPDATE public.boxes SET
          box_code = v_new_box_code,
          rack_location = 'BODEGA_CENTRAL',
          status = 'closed'::public.box_status,
          capacity = coalesce(v_box.declared_quantity, v_box.capacity, 0),
          closed_at = now()
        WHERE id = v_box.id;
        v_assigned := true;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;

    CREATE TEMP TABLE _box_os_map (
      equipment_id uuid PRIMARY KEY,
      os_id uuid NOT NULL
    ) ON COMMIT DROP;

    WITH eq AS (
      SELECT
        e.*,
        coalesce(r.cnt, 0) + 1 AS reentry
      FROM public.px_reception_equipment e
      LEFT JOIN _px_reentry_counts r ON r.sn = upper(e.main_serial)
      WHERE e.box_id = v_box.id AND e.capture_status = 'active'
    ),
    ins AS (
      INSERT INTO public.service_orders (
        reception_id, model_id, brand_id, main_serial, reentry_count, status
      )
      SELECT
        p_reception_id,
        coalesce(eq.model_id, v_box.model_id),
        coalesce(eq.brand_id, v_box.brand_id),
        eq.main_serial,
        eq.reentry,
        'INGRESADO'
      FROM eq
      RETURNING id, main_serial
    )
    INSERT INTO _box_os_map (equipment_id, os_id)
    SELECT eq.id, ins.id
    FROM eq
    JOIN ins ON upper(ins.main_serial) = upper(eq.main_serial);

    INSERT INTO public.series (
      serial_number, brand_id, model_id, material,
      current_status, current_box_id, current_reception_id, service_order_id
    )
    SELECT
      s.sn,
      coalesce(e.brand_id, v_box.brand_id),
      coalesce(e.model_id, v_box.model_id),
      e.material,
      'in_central_warehouse',
      v_box.id,
      p_reception_id,
      m.os_id
    FROM public.px_reception_equipment e
    JOIN _box_os_map m ON m.equipment_id = e.id
    CROSS JOIN LATERAL (
      SELECT unnest(
        array_remove(
          ARRAY[
            upper(trim(coalesce(e.main_serial, ''))),
            upper(trim(coalesce(e.serial_s2, ''))),
            upper(trim(coalesce(e.serial_s3, ''))),
            upper(trim(coalesce(e.serial_s4, '')))
          ],
          ''
        )
      ) AS sn
    ) s
    WHERE e.box_id = v_box.id AND e.capture_status = 'active'
    ON CONFLICT (serial_number) DO UPDATE SET
      brand_id = EXCLUDED.brand_id,
      model_id = EXCLUDED.model_id,
      material = EXCLUDED.material,
      current_status = EXCLUDED.current_status,
      current_box_id = EXCLUDED.current_box_id,
      current_reception_id = EXCLUDED.current_reception_id,
      service_order_id = EXCLUDED.service_order_id,
      updated_at = now();

    UPDATE public.px_reception_equipment e SET
      capture_status = 'promoted',
      promoted_at = now(),
      promoted_service_order_id = m.os_id
    FROM _box_os_map m
    WHERE e.id = m.equipment_id;

    DROP TABLE _box_os_map;
  END LOOP;

  UPDATE public.receptions SET
    status = 'CLASIFICADA',
    received_units = v_total_captured,
    expected_units = v_total_expected,
    variance_units = CASE WHEN v_variance > 0 THEN v_variance ELSE NULL END,
    variance_reason = CASE WHEN v_variance > 0 THEN trim(p_variance_reason) ELSE NULL END,
    received_by = coalesce(v_rec.received_by, p_operator_id),
    version = coalesce(version, 1) + 1
  WHERE id = p_reception_id
  RETURNING * INTO v_rec;

  PERFORM public.px_log_activity(
    p_reception_id, NULL, 'reception_finalized',
    coalesce(p_operator_name, 'Operador') || ' finalizó ' || v_rec.guide_number,
    p_operator_id, p_operator_name,
    jsonb_build_object(
      'received_units', v_total_captured,
      'expected_units', v_total_expected,
      'is_partial', v_is_partial
    )
  );

  RETURN jsonb_build_object(
    'reception_id', v_rec.id,
    'guide_number', v_rec.guide_number,
    'status', v_rec.status,
    'received_units', v_total_captured,
    'expected_units', v_total_expected,
    'is_partial', v_is_partial
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_px_reception_tx(uuid, integer, text, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
