-- 192: TCW-BOX-1319 / TCW-BOX-1320 — modelo erróneo (Arris 3.0 BC-RT905) → CG-2200.
-- Ajusta caja + series en bodega + OS + bandeja CAC.
-- Ejecutar en SQL Editor (Supabase) y luego Ctrl+F5 en Bodega / Consulta.

DO $$
DECLARE
  v_box record;
  v_target uuid;
  v_target_brand uuid;
  v_target_tech uuid;
  v_series integer;
  v_os integer;
  v_tray integer;
  v_found integer := 0;
BEGIN
  IF to_regprocedure('public.catalog_is_cg2200_label(text)') IS NULL THEN
    RAISE EXCEPTION '192: falta catalog_is_cg2200_label (aplique migración 189+)';
  END IF;

  SELECT m.id, m.brand_id, m.technology_id
  INTO v_target, v_target_brand, v_target_tech
  FROM public.models m
  WHERE public.catalog_is_cg2200_label(m.name)
  ORDER BY
    CASE WHEN upper(btrim(m.name)) = 'CG-2200' THEN 0 ELSE 1 END,
    length(btrim(m.name)),
    m.id
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION '192: no se encontró modelo CG-2200 en catálogo';
  END IF;

  FOR v_box IN
    SELECT b.id, b.box_code, b.model_id, m.name AS model_name, br.name AS brand_name
    FROM public.boxes b
    LEFT JOIN public.models m ON m.id = b.model_id
    LEFT JOIN public.brands br ON br.id = b.brand_id
    WHERE upper(btrim(b.box_code)) IN (
            'BOX-1319', 'BOX-1320',
            'BOX-01319', 'BOX-01320',
            'TCW-BOX-1319', 'TCW-BOX-1320'
          )
       OR regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') IN ('1319', '1320')
  LOOP
    v_found := v_found + 1;

    UPDATE public.boxes
    SET
      model_id = v_target,
      brand_id = v_target_brand
    WHERE id = v_box.id;

    UPDATE public.series s
    SET
      model_id = v_target,
      brand_id = v_target_brand,
      updated_at = now()
    WHERE s.current_box_id = v_box.id;
    GET DIAGNOSTICS v_series = ROW_COUNT;

    WITH os_ids AS (
      SELECT DISTINCT s.service_order_id AS id
      FROM public.series s
      WHERE s.current_box_id = v_box.id
        AND s.service_order_id IS NOT NULL
    )
    UPDATE public.service_orders so
    SET
      model_id = v_target,
      brand_id = v_target_brand
    FROM os_ids
    WHERE so.id = os_ids.id;
    GET DIAGNOSTICS v_os = ROW_COUNT;

    UPDATE public.cac_tray_units ctu
    SET
      model_id = v_target,
      brand_id = v_target_brand,
      tech_id = v_target_tech,
      updated_at = now()
    WHERE ctu.service_order_id IN (
      SELECT DISTINCT s.service_order_id
      FROM public.series s
      WHERE s.current_box_id = v_box.id
        AND s.service_order_id IS NOT NULL
    );
    GET DIAGNOSTICS v_tray = ROW_COUNT;

    RAISE NOTICE '192 OK: % | era % / % | series=% OS=% tray=% → CG-2200 (id=%)',
      v_box.box_code, v_box.model_name, v_box.brand_name, v_series, v_os, v_tray, v_target;
  END LOOP;

  IF v_found = 0 THEN
    RAISE EXCEPTION '192: no se encontraron cajas BOX-1319 ni BOX-1320';
  END IF;
END;
$$;

-- Verificación
SELECT
  b.box_code,
  br.name AS marca,
  m.name AS modelo,
  b.capacity,
  b.rack_location,
  count(DISTINCT s.service_order_id) AS equipos_os,
  count(s.id) AS filas_series
FROM public.boxes b
LEFT JOIN public.brands br ON br.id = b.brand_id
LEFT JOIN public.models m ON m.id = b.model_id
LEFT JOIN public.series s ON s.current_box_id = b.id
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') IN ('1319', '1320')
GROUP BY b.id, b.box_code, br.name, m.name, b.capacity, b.rack_location
ORDER BY b.box_code;

NOTIFY pgrst, 'reload schema';
