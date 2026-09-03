-- 204: 9877E71EAB4D — CG-3000 → CG-2200

DO $$
DECLARE
  v_os_id uuid;
  v_brand uuid;
  v_tech uuid;
  v_target uuid;
  v_from_name text;
  v_series integer;
  v_tray integer;
BEGIN
  -- Resolver OS por serie
  SELECT so.id, m.brand_id, m.technology_id, m.name
  INTO v_os_id, v_brand, v_tech, v_from_name
  FROM public.service_orders so
  JOIN public.series s ON s.service_order_id = so.id
  JOIN public.models m ON m.id = COALESCE(so.model_id, s.model_id)
  WHERE upper(btrim(s.serial_number)) = '9877E71EAB4D'
     OR coalesce(s.serial_normalized, '') = '9877E71EAB4D'
  ORDER BY so.id
  LIMIT 1;

  IF v_os_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró serie 9877E71EAB4D';
  END IF;

  SELECT m.id INTO v_target
  FROM public.models m
  WHERE m.brand_id = v_brand
    AND m.technology_id IS NOT DISTINCT FROM v_tech
    AND (
      upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG2200'
      OR m.name ILIKE '%CG-2200%'
      OR m.name ILIKE '%CG2200%'
    )
  ORDER BY m.id
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No hay modelo CG-2200 para brand=% tech=%', v_brand, v_tech;
  END IF;

  UPDATE public.series
  SET
    model_id = v_target,
    brand_id = (SELECT brand_id FROM public.models WHERE id = v_target),
    updated_at = now()
  WHERE service_order_id = v_os_id;
  GET DIAGNOSTICS v_series = ROW_COUNT;

  UPDATE public.service_orders
  SET
    model_id = v_target,
    brand_id = (SELECT brand_id FROM public.models WHERE id = v_target)
  WHERE id = v_os_id;

  UPDATE public.cac_tray_units
  SET
    model_id = v_target,
    brand_id = (SELECT brand_id FROM public.models WHERE id = v_target),
    tech_id = (SELECT technology_id FROM public.models WHERE id = v_target),
    updated_at = now()
  WHERE service_order_id = v_os_id;
  GET DIAGNOSTICS v_tray = ROW_COUNT;

  RAISE NOTICE '204 OK: OS=% filas_series=% tray=% de % → %',
    v_os_id, v_series, v_tray, v_from_name,
    (SELECT name FROM public.models WHERE id = v_target);
END;
$$;

SELECT
  so.os_label,
  s.serial_number,
  m.name AS modelo
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
JOIN public.models m ON m.id = s.model_id
WHERE upper(btrim(s.serial_number)) = '9877E71EAB4D'
   OR coalesce(s.serial_normalized, '') = '9877E71EAB4D'
ORDER BY s.created_at NULLS LAST, s.serial_number;

NOTIFY pgrst, 'reload schema';
