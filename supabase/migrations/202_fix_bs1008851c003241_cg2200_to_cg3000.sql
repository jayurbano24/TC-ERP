-- 202: BS1008851C003241 — CG-2200 → CG-3000 (equipo / OS completo).
-- Caso: serie ingresada como CG-2200; hardware real CG-3000.
-- Ejecutar TODO el archivo en SQL Editor (No limit). Luego Ctrl+F5 en Consulta.

DO $$
DECLARE
  v_os_id uuid;
  v_brand uuid;
  v_tech uuid;
  v_target uuid;
  v_from_name text;
  v_series integer;
  v_tray integer;
  v_sn text := 'BS1008851C003241';
BEGIN
  SELECT so.id, m.brand_id, m.technology_id, m.name
  INTO v_os_id, v_brand, v_tech, v_from_name
  FROM public.series s
  JOIN public.models m ON m.id = s.model_id
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE upper(btrim(s.serial_number)) = v_sn
     OR coalesce(s.serial_normalized, '') = v_sn
     OR upper(coalesce(s.s2, '')) = v_sn
     OR upper(coalesce(s.s3, '')) = v_sn
     OR upper(coalesce(s.s4, '')) = v_sn
  ORDER BY s.created_at NULLS LAST, s.id
  LIMIT 1;

  IF v_os_id IS NULL THEN
    SELECT so.id, m.brand_id, m.technology_id, m.name
    INTO v_os_id, v_brand, v_tech, v_from_name
    FROM public.service_orders so
    JOIN public.series s ON s.service_order_id = so.id
    JOIN public.models m ON m.id = COALESCE(so.model_id, s.model_id)
    WHERE upper(btrim(s.serial_number)) = v_sn
       OR coalesce(s.serial_normalized, '') = v_sn
    ORDER BY so.id
    LIMIT 1;
  END IF;

  IF v_os_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró serie %', v_sn;
  END IF;

  -- Destino CG-3000 misma marca + tecnología
  SELECT m.id INTO v_target
  FROM public.models m
  WHERE m.brand_id = v_brand
    AND m.technology_id IS NOT DISTINCT FROM v_tech
    AND upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG3000'
  ORDER BY m.id
  LIMIT 1;

  IF v_target IS NULL THEN
    -- Fallback: cualquier CG-3000 de la misma marca
    SELECT m.id INTO v_target
    FROM public.models m
    WHERE m.brand_id = v_brand
      AND upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG3000'
    ORDER BY m.id
    LIMIT 1;
  END IF;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No hay modelo CG-3000 para brand=% tech=%', v_brand, v_tech;
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

  -- Caja(s) de las series de esta OS: alinear brand/model de cabecera si aplica
  UPDATE public.boxes b
  SET
    model_id = v_target,
    brand_id = (SELECT brand_id FROM public.models WHERE id = v_target)
  WHERE b.id IN (
    SELECT DISTINCT s.current_box_id
    FROM public.series s
    WHERE s.service_order_id = v_os_id
      AND s.current_box_id IS NOT NULL
  );

  RAISE NOTICE '202 OK: OS=% filas_series=% tray=% de % → CG-3000 (serie %)',
    v_os_id, v_series, v_tray, v_from_name, v_sn;
END;
$$;

-- Verificación (debe devolver filas con modelo CG-3000)
SELECT
  so.os_label,
  s.serial_number,
  m.name AS modelo,
  s.current_status
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
JOIN public.models m ON m.id = s.model_id
WHERE s.service_order_id = (
  SELECT s2.service_order_id
  FROM public.series s2
  WHERE upper(btrim(s2.serial_number)) = 'BS1008851C003241'
     OR coalesce(s2.serial_normalized, '') = 'BS1008851C003241'
     OR upper(coalesce(s2.s2, '')) = 'BS1008851C003241'
     OR upper(coalesce(s2.s3, '')) = 'BS1008851C003241'
     OR upper(coalesce(s2.s4, '')) = 'BS1008851C003241'
  LIMIT 1
)
ORDER BY s.created_at NULLS LAST, s.serial_number;
