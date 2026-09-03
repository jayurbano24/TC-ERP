-- 144: Unificar modelos incorrectos → ZXV10 B866V (canónico)
--
-- Origen (incorrectos):
--   ZXV10 B866V-Android
--   ZXV10 866V2 SO ANDROID10
--   ZXV10 866V2 SO ANDROID12
-- Destino:
--   ZXV10 B866V
--
-- NO incluye modelos BUNDLE (SKU distinto).

DO $$
DECLARE
  v_target uuid;
  v_sources uuid[];
  v_series integer;
  v_os integer;
  v_tray integer;
  v_boxes integer;
  v_px integer;
BEGIN
  SELECT id INTO v_target
  FROM public.models
  WHERE name = 'ZXV10 B866V'
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Modelo canónico ZXV10 B866V no encontrado.';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_sources
  FROM public.models
  WHERE name IN (
    'ZXV10 B866V-Android',
    'ZXV10 866V2 SO ANDROID10',
    'ZXV10 866V2 SO ANDROID12'
  );

  IF COALESCE(cardinality(v_sources), 0) = 0 THEN
    RAISE NOTICE 'No hay modelos origen para unificar (ya aplicados).';
    RETURN;
  END IF;

  RAISE NOTICE 'Target=% sources=%', v_target, v_sources;

  UPDATE public.series
  SET
    model_id = v_target,
    brand_id = COALESCE(
      (SELECT brand_id FROM public.models WHERE id = v_target),
      brand_id
    ),
    updated_at = now()
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_series = ROW_COUNT;

  UPDATE public.service_orders
  SET
    model_id = v_target,
    brand_id = COALESCE(
      (SELECT brand_id FROM public.models WHERE id = v_target),
      brand_id
    )
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_os = ROW_COUNT;

  UPDATE public.cac_tray_units
  SET
    model_id = v_target,
    tech_id = (SELECT technology_id FROM public.models WHERE id = v_target),
    brand_id = (SELECT brand_id FROM public.models WHERE id = v_target),
    updated_at = now()
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_tray = ROW_COUNT;

  UPDATE public.boxes
  SET
    model_id = v_target,
    brand_id = COALESCE(
      (SELECT brand_id FROM public.models WHERE id = v_target),
      brand_id
    )
  WHERE model_id = ANY (v_sources);
  GET DIAGNOSTICS v_boxes = ROW_COUNT;

  IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
    UPDATE public.px_reception_equipment
    SET model_id = v_target
    WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_px = ROW_COUNT;
  ELSE
    v_px := 0;
  END IF;

  IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
    UPDATE public.px_reception_lots
    SET model_id = v_target
    WHERE model_id = ANY (v_sources);
  END IF;

  IF to_regclass('public.production_orders') IS NOT NULL THEN
    UPDATE public.production_orders
    SET model_id = v_target
    WHERE model_id = ANY (v_sources);
  END IF;

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
    'Unificación → ZXV10 B866V: series=% OS=% tray=% boxes=% px=%',
    v_series, v_os, v_tray, v_boxes, v_px;
END;
$$;

NOTIFY pgrst, 'reload schema';
