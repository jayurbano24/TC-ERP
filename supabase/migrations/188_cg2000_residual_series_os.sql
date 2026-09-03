-- 188: Residuales CG-2000 → CG-2200 (nombre / series vs OS).
-- Caso: post-check 187 = 0 (huella CG2000) pero Consulta aún muestra "CG-2000"
--       p. ej. serie 9877E732CC6E — model_id distinto al OS o nombre fuera de huella.

-- =============================================================================
-- DIAGNÓSTICO (ejecutar solo lectura; cambiar SN si hace falta)
-- =============================================================================
-- SELECT
--   s.serial_number,
--   s.model_id AS series_model_id,
--   ms.name AS series_model_name,
--   public.catalog_model_fingerprint(ms.name, bs.name) AS series_fp,
--   so.id AS os_id,
--   so.os_label,
--   so.model_id AS os_model_id,
--   mo.name AS os_model_name,
--   public.catalog_model_fingerprint(mo.name, bo.name) AS os_fp
-- FROM public.series s
-- LEFT JOIN public.models ms ON ms.id = s.model_id
-- LEFT JOIN public.brands bs ON bs.id = ms.brand_id
-- LEFT JOIN public.service_orders so ON so.id = s.service_order_id
-- LEFT JOIN public.models mo ON mo.id = so.model_id
-- LEFT JOIN public.brands bo ON bo.id = mo.brand_id
-- WHERE upper(trim(s.serial_number)) = '9877E732CC6E'
--    OR s.serial_normalized = '9877E732CC6E';

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

DO $$
DECLARE
  r record;
  v_target uuid;
  v_sources uuid[];
  v_keep uuid;
  v_brand uuid;
  v_tech uuid;
  v_code text;
  v_series integer;
  v_os integer;
BEGIN
  -- A) Unificar modelos detectados por NOMBRE (no solo huella SQL 174)
  FOR r IN
    SELECT
      m.brand_id,
      m.technology_id,
      array_agg(m.id ORDER BY length(public.normalize_catalog_label(m.name)), m.id) AS source_ids
    FROM public.models m
    WHERE public.catalog_is_cg2000_label(m.name)
      AND NOT public.catalog_is_cg2200_label(m.name)
    GROUP BY m.brand_id, m.technology_id
  LOOP
    v_brand := r.brand_id;
    v_tech := r.technology_id;
    v_sources := r.source_ids;

    SELECT m.id INTO v_target
    FROM public.models m
    WHERE m.brand_id = v_brand
      AND m.technology_id IS NOT DISTINCT FROM v_tech
      AND public.catalog_is_cg2200_label(m.name)
    ORDER BY length(public.normalize_catalog_label(m.name)), m.id
    LIMIT 1;

    IF v_target IS NULL THEN
      v_keep := v_sources[1];
      v_sources := v_sources[2:];
      SELECT code INTO v_code FROM public.models WHERE id = v_keep;
      UPDATE public.models
      SET
        name = 'CG-2200',
        code = CASE
          WHEN v_code IS NULL OR btrim(v_code) = '' THEN 'CG-2200'
          WHEN public.catalog_is_cg2000_label(v_code) THEN 'CG-2200'
          ELSE code
        END
      WHERE id = v_keep;
      v_target := v_keep;
      RAISE NOTICE '188A: renombrado id=% → CG-2200', v_target;
    END IF;

    IF v_sources IS NULL OR coalesce(cardinality(v_sources), 0) = 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.series SET model_id = v_target, updated_at = now() WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_series = ROW_COUNT;
    UPDATE public.service_orders SET model_id = v_target WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_os = ROW_COUNT;
    UPDATE public.cac_tray_units SET model_id = v_target, updated_at = now() WHERE model_id = ANY (v_sources);
    UPDATE public.boxes SET model_id = v_target WHERE model_id = ANY (v_sources);

    IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
      UPDATE public.px_reception_equipment SET model_id = v_target WHERE model_id = ANY (v_sources);
    END IF;
    IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
      UPDATE public.px_reception_lots SET model_id = v_target WHERE model_id = ANY (v_sources);
    END IF;
    IF to_regclass('public.production_orders') IS NOT NULL THEN
      UPDATE public.production_orders SET model_id = v_target WHERE model_id = ANY (v_sources);
    END IF;

    DELETE FROM public.models m
    WHERE m.id = ANY (v_sources)
      AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.model_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.model_id = m.id);

    RAISE NOTICE '188A: brand=% tech=% target=% series=% OS=%', v_brand, v_tech, v_target, v_series, v_os;
  END LOOP;

  -- B) Alinear series ← OS cuando el OS ya es CG-2200 y la serie sigue en CG-2000
  UPDATE public.series s
  SET model_id = so.model_id, updated_at = now()
  FROM public.service_orders so
  JOIN public.models mo ON mo.id = so.model_id
  WHERE s.service_order_id = so.id
    AND s.model_id IS DISTINCT FROM so.model_id
    AND public.catalog_is_cg2000_label((SELECT m.name FROM public.models m WHERE m.id = s.model_id))
    AND public.catalog_is_cg2200_label(mo.name);
  GET DIAGNOSTICS v_series = ROW_COUNT;
  RAISE NOTICE '188B: series alineadas desde OS (CG-2000→CG-2200): %', v_series;

  -- C) Alinear OS ← series cuando solo la serie quedó mal
  UPDATE public.service_orders so
  SET model_id = sub.model_id
  FROM (
    SELECT DISTINCT ON (s.service_order_id)
      s.service_order_id,
      s.model_id
    FROM public.series s
    JOIN public.models ms ON ms.id = s.model_id
    WHERE public.catalog_is_cg2200_label(ms.name)
    ORDER BY s.service_order_id, s.created_at NULLS LAST, s.id
  ) sub
  WHERE so.id = sub.service_order_id
    AND so.model_id IS DISTINCT FROM sub.model_id
    AND public.catalog_is_cg2000_label(
      (SELECT m.name FROM public.models m WHERE m.id = so.model_id)
    );
  GET DIAGNOSTICS v_os = ROW_COUNT;
  RAISE NOTICE '188C: OS alineados desde serie primaria: %', v_os;
END;
$$;

-- Post-check nombre (debe ser 0)
SELECT count(*) AS modelos_nombre_cg2000
FROM public.models m
WHERE public.catalog_is_cg2000_label(m.name)
  AND NOT public.catalog_is_cg2200_label(m.name);

NOTIFY pgrst, 'reload schema';
