-- =============================================================================
-- 175 — CG2000 → CG-2200 + fingerprint que conserva guiones
-- =============================================================================
-- 174 colapsaba "CG2000" y "CG-2000" a la misma huella (mal).
-- Negocio: el nombre "CG2000" (sin guion) corresponde a CG-2200, no a CG-2000.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.catalog_model_fingerprint(p_model text, p_brand text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH base AS (
    SELECT public.normalize_catalog_label(p_model) AS model_name,
           public.normalize_catalog_label(p_brand) AS brand_name
  ),
  stripped AS (
    SELECT CASE
      WHEN brand_name IS NOT NULL
           AND model_name IS NOT NULL
           AND lower(model_name) LIKE lower(brand_name) || '%'
      THEN NULLIF(
        btrim(
          regexp_replace(
            model_name,
            '^' || brand_name || '[[:space:]]*[-–—:/]?[[:space:]]*',
            '',
            'i'
          )
        ),
        ''
      )
      ELSE model_name
    END AS clean_name
    FROM base
  ),
  canon AS (
    SELECT upper(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(clean_name, ''), '([A-Za-z])[[:space:]]+([0-9])', '\1-\2', 'g'),
            '([0-9])[[:space:]]+([A-Za-z])',
            '\1-\2',
            'g'
          ),
          '[[:space:]]+',
          '-',
          'g'
        ),
        '[^A-Za-z0-9-]+',
        '',
        'g'
      )
    ) AS fp
    FROM stripped
  )
  SELECT NULLIF(regexp_replace(regexp_replace(fp, '-+', '-', 'g'), '^-+|-+$', '', 'g'), '')
  FROM canon;
$$;

DO $$
DECLARE
  v_src uuid;
  v_dst uuid;
  v_brand uuid;
  v_tech uuid;
  r record;
BEGIN
  -- Remapear todo modelo cuyo nombre canónico es exactamente CG2000 (sin guion)
  FOR r IN
    SELECT m.id, m.brand_id, m.technology_id, m.name
    FROM public.models m
    WHERE upper(regexp_replace(public.normalize_catalog_label(m.name), '[^A-Za-z0-9]+', '', 'g')) = 'CG2000'
      AND public.normalize_catalog_label(m.name) !~* 'CG-2000'
  LOOP
    v_src := r.id;
    v_brand := r.brand_id;
    v_tech := r.technology_id;

    SELECT id INTO v_dst
    FROM public.models
    WHERE brand_id IS NOT DISTINCT FROM v_brand
      AND technology_id IS NOT DISTINCT FROM v_tech
      AND public.normalize_catalog_label(name) ILIKE 'CG-2200'
    LIMIT 1;

    IF v_dst IS NULL THEN
      -- Renombrar el propio registro a CG-2200
      UPDATE public.models
      SET name = 'CG-2200',
          code = COALESCE(NULLIF(public.normalize_catalog_label(code), ''), 'CG-2200')
      WHERE id = v_src;
      RAISE NOTICE 'Renombrado modelo % (%) → CG-2200', v_src, r.name;
    ELSIF v_dst = v_src THEN
      UPDATE public.models SET name = 'CG-2200' WHERE id = v_src;
    ELSE
      UPDATE public.series SET model_id = v_dst, updated_at = now() WHERE model_id = v_src;
      UPDATE public.service_orders SET model_id = v_dst WHERE model_id = v_src;
      UPDATE public.cac_tray_units SET model_id = v_dst, updated_at = now() WHERE model_id = v_src;
      BEGIN
        UPDATE public.boxes SET model_id = v_dst WHERE model_id = v_src;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        NULL;
      END;
      IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
        EXECUTE 'UPDATE public.px_reception_equipment SET model_id = $1 WHERE model_id = $2'
          USING v_dst, v_src;
      END IF;
      IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
        EXECUTE 'UPDATE public.px_reception_lots SET model_id = $1 WHERE model_id = $2'
          USING v_dst, v_src;
      END IF;
      IF to_regclass('public.production_orders') IS NOT NULL THEN
        EXECUTE 'UPDATE public.production_orders SET model_id = $1 WHERE model_id = $2'
          USING v_dst, v_src;
      END IF;

      DELETE FROM public.models m
      WHERE m.id = v_src
        AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.model_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.model_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.cac_tray_units t WHERE t.model_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.boxes bx WHERE bx.model_id = m.id);

      RAISE NOTICE 'Fusionado CG2000 % → CG-2200 %', v_src, v_dst;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_model_fingerprint(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_model_fingerprint(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
