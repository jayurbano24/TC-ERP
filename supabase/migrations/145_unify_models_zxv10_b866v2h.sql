-- 145: Crear ZXV10 B866V2-H y unificar BUNDLEs incorrectos hacia él.
--
-- Origen:
--   BUNDLE B866V2-H + CONTROL
--   BUNDLE ZTE B866V2-H + CONTROL
--   BUNDLE ZTE B866V2-H ANDROID
-- Destino (nuevo si no existe):
--   ZXV10 B866V2-H

DO $$
DECLARE
  v_target uuid;
  v_brand uuid;
  v_tech uuid;
  v_sources uuid[];
  v_series integer := 0;
  v_os integer := 0;
  v_tray integer := 0;
  v_boxes integer := 0;
  v_px integer := 0;
  v_lots integer := 0;
  v_po integer := 0;
BEGIN
  SELECT brand_id, technology_id
  INTO v_brand, v_tech
  FROM public.models
  WHERE name IN (
    'BUNDLE ZTE B866V2-H + CONTROL',
    'BUNDLE ZTE B866V2-H ANDROID',
    'BUNDLE B866V2-H + CONTROL',
    'ZXV10 B866V'
  )
  ORDER BY CASE name
    WHEN 'BUNDLE ZTE B866V2-H + CONTROL' THEN 1
    WHEN 'BUNDLE ZTE B866V2-H ANDROID' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_brand IS NULL OR v_tech IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver brand/technology para ZXV10 B866V2-H.';
  END IF;

  SELECT id INTO v_target
  FROM public.models
  WHERE name = 'ZXV10 B866V2-H'
  LIMIT 1;

  IF v_target IS NULL THEN
    INSERT INTO public.models (
      brand_id, technology_id, code, name, series_count, digits_per_series
    ) VALUES (
      v_brand,
      v_tech,
      'ZXV10-B866V2-H',
      'ZXV10 B866V2-H',
      3,
      ARRAY[17, 17, 16]
    )
    RETURNING id INTO v_target;
    RAISE NOTICE 'Creado modelo ZXV10 B866V2-H id=%', v_target;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_sources
  FROM public.models
  WHERE name IN (
    'BUNDLE B866V2-H + CONTROL',
    'BUNDLE ZTE B866V2-H + CONTROL',
    'BUNDLE ZTE B866V2-H ANDROID'
  );

  IF COALESCE(cardinality(v_sources), 0) = 0 THEN
    RAISE NOTICE 'No hay BUNDLE origen (ya unificados). Target=%', v_target;
    RETURN;
  END IF;

  RAISE NOTICE 'Target=% sources=%', v_target, v_sources;

  UPDATE public.series
  SET model_id = v_target, brand_id = v_brand, updated_at = now()
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_series = ROW_COUNT;

  UPDATE public.service_orders
  SET model_id = v_target, brand_id = v_brand
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_os = ROW_COUNT;

  UPDATE public.cac_tray_units
  SET model_id = v_target, brand_id = v_brand, tech_id = v_tech, updated_at = now()
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_tray = ROW_COUNT;

  UPDATE public.boxes
  SET model_id = v_target, brand_id = v_brand
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_boxes = ROW_COUNT;

  IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
    UPDATE public.px_reception_equipment
    SET model_id = v_target
    WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_px = ROW_COUNT;
  END IF;

  IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
    UPDATE public.px_reception_lots
    SET model_id = v_target
    WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_lots = ROW_COUNT;
  END IF;

  IF to_regclass('public.production_orders') IS NOT NULL THEN
    UPDATE public.production_orders
    SET model_id = v_target
    WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_po = ROW_COUNT;
  END IF;

  -- Borrar solo si no quedan FKs conocidas
  DELETE FROM public.models m
  WHERE m.id = ANY (v_sources)
    AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.model_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.model_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.cac_tray_units t WHERE t.model_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.boxes b WHERE b.model_id = m.id)
    AND (
      to_regclass('public.px_reception_equipment') IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.px_reception_equipment p WHERE p.model_id = m.id)
    )
    AND (
      to_regclass('public.px_reception_lots') IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.px_reception_lots l WHERE l.model_id = m.id)
    )
    AND (
      to_regclass('public.production_orders') IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.production_orders po WHERE po.model_id = m.id)
    );

  RAISE NOTICE
    'Unificación → ZXV10 B866V2-H: series=% OS=% tray=% boxes=% px=% lots=% po=%',
    v_series, v_os, v_tray, v_boxes, v_px, v_lots, v_po;
END;
$$;

NOTIFY pgrst, 'reload schema';
