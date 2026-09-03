-- 187: Corregir catálogo — todo lo registrado como CG-2000 (huella CG2000) → CG-2200.
--
-- Contexto:
--   Migración 174 fusiona "CG-2000" / "CG 2000" / "KAON CG-2000" entre sí,
--   pero NO convierte CG-2000 en CG-2200 (huellas distintas: CG2000 vs CG2200).
--
-- Antes de aplicar en prod, puedes ejecutar solo el bloque "PRE-CHECK" abajo.

-- =============================================================================
-- PRE-CHECK (solo lectura)
-- =============================================================================
-- Modelos origen (huella CG2000):
-- SELECT m.id, b.name AS brand, t.name AS tech, m.code, m.name,
--        public.catalog_model_fingerprint(m.name, b.name) AS fp
-- FROM public.models m
-- LEFT JOIN public.brands b ON b.id = m.brand_id
-- LEFT JOIN public.technologies t ON t.id = m.technology_id
-- WHERE public.catalog_model_fingerprint(m.name, b.name) = 'CG2000'
-- ORDER BY b.name, t.name, m.name;
--
-- Destino CG-2200 por misma marca + tecnología:
-- SELECT m.id, b.name AS brand, t.name AS tech, m.code, m.name,
--        public.catalog_model_fingerprint(m.name, b.name) AS fp
-- FROM public.models m
-- LEFT JOIN public.brands b ON b.id = m.brand_id
-- LEFT JOIN public.technologies t ON t.id = m.technology_id
-- WHERE public.catalog_model_fingerprint(m.name, b.name) = 'CG2200'
-- ORDER BY b.name, t.name, m.name;
--
-- Conteos por tabla (origen CG2000):
-- SELECT 'series' AS tbl, count(*) FROM public.series s
--   JOIN public.models m ON m.id = s.model_id
--   LEFT JOIN public.brands b ON b.id = m.brand_id
--   WHERE public.catalog_model_fingerprint(m.name, b.name) = 'CG2000'
-- UNION ALL
-- SELECT 'service_orders', count(*) FROM public.service_orders so
--   JOIN public.models m ON m.id = so.model_id
--   LEFT JOIN public.brands b ON b.id = m.brand_id
--   WHERE public.catalog_model_fingerprint(m.name, b.name) = 'CG2000';

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
  v_tray integer;
  v_boxes integer;
  v_px integer;
  v_kpi integer;
  v_total_groups integer := 0;
