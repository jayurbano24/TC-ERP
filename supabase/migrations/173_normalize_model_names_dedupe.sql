-- =============================================================================
-- 173 — Estandarizar nombres de modelos (espacios) y fusionar duplicados
-- =============================================================================
-- 1) trim + colapsar espacios en models.name / code
-- 2) fusionar modelos duplicados por (brand_id, technology_id, lower(name))
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_catalog_label(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(COALESCE(p_raw, ''), E'[\\u00A0\\u2000-\\u200B\\u202F\\u205F\\u3000\\uFEFF]', ' ', 'g'),
        E'\\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

-- 1) Limpiar nombres
UPDATE public.models
SET
  name = public.normalize_catalog_label(name),
  code = COALESCE(public.normalize_catalog_label(code), code)
WHERE name IS DISTINCT FROM public.normalize_catalog_label(name)
   OR (code IS NOT NULL AND code IS DISTINCT FROM public.normalize_catalog_label(code));

UPDATE public.technologies
SET name = public.normalize_catalog_label(name)
WHERE name IS DISTINCT FROM public.normalize_catalog_label(name);

UPDATE public.brands
SET name = public.normalize_catalog_label(name)
WHERE name IS DISTINCT FROM public.normalize_catalog_label(name);

-- 2) Fusionar duplicados (mismo brand + tech + nombre case-insensitive)
DO $$
DECLARE
  r record;
  v_keep uuid;
  v_dup uuid;
  v_dups uuid[];
BEGIN
  FOR r IN
    SELECT
      brand_id,
      technology_id,
      lower(public.normalize_catalog_label(name)) AS name_key,
      array_agg(id ORDER BY id) AS ids
    FROM public.models
    WHERE public.normalize_catalog_label(name) IS NOT NULL
    GROUP BY brand_id, technology_id, lower(public.normalize_catalog_label(name))
    HAVING count(*) > 1
  LOOP
    v_keep := r.ids[1];
    v_dups := r.ids[2:];

    FOREACH v_dup IN ARRAY v_dups LOOP
      UPDATE public.series SET model_id = v_keep, updated_at = now() WHERE model_id = v_dup;
      UPDATE public.service_orders SET model_id = v_keep WHERE model_id = v_dup;
      UPDATE public.cac_tray_units SET model_id = v_keep, updated_at = now() WHERE model_id = v_dup;
      BEGIN
        UPDATE public.boxes SET model_id = v_keep WHERE model_id = v_dup;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        NULL;
      END;

      IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
        EXECUTE 'UPDATE public.px_reception_equipment SET model_id = $1 WHERE model_id = $2'
          USING v_keep, v_dup;
      END IF;
      IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
        EXECUTE 'UPDATE public.px_reception_lots SET model_id = $1 WHERE model_id = $2'
          USING v_keep, v_dup;
      END IF;
      IF to_regclass('public.production_orders') IS NOT NULL THEN
        EXECUTE 'UPDATE public.production_orders SET model_id = $1 WHERE model_id = $2'
          USING v_keep, v_dup;
      END IF;
      IF to_regclass('public.warehouse_box_summary') IS NOT NULL THEN
        BEGIN
          EXECUTE 'UPDATE public.warehouse_box_summary SET sample_model_id = $1 WHERE sample_model_id = $2'
            USING v_keep, v_dup;
        EXCEPTION WHEN undefined_column OR undefined_table THEN
          NULL;
        END;
      END IF;

      -- Catálogos taller (model_ids arrays)
      IF to_regclass('public.cat_reacondicionado_tests') IS NOT NULL THEN
        BEGIN
          UPDATE public.cat_reacondicionado_tests
          SET model_ids = (
            SELECT ARRAY(
              SELECT DISTINCT CASE WHEN x = v_dup THEN v_keep ELSE x END
              FROM unnest(model_ids) AS x
            )
          )
          WHERE model_ids IS NOT NULL AND v_dup = ANY (model_ids);
        EXCEPTION WHEN undefined_column THEN
          NULL;
        END;
      END IF;

      DELETE FROM public.models m
      WHERE m.id = v_dup
        AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.model_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.model_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.cac_tray_units t WHERE t.model_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.boxes b WHERE b.model_id = m.id);
    END LOOP;

    -- Asegurar nombre canónico en el keep
    UPDATE public.models
    SET name = public.normalize_catalog_label(name)
    WHERE id = v_keep;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_catalog_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_catalog_label(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
