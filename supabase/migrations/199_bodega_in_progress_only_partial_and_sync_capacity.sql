-- 199: «Cajas en Proceso» = solo TMP / EN_PROCESO.
-- Stock en BODEGA_CENTRAL / P-01 / RACK-* se considera cerrado → capacity = equipos OS
-- (evita 18/19, 55/62 como parciales fantasma en Gestión de Bodega).

-- 1) KPI: parciales solo pistoleo en curso
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
    WHERE public.warehouse_box_is_bodega_operational(b.rack_location)
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
        WHERE NOT (rack_u = 'EN_PROCESO' OR box_code ILIKE 'TMP-%')
          AND equipos > 0
      )::bigint AS cajas_completas,
      count(*) FILTER (
        WHERE rack_u = 'EN_PROCESO'
           OR box_code ILIKE 'TMP-%'
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

GRANT EXECUTE ON FUNCTION public.warehouse_dashboard_kpis() TO authenticated, service_role;

-- 2) Al finalizar pistoleo → rack destino + capacity = equipos reales
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
  v_sync jsonb;
  v_rack text;
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

  v_rack := coalesce(nullif(trim(p_rack_location), ''), 'P-01');

  IF v_box.box_code ~* '^BOX-[0-9]+$' THEN
    UPDATE public.boxes
    SET rack_location = v_rack
    WHERE id = p_box_id;
    v_new_code := v_box.box_code;
  ELSE
    WHILE NOT v_assigned LOOP
      v_new_code := public.next_box_code();
      BEGIN
        UPDATE public.boxes
        SET
          box_code = v_new_code,
          rack_location = v_rack
        WHERE id = p_box_id;
        v_assigned := true;
      EXCEPTION WHEN unique_violation THEN
        v_assigned := false;
      END;
    END LOOP;
  END IF;

  -- Caja cerrada en stock = completa (capacity = OS en bodega)
  v_sync := public.warehouse_sync_box_capacity(p_box_id);

  RETURN jsonb_build_object(
    'box_id', p_box_id,
    'box_code', v_new_code,
    'series_linked', v_linked,
    'capacity', v_sync->>'capacity',
    'equipos_count', v_sync->>'equipos_remaining'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bodega_finalize_scan_tx(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bodega_finalize_scan_tx(uuid, text)
  TO authenticated, service_role;

-- 3) Backfill: stock operativo (no TMP) con capacity > equipos → alinear
DO $$
DECLARE
  r record;
  v_sync jsonb;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT b.id
    FROM public.boxes b
    WHERE public.warehouse_box_is_bodega_operational(b.rack_location)
      AND upper(coalesce(b.rack_location, '')) <> 'EN_PROCESO'
      AND b.box_code NOT ILIKE 'TMP-%'
      AND EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.current_box_id = b.id
          AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
      )
  LOOP
    v_sync := public.warehouse_sync_box_capacity(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '199: sync capacity en % cajas de stock operativo', n;
END $$;

NOTIFY pgrst, 'reload schema';
