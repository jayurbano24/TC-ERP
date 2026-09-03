-- 203: 8401120C2B95 — corregir Marca/Modelo/Tecnología → KAON / CG-2200 / EMTA.
-- Actualiza toda la OS (series hermanas + service_order + cac_tray + caja si aplica).
-- Ejecutar TODO el archivo en SQL Editor (No limit). Luego Ctrl+F5 en Consulta.

DO $$
DECLARE
  v_sn text := '8401120C2B95';
  v_os_id uuid;
  v_brand_id uuid;
  v_tech_id uuid;
  v_model_id uuid;
  v_from_brand text;
  v_from_model text;
  v_from_tech text;
  v_series integer;
  v_tray integer;
BEGIN
  -- Resolver OS / estado actual por serie (S1–S4)
  SELECT
    so.id,
    b.name,
    m.name,
    t.name
  INTO v_os_id, v_from_brand, v_from_model, v_from_tech
  FROM public.series s
  JOIN public.service_orders so ON so.id = s.service_order_id
  LEFT JOIN public.models m ON m.id = COALESCE(s.model_id, so.model_id)
  LEFT JOIN public.brands b ON b.id = COALESCE(s.brand_id, so.brand_id, m.brand_id)
  LEFT JOIN public.technologies t ON t.id = m.technology_id
  WHERE upper(btrim(s.serial_number)) = upper(v_sn)
     OR coalesce(s.serial_normalized, '') = upper(v_sn)
     OR upper(coalesce(s.s2, '')) = upper(v_sn)
     OR upper(coalesce(s.s3, '')) = upper(v_sn)
     OR upper(coalesce(s.s4, '')) = upper(v_sn)
  ORDER BY s.created_at NULLS LAST, s.id
  LIMIT 1;

  IF v_os_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró serie %', v_sn;
  END IF;

  -- Marca KAON
  SELECT id INTO v_brand_id
  FROM public.brands
  WHERE upper(regexp_replace(COALESCE(name, ''), '[^A-Za-z0-9]+', '', 'g')) = 'KAON'
  ORDER BY id
  LIMIT 1;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'No existe marca KAON en catálogo';
  END IF;

  -- Tecnología EMTA
  SELECT id INTO v_tech_id
  FROM public.technologies
  WHERE upper(regexp_replace(COALESCE(name, ''), '[^A-Za-z0-9]+', '', 'g')) = 'EMTA'
  ORDER BY id
  LIMIT 1;

  IF v_tech_id IS NULL THEN
    RAISE EXCEPTION 'No existe tecnología EMTA en catálogo';
  END IF;

  -- Modelo CG-2200 (misma marca + tech)
  SELECT m.id INTO v_model_id
  FROM public.models m
  WHERE m.brand_id = v_brand_id
    AND m.technology_id IS NOT DISTINCT FROM v_tech_id
    AND upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG2200'
  ORDER BY m.id
  LIMIT 1;

  IF v_model_id IS NULL THEN
    -- Fallback: CG-2200 de marca KAON (cualquier tech) y alinear tech
    SELECT m.id INTO v_model_id
    FROM public.models m
    WHERE m.brand_id = v_brand_id
      AND upper(regexp_replace(regexp_replace(COALESCE(m.name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG2200'
    ORDER BY CASE WHEN m.technology_id IS NOT DISTINCT FROM v_tech_id THEN 0 ELSE 1 END, m.id
    LIMIT 1;
  END IF;

  IF v_model_id IS NULL THEN
    RAISE EXCEPTION 'No hay modelo CG-2200 para KAON / EMTA';
  END IF;

  -- Si el modelo no tiene tech EMTA, forzar technology_id del modelo (no crear fila nueva)
  UPDATE public.models
  SET technology_id = v_tech_id
  WHERE id = v_model_id
    AND technology_id IS DISTINCT FROM v_tech_id;

  UPDATE public.series
  SET
    model_id = v_model_id,
    brand_id = v_brand_id,
    updated_at = now()
  WHERE service_order_id = v_os_id;
  GET DIAGNOSTICS v_series = ROW_COUNT;

  UPDATE public.service_orders
  SET
    model_id = v_model_id,
    brand_id = v_brand_id
  WHERE id = v_os_id;

  UPDATE public.cac_tray_units
  SET
    model_id = v_model_id,
    brand_id = v_brand_id,
    tech_id = v_tech_id,
    updated_at = now()
  WHERE service_order_id = v_os_id;
  GET DIAGNOSTICS v_tray = ROW_COUNT;

  UPDATE public.boxes b
  SET
    model_id = v_model_id,
    brand_id = v_brand_id
  WHERE b.id IN (
    SELECT DISTINCT s.current_box_id
    FROM public.series s
    WHERE s.service_order_id = v_os_id
      AND s.current_box_id IS NOT NULL
  );

  RAISE NOTICE '203 OK: OS=% series=% tray=% | % / % / % → KAON / CG-2200 / EMTA (serie %)',
    v_os_id, v_series, v_tray,
    coalesce(v_from_brand, '?'), coalesce(v_from_model, '?'), coalesce(v_from_tech, '?'),
    v_sn;
END;
$$;

-- Verificación
SELECT
  so.os_label,
  s.serial_number,
  b.name AS marca,
  m.name AS modelo,
  t.name AS tecnologia,
  s.current_status
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
LEFT JOIN public.models m ON m.id = s.model_id
LEFT JOIN public.brands b ON b.id = COALESCE(s.brand_id, m.brand_id)
LEFT JOIN public.technologies t ON t.id = m.technology_id
WHERE s.service_order_id = (
  SELECT s2.service_order_id
  FROM public.series s2
  WHERE upper(btrim(s2.serial_number)) = '8401120C2B95'
     OR coalesce(s2.serial_normalized, '') = '8401120C2B95'
     OR upper(coalesce(s2.s2, '')) = '8401120C2B95'
     OR upper(coalesce(s2.s3, '')) = '8401120C2B95'
     OR upper(coalesce(s2.s4, '')) = '8401120C2B95'
  LIMIT 1
)
ORDER BY s.created_at NULLS LAST, s.serial_number;
