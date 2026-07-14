-- 130: Pistoleo de caja persistido en BD (sobrevive corte de luz).
-- Caja temporal TMP-* en rack EN_PROCESO; cada serie se vincula al escanear.
-- Al finalizar se asigna BOX-{n} oficial y rack operativo.
-- Al cancelar se desvinculan series y la TMP queda ELIMINADO.

CREATE OR REPLACE FUNCTION public.bodega_start_or_append_scan_tx(
  p_box_id uuid,
  p_reception_id uuid,
  p_brand_id uuid,
  p_model_id uuid,
  p_capacity integer,
  p_serial_numbers text[],
  p_rack_location text DEFAULT 'EN_PROCESO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_id uuid := p_box_id;
  v_box_code text;
  v_sn text;
  v_linked integer := 0;
  v_series_ids uuid[] := '{}';
  v_s_id uuid;
  v_operator uuid;
  v_capacity integer := greatest(coalesce(p_capacity, 0), 1);
  v_equipos bigint;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  IF p_reception_id IS NULL THEN
    RAISE EXCEPTION 'RECEPTION_REQUIRED: Falta recepción de origen.';
  END IF;
  IF p_brand_id IS NULL OR p_model_id IS NULL THEN
    RAISE EXCEPTION 'CATALOG_REQUIRED: Marca y modelo son obligatorios.';
  END IF;
  IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'SERIES_REQUIRED: Debe escanear al menos una serie.';
  END IF;

  BEGIN
    v_operator := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator := NULL;
  END;

  IF v_box_id IS NULL THEN
    v_box_code := 'TMP-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.boxes (
      reception_id, box_code, brand_id, model_id, capacity, status, rack_location, assigned_operator_id
    ) VALUES (
      p_reception_id,
      v_box_code,
      p_brand_id,
      p_model_id,
      v_capacity,
      'open',
      coalesce(nullif(trim(p_rack_location), ''), 'EN_PROCESO'),
      v_operator
    )
    RETURNING id INTO v_box_id;
  ELSE
    SELECT b.id, b.box_code
      INTO v_box_id, v_box_code
    FROM public.boxes b
    WHERE b.id = p_box_id
      AND b.status::text = 'open'
      AND (
        upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
        OR b.box_code ILIKE 'TMP-%'
      )
    FOR UPDATE;

    IF v_box_id IS NULL THEN
      RAISE EXCEPTION 'DRAFT_NOT_FOUND: La caja en proceso no existe o ya fue finalizada.';
    END IF;

    UPDATE public.boxes
    SET
      capacity = v_capacity,
      brand_id = coalesce(p_brand_id, brand_id),
      model_id = coalesce(p_model_id, model_id),
      reception_id = coalesce(reception_id, p_reception_id),
      assigned_operator_id = coalesce(assigned_operator_id, v_operator)
    WHERE id = v_box_id;
  END IF;

  FOREACH v_sn IN ARRAY p_serial_numbers LOOP
    v_sn := upper(trim(v_sn));
    IF v_sn = '' THEN CONTINUE; END IF;

    UPDATE public.series SET
      current_box_id = v_box_id,
      current_status = 'in_central_warehouse',
      updated_at = now()
    WHERE upper(serial_number) = v_sn
      AND (
        current_box_id IS NULL
        OR current_box_id = v_box_id
      )
    RETURNING id INTO v_s_id;

    IF FOUND THEN
      v_linked := v_linked + 1;
      v_series_ids := array_append(v_series_ids, v_s_id);
    END IF;
  END LOOP;

  IF v_linked = 0 THEN
    -- Si acabamos de crear la TMP y no vinculó nada, limpiar
    IF p_box_id IS NULL THEN
      UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = v_box_id;
    END IF;
    RAISE EXCEPTION 'NO_SERIES_LINKED: Ninguna serie pudo vincularse (¿ya está en otra caja?).';
  END IF;

  SELECT count(DISTINCT coalesce(s.service_order_id, s.id))
    INTO v_equipos
  FROM public.series s
  WHERE s.current_box_id = v_box_id
    AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

  PERFORM public.warehouse_log_movement_internal(
    'INGRESO', 'bodega_recepcion', 'bodega_central',
    'EXTERNO', 'EN_PROCESO',
    v_operator, 'Operador (Pistoleo en proceso)',
    v_box_id, v_box_code, p_reception_id, NULL,
    v_series_ids, 'Pistoleo incremental — caja en proceso', NULL, NULL::jsonb
  );

  PERFORM public.warehouse_sync_sap_for_series(v_series_ids);

  RETURN jsonb_build_object(
    'box_id', v_box_id,
    'box_code', v_box_code,
    'series_linked', v_linked,
    'equipos_count', coalesce(v_equipos, 0),
    'capacity', v_capacity,
    'in_progress', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bodega_finalize_scan_tx(
  p_box_id uuid,
  p_rack_location text DEFAULT 'P-01'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box record;
  v_new_code text;
  v_linked integer;
  v_assigned boolean := false;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  SELECT *
    INTO v_box
  FROM public.boxes b
  WHERE b.id = p_box_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_NOT_FOUND';
  END IF;

  IF upper(coalesce(v_box.rack_location, '')) <> 'EN_PROCESO'
     AND v_box.box_code NOT ILIKE 'TMP-%' THEN
    RAISE EXCEPTION 'NOT_IN_PROGRESS: La caja ya no está en proceso.';
  END IF;

  SELECT count(*)::integer INTO v_linked
  FROM public.series s
  WHERE s.current_box_id = p_box_id;

  IF coalesce(v_linked, 0) = 0 THEN
    RAISE EXCEPTION 'EMPTY_BOX: No hay series para finalizar.';
  END IF;

  -- Si ya tiene BOX oficial (raro), solo mover rack
  IF v_box.box_code ~* '^BOX-[0-9]+$' THEN
    UPDATE public.boxes
    SET
      rack_location = coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
      status = 'open'
    WHERE id = p_box_id;
    RETURN jsonb_build_object(
      'box_id', p_box_id,
      'box_code', v_box.box_code,
      'series_linked', v_linked
    );
  END IF;

  WHILE NOT v_assigned LOOP
    v_new_code := public.next_box_code();
    BEGIN
      UPDATE public.boxes
      SET
        box_code = v_new_code,
        rack_location = coalesce(nullif(trim(p_rack_location), ''), 'P-01'),
        status = 'open'
      WHERE id = p_box_id;
      v_assigned := true;
    EXCEPTION WHEN unique_violation THEN
      v_assigned := false;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'box_id', p_box_id,
    'box_code', v_new_code,
    'series_linked', v_linked
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bodega_cancel_scan_tx(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box record;
  v_unlinked integer := 0;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_NOT_FOUND';
  END IF;

  IF upper(coalesce(v_box.rack_location, '')) <> 'EN_PROCESO'
     AND v_box.box_code NOT ILIKE 'TMP-%' THEN
    RAISE EXCEPTION 'NOT_IN_PROGRESS: Solo se pueden cancelar cajas TMP / EN_PROCESO.';
  END IF;

  UPDATE public.series
  SET
    current_box_id = NULL,
    current_status = 'RECEPCIONADO_BODEGA_GENERAL',
    updated_at = now()
  WHERE current_box_id = p_box_id;

  GET DIAGNOSTICS v_unlinked = ROW_COUNT;

  UPDATE public.boxes
  SET rack_location = 'ELIMINADO'
  WHERE id = p_box_id;

  RETURN jsonb_build_object(
    'box_id', p_box_id,
    'series_unlinked', v_unlinked,
    'cancelled', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_list_in_progress_boxes(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  box_id uuid,
  rack text,
  label text,
  series_count bigint,
  equipos_count bigint,
  capacity integer,
  sample_status text,
  sample_brand_id uuid,
  sample_model_id uuid,
  sample_service_order_id uuid,
  last_movement_at timestamptz,
  brand_id uuid,
  model_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.rack_location,
    b.box_code,
    cnt.series_count,
    cnt.equipos_count,
    b.capacity,
    samp.current_status::text,
    samp.brand_id,
    samp.model_id,
    samp.service_order_id,
    cnt.last_movement_at,
    b.brand_id,
    b.model_id,
    b.created_at
  FROM public.boxes b
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS series_count,
      count(DISTINCT coalesce(s.service_order_id, s.id))
        FILTER (
          WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
        )::bigint AS equipos_count,
      max(s.updated_at) AS last_movement_at
    FROM public.series s
    WHERE s.current_box_id = b.id
  ) cnt ON true
  LEFT JOIN LATERAL (
    SELECT
      s.current_status,
      s.brand_id,
      s.model_id,
      s.service_order_id
    FROM public.series s
    WHERE s.current_box_id = b.id
    ORDER BY s.created_at ASC
    LIMIT 1
  ) samp ON true
  WHERE b.status::text = 'open'
    AND (
      upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
      OR b.box_code ILIKE 'TMP-%'
    )
  ORDER BY coalesce(cnt.last_movement_at, b.created_at) DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- KPI: cajas_parciales = EN_PROCESO (pistoleo) + incompletas por capacidad
CREATE OR REPLACE FUNCTION public.warehouse_dashboard_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH series_in_boxes AS (
    SELECT
      s.id AS series_id,
      s.service_order_id,
      s.current_box_id,
      s.model_id,
      s.created_at
    FROM public.series s
    INNER JOIN public.boxes b ON b.id = s.current_box_id
    WHERE coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  ),
  box_equipos AS (
    SELECT
      b.id AS box_id,
      coalesce(nullif(b.capacity, 0), 1) AS capacity,
      upper(coalesce(b.rack_location, '')) AS rack_u,
      b.status::text AS box_status,
      b.box_code,
      count(DISTINCT coalesce(sib.service_order_id, sib.series_id))::bigint AS equipos,
      (
        SELECT m.technology_id
        FROM series_in_boxes x
        LEFT JOIN public.models m ON m.id = x.model_id
        WHERE x.current_box_id = b.id
        ORDER BY x.created_at ASC NULLS LAST
        LIMIT 1
      ) AS technology_id
    FROM public.boxes b
    INNER JOIN series_in_boxes sib ON sib.current_box_id = b.id
    GROUP BY b.id, b.capacity, b.rack_location, b.status, b.box_code
  ),
  by_tech AS (
    SELECT
      technology_id,
      count(*)::bigint AS total_boxes,
      coalesce(sum(equipos), 0)::bigint AS total_equipos
    FROM box_equipos
    GROUP BY technology_id
  ),
  totals AS (
    SELECT
      count(*)::bigint AS total_boxes,
      coalesce(sum(equipos), 0)::bigint AS total_equipos,
      count(*) FILTER (
        WHERE NOT (
          rack_u = 'EN_PROCESO' OR box_code ILIKE 'TMP-%'
        )
        AND equipos >= capacity
      )::bigint AS cajas_completas,
      count(*) FILTER (
        WHERE rack_u = 'EN_PROCESO'
           OR box_code ILIKE 'TMP-%'
           OR (equipos > 0 AND equipos < capacity)
      )::bigint AS cajas_parciales
    FROM box_equipos
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'total_boxes', t.total_boxes,
        'total_equipos', t.total_equipos,
        'cajas_completas', t.cajas_completas,
        'cajas_parciales', t.cajas_parciales
      )
      FROM totals t
    ),
    'by_technology', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'technology_id', bt.technology_id,
            'total_boxes', bt.total_boxes,
            'total_equipos', bt.total_equipos
          )
          ORDER BY bt.total_equipos DESC
        )
        FROM by_tech bt
      ),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.bodega_start_or_append_scan_tx(uuid, uuid, uuid, uuid, integer, text[], text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodega_finalize_scan_tx(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodega_cancel_scan_tx(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_list_in_progress_boxes(integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
