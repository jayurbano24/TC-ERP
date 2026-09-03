-- 190: TC-05102 / BS10084053008747 — CG-3000 → CG-2200 (un solo bloque, sin crear función).
-- Ejecutar TODO en SQL Editor (No limit). Luego Ctrl+F5 en Consulta.

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
  -- Resolver OS por serie (cualquier fila del equipo) o por etiqueta TC-05102
  SELECT so.id, m.brand_id, m.technology_id, m.name
  INTO v_os_id, v_brand, v_tech, v_from_name
  FROM public.service_orders so
  JOIN public.series s ON s.service_order_id = so.id
  JOIN public.models m ON m.id = COALESCE(so.model_id, s.model_id)
  WHERE so.os_label = 'TC-05102'
     OR upper(btrim(s.serial_number)) = 'BS10084053008747'
     OR coalesce(s.serial_normalized, '') = 'BS10084053008747'
  ORDER BY CASE WHEN so.os_label = 'TC-05102' THEN 0 ELSE 1 END, so.id
  LIMIT 1;

  IF v_os_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró OS TC-05102 ni serie BS10084053008747';
  END IF;

  SELECT m.id INTO v_target
  FROM public.models m
  WHERE m.brand_id = v_brand
    AND m.technology_id IS NOT DISTINCT FROM v_tech
    AND upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG2200'
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

  RAISE NOTICE '190 OK: OS=% filas_series=% tray=% de % → %',
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
WHERE so.os_label = 'TC-05102'
ORDER BY s.created_at NULLS LAST, s.serial_number;

NOTIFY pgrst, 'reload schema';