BEGIN
  IF to_regprocedure('public.catalog_model_fingerprint(text,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta función catalog_model_fingerprint (aplicar migración 174).';
  END IF;

  FOR r IN
    SELECT
      m.brand_id,
      m.technology_id,
      array_agg(m.id ORDER BY length(public.normalize_catalog_label(m.name)), m.id) AS source_ids
    FROM public.models m
    LEFT JOIN public.brands b ON b.id = m.brand_id
    WHERE public.catalog_model_fingerprint(m.name, b.name) = 'CG2000'
    GROUP BY m.brand_id, m.technology_id
  LOOP
    v_total_groups := v_total_groups + 1;
    v_brand := r.brand_id;
    v_tech := r.technology_id;
    v_sources := r.source_ids;

    SELECT m.id INTO v_target
    FROM public.models m
    LEFT JOIN public.brands b ON b.id = m.brand_id
    WHERE m.brand_id = v_brand
      AND m.technology_id IS NOT DISTINCT FROM v_tech
      AND public.catalog_model_fingerprint(m.name, b.name) = 'CG2200'
    ORDER BY length(public.normalize_catalog_label(m.name)), m.id
    LIMIT 1;

    IF v_target IS NULL THEN
      -- No existe CG-2200 en este par marca/tecnología: renombrar el registro canónico CG-2000
      v_keep := v_sources[1];
      v_sources := v_sources[2:];

      SELECT code INTO v_code FROM public.models WHERE id = v_keep;
      UPDATE public.models
      SET
        name = 'CG-2200',
        code = CASE
          WHEN v_code IS NULL OR btrim(v_code) = '' THEN 'CG-2200'
          WHEN upper(replace(v_code, '-', '')) IN ('CG2000', 'CG-2000') THEN 'CG-2200'
          ELSE code
        END
      WHERE id = v_keep;

      v_target := v_keep;
      RAISE NOTICE '187: brand=% tech=% — renombrado id=% a CG-2200 (sin fila destino previa)', v_brand, v_tech, v_target;
    ELSE
      UPDATE public.models
      SET name = 'CG-2200'
      WHERE id = v_target
        AND public.normalize_catalog_label(name) IS DISTINCT FROM 'CG-2200';
    END IF;

    IF v_sources IS NULL OR coalesce(cardinality(v_sources), 0) = 0 THEN
      CONTINUE;
    END IF;

    RAISE NOTICE '187: brand=% tech=% target=% sources=%', v_brand, v_tech, v_target, v_sources;

    UPDATE public.series
    SET
      model_id = v_target,
      brand_id = COALESCE((SELECT brand_id FROM public.models WHERE id = v_target), brand_id),
      updated_at = now()
    WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_series = ROW_COUNT;

    UPDATE public.service_orders
    SET
      model_id = v_target,
      brand_id = COALESCE((SELECT brand_id FROM public.models WHERE id = v_target), brand_id)
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
      brand_id = COALESCE((SELECT brand_id FROM public.models WHERE id = v_target), brand_id)
    WHERE model_id = ANY (v_sources);
    GET DIAGNOSTICS v_boxes = ROW_COUNT;

    IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
      UPDATE public.px_reception_equipment SET model_id = v_target WHERE model_id = ANY (v_sources);
      GET DIAGNOSTICS v_px = ROW_COUNT;
    ELSE
      v_px := 0;
    END IF;

    IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
      UPDATE public.px_reception_lots SET model_id = v_target WHERE model_id = ANY (v_sources);
    END IF;

    IF to_regclass('public.production_orders') IS NOT NULL THEN
      UPDATE public.production_orders SET model_id = v_target WHERE model_id = ANY (v_sources);
    END IF;

    IF to_regclass('public.taller_kpi_goals') IS NOT NULL THEN
      UPDATE public.taller_kpi_goals SET model_id = v_target WHERE model_id = ANY (v_sources);
      GET DIAGNOSTICS v_kpi = ROW_COUNT;
    ELSE
      v_kpi := 0;
    END IF;

    IF to_regclass('public.cat_reacondicionado_tests') IS NOT NULL THEN
      BEGIN
        UPDATE public.cat_reacondicionado_tests
        SET model_ids = (
          SELECT ARRAY(
            SELECT DISTINCT CASE WHEN x = ANY (v_sources) THEN v_target ELSE x END
            FROM unnest(model_ids) AS x
          )
        )
        WHERE model_ids IS NOT NULL
          AND model_ids && v_sources;
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;

    DELETE FROM public.models m
    WHERE m.id = ANY (v_sources)
      AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.model_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.model_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM public.cac_tray_units t WHERE t.model_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM public.boxes bx WHERE bx.model_id = m.id)
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
      )
      AND (
        to_regclass('public.taller_kpi_goals') IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.taller_kpi_goals g WHERE g.model_id = m.id)
      );

    RAISE NOTICE
      '187: fusionado → CG-2200 series=% OS=% tray=% boxes=% px=% kpi=%',
      v_series, v_os, v_tray, v_boxes, v_px, v_kpi;
  END LOOP;

  IF v_total_groups = 0 THEN
    RAISE NOTICE '187: no hay modelos con huella CG2000 (ya corregido o vacío).';
  END IF;
END;
$$;

-- Post-check
SELECT count(*) AS modelos_cg2000_restantes
FROM public.models m
LEFT JOIN public.brands b ON b.id = m.brand_id
WHERE public.catalog_model_fingerprint(m.name, b.name) = 'CG2000';

NOTIFY pgrst, 'reload schema';
