-- 216: BOX-1741 — 8 equipos ingresados como CG-2200; hardware real CG-3000.
-- Ajusta caja + series + OS + bandeja CAC.
-- Ejecutar en SQL Editor (Supabase) si no se aplicó por script; luego Ctrl+F5 en Bodega / Consulta.

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
  SELECT m.id, m.brand_id, m.technology_id
  INTO v_target, v_target_brand, v_target_tech
  FROM public.models m
  WHERE upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG3000'
  ORDER BY
    CASE WHEN upper(btrim(m.name)) = 'CG-3000' THEN 0 ELSE 1 END,
    length(btrim(m.name)),
    m.id
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION '216: no se encontró modelo CG-3000 en catálogo';
  END IF;

  FOR v_box IN
    SELECT b.id, b.box_code, b.model_id, m.name AS model_name, br.name AS brand_name
    FROM public.boxes b
    LEFT JOIN public.models m ON m.id = b.model_id
    LEFT JOIN public.brands br ON br.id = b.brand_id
    WHERE upper(btrim(b.box_code)) IN ('BOX-1741', 'BOX-01741', 'TCW-BOX-1741')
       OR regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1741'
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

    UPDATE public.px_reception_lots
    SET
      model_id = v_target,
      model_name = 'CG-3000',
      brand_id = v_target_brand
    WHERE box_id = v_box.id;

    RAISE NOTICE '216 OK: % | era % / % | series=% OS=% tray=% → CG-3000 (id=%)',
      v_box.box_code, v_box.model_name, v_box.brand_name, v_series, v_os, v_tray, v_target;
  END LOOP;

  IF v_found = 0 THEN
    RAISE EXCEPTION '216: no se encontró BOX-1741';
  END IF;
END;
$$;

-- Verificación
SELECT
  b.box_code,
  br.name AS marca,
  m.name AS modelo,
  b.capacity,
  count(DISTINCT s.service_order_id) AS equipos_os,
  count(s.id) AS filas_series
FROM public.boxes b
LEFT JOIN public.brands br ON br.id = b.brand_id
LEFT JOIN public.models m ON m.id = b.model_id
LEFT JOIN public.series s ON s.current_box_id = b.id
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1741'
GROUP BY b.id, b.box_code, br.name, m.name, b.capacity
ORDER BY b.box_code;

NOTIFY pgrst, 'reload schema';
