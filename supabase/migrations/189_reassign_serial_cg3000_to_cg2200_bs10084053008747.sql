-- 189: Corregir modelo mal clasificado CG-3000 → CG-2200 (equipo / OS completo).
-- NO unifica todo el catálogo CG-3000 (sigue siendo modelo válido para otros equipos).
-- Caso reportado: serie BS10084053008747 ingresada como CG-3000, hardware CG-2200.
--
-- IMPORTANTE: ejecuta TODO este archivo en el SQL Editor (no solo el SELECT final).
-- Luego, para otra serie, usa el ejemplo al final con la serie real (no "OTRA_SERIE").

CREATE OR REPLACE FUNCTION public.catalog_is_cg2000_label(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    upper(regexp_replace(regexp_replace(COALESCE(p_name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG2000',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_is_cg2200_label(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    upper(regexp_replace(regexp_replace(COALESCE(p_name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG2200',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_is_cg3000_label(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    upper(regexp_replace(regexp_replace(COALESCE(p_name, ''), '[^A-Za-z0-9]+', '', 'g'), '^KAON', '')) = 'CG3000',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.reassign_os_model_by_seed_serial(
  p_serial text,
  p_expected_wrong_label text DEFAULT 'CG-3000',
  p_target_label text DEFAULT 'CG-2200'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sn text;
  v_os_id uuid;
  v_brand uuid;
  v_tech uuid;
  v_wrong_name text;
  v_target uuid;
  v_series integer;
  v_tray integer;
BEGIN
  v_sn := upper(btrim(coalesce(p_serial, '')));
  IF v_sn = '' THEN
    RAISE EXCEPTION 'SERIAL_REQUIRED';
  END IF;

  SELECT s.service_order_id, m.brand_id, m.technology_id, m.name
  INTO v_os_id, v_brand, v_tech, v_wrong_name
  FROM public.series s
  JOIN public.models m ON m.id = s.model_id
  WHERE upper(btrim(s.serial_number)) = v_sn
     OR coalesce(s.serial_normalized, '') = v_sn
  ORDER BY s.created_at NULLS LAST, s.id
  LIMIT 1;

  IF v_os_id IS NULL THEN
    SELECT so.id, m.brand_id, m.technology_id, m.name
    INTO v_os_id, v_brand, v_tech, v_wrong_name
    FROM public.service_orders so
    JOIN public.series s ON s.service_order_id = so.id
    JOIN public.models m ON m.id = COALESCE(so.model_id, s.model_id)
    WHERE EXISTS (
      SELECT 1 FROM public.series sx
      WHERE sx.service_order_id = so.id
        AND (
          upper(btrim(sx.serial_number)) = v_sn
          OR coalesce(sx.serial_normalized, '') = v_sn
        )
    )
    LIMIT 1;
  END IF;

  IF v_os_id IS NULL THEN
    RAISE EXCEPTION 'SERIE_NOT_FOUND: %', v_sn;
  END IF;

  IF p_expected_wrong_label IS NOT NULL AND btrim(p_expected_wrong_label) <> '' THEN
    IF p_expected_wrong_label ILIKE '%3000%' THEN
      IF NOT public.catalog_is_cg3000_label(v_wrong_name) THEN
        RAISE EXCEPTION 'WRONG_MODEL_EXPECTED_CG3000: actual=%', v_wrong_name;
      END IF;
    ELSIF p_expected_wrong_label ILIKE '%2000%' THEN
      IF NOT public.catalog_is_cg2000_label(v_wrong_name) THEN
        RAISE EXCEPTION 'WRONG_MODEL_EXPECTED_CG2000: actual=%', v_wrong_name;
      END IF;
    END IF;
  END IF;

  SELECT m.id INTO v_target
  FROM public.models m
  WHERE m.brand_id = v_brand
    AND m.technology_id IS NOT DISTINCT FROM v_tech
    AND (
      (p_target_label ILIKE '%2200%' AND public.catalog_is_cg2200_label(m.name))
      OR (p_target_label ILIKE '%3000%' AND public.catalog_is_cg3000_label(m.name))
      OR upper(btrim(m.name)) = upper(btrim(p_target_label))
    )
  ORDER BY length(btrim(m.name)), m.id
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'TARGET_MODEL_NOT_FOUND: % (brand=% tech=%)', p_target_label, v_brand, v_tech;
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

  RETURN jsonb_build_object(
    'serial', v_sn,
    'service_order_id', v_os_id,
    'from_model', v_wrong_name,
    'to_model', (SELECT name FROM public.models WHERE id = v_target),
    'target_model_id', v_target,
    'series_updated', v_series,
    'cac_tray_updated', v_tray
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_os_model_by_seed_serial(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_os_model_by_seed_serial(text, text, text) TO service_role, authenticated;

-- Reparación reportada
SELECT public.reassign_os_model_by_seed_serial(
  'BS10084053008747'::text,
  'CG-3000'::text,
  'CG-2200'::text
) AS repair_bs10084053008747;

-- Otra serie mal clasificada (sustituir SN real; requiere haber ejecutado este archivo antes):
-- SELECT public.reassign_os_model_by_seed_serial(
--   'AQUI_LA_SERIE'::text,
--   'CG-3000'::text,
--   'CG-2200'::text
-- );

-- Verificación Consulta / trazabilidad
SELECT
  s.serial_number,
  ms.name AS modelo_serie,
  so.os_label,
  mo.name AS modelo_os
FROM public.series s
JOIN public.models ms ON ms.id = s.model_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
LEFT JOIN public.models mo ON mo.id = so.model_id
WHERE so.os_label = 'TC-05102'
   OR upper(btrim(s.serial_number)) = 'BS10084053008747'
   OR coalesce(s.serial_normalized, '') = 'BS10084053008747';

NOTIFY pgrst, 'reload schema';
