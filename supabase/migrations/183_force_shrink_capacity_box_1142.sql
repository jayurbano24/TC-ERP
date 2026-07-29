-- 183: Forzar capacity = equipos en bodega para BOX-1142 (y caja del conduce TC-INV-100).
-- Usa el mismo filtro de estatus que warehouse_list_boxes_page.

DO $$
DECLARE
  v_ids uuid[] := '{}';
  v_id uuid;
  v_code text;
  v_cap integer;
  v_os integer;
  v_from_guide uuid[];
  v_from_code uuid[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT x), '{}')
  INTO v_from_guide
  FROM (
    SELECT d.box_id AS x
    FROM public.dispatches d
    WHERE trim(d.guide_number) = 'TC-INV-100'
      AND d.box_id IS NOT NULL
    UNION
    SELECT di.box_id AS x
    FROM public.dispatches d
    JOIN public.dispatch_items di ON di.dispatch_id = d.id
    WHERE trim(d.guide_number) = 'TC-INV-100'
      AND di.box_id IS NOT NULL
  ) g;

  SELECT coalesce(array_agg(DISTINCT b.id), '{}')
  INTO v_from_code
  FROM public.boxes b
  WHERE upper(b.box_code) LIKE '%1142%';

  SELECT coalesce(array_agg(DISTINCT u), '{}')
  INTO v_ids
  FROM unnest(coalesce(v_from_guide, '{}') || coalesce(v_from_code, '{}')) AS u
  WHERE u IS NOT NULL;

  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE NOTICE '183: no se encontró BOX-1142 ni caja de TC-INV-100.';
    RETURN;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT b.box_code, b.capacity INTO v_code, v_cap
    FROM public.boxes b
    WHERE b.id = v_id;

    SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer
    INTO v_os
    FROM public.series s
    WHERE s.current_box_id = v_id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

    IF coalesce(v_os, 0) <= 0 THEN
      RAISE NOTICE '183: % (%) sin equipos en bodega — no se toca capacity=%', v_code, v_id, v_cap;
      CONTINUE;
    END IF;

    UPDATE public.boxes
    SET capacity = v_os
    WHERE id = v_id;

    RAISE NOTICE '183: % (%) capacity % → %', v_code, v_id, v_cap, v_os;
  END LOOP;
END $$;

-- Verificación rápida (aparece en Results si el editor lo permite)
SELECT
  b.box_code,
  b.capacity,
  (
    SELECT count(DISTINCT coalesce(s.service_order_id, s.id))
    FROM public.series s
    WHERE s.current_box_id = b.id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  ) AS equipos_bodega
FROM public.boxes b
WHERE upper(b.box_code) LIKE '%1142%'
   OR b.id IN (
     SELECT d.box_id FROM public.dispatches d
     WHERE trim(d.guide_number) = 'TC-INV-100' AND d.box_id IS NOT NULL
   );
