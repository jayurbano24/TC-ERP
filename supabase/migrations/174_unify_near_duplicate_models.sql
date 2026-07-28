-- =============================================================================
-- 174 — Unificar modelos near-duplicate (espacios, guiones, prefijo de marca)
-- =============================================================================
-- Tras 173: fusiona variantes como "CG-2000" / "CG 2000" / "KAON CG-2000"
-- dentro del mismo brand_id + technology_id.
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
  )
  SELECT NULLIF(upper(regexp_replace(COALESCE(clean_name, ''), '[^A-Za-z0-9]+', '', 'g')), '')
  FROM stripped;
$$;

-- 1) Quitar prefijo de marca del nombre del modelo cuando aplica
UPDATE public.models m
SET name = public.normalize_catalog_label(
  regexp_replace(
    public.normalize_catalog_label(m.name),
    '^' || public.normalize_catalog_label(b.name) || '[[:space:]]*[-–—:/]?[[:space:]]*',
    '',
    'i'
  )
)
FROM public.brands b
WHERE m.brand_id = b.id
  AND public.normalize_catalog_label(b.name) IS NOT NULL
  AND public.normalize_catalog_label(m.name) IS NOT NULL
  AND lower(public.normalize_catalog_label(m.name))
      LIKE lower(public.normalize_catalog_label(b.name)) || '%'
  AND length(public.normalize_catalog_label(m.name))
      > length(public.normalize_catalog_label(b.name)) + 1
  AND m.name IS DISTINCT FROM public.normalize_catalog_label(
    regexp_replace(
      public.normalize_catalog_label(m.name),
      '^' || public.normalize_catalog_label(b.name) || '[[:space:]]*[-–—:/]?[[:space:]]*',
      '',
      'i'
    )
  );

-- 2) Fusionar near-duplicates por (brand, tech, fingerprint)
DO $$
DECLARE
  r record;
  v_keep uuid;
  v_dup uuid;
  v_dups uuid[];
  v_keep_name text;
BEGIN
  FOR r IN
    SELECT
      m.brand_id,
      m.technology_id,
      public.catalog_model_fingerprint(m.name, b.name) AS fp,
      array_agg(m.id ORDER BY length(public.normalize_catalog_label(m.name)), m.id) AS ids
    FROM public.models m
    LEFT JOIN public.brands b ON b.id = m.brand_id
    WHERE public.catalog_model_fingerprint(m.name, b.name) IS NOT NULL
    GROUP BY m.brand_id, m.technology_id, public.catalog_model_fingerprint(m.name, b.name)
    HAVING count(*) > 1
  LOOP
    v_keep := r.ids[1];
    v_dups := r.ids[2:];

    SELECT public.normalize_catalog_label(name) INTO v_keep_name
    FROM public.models WHERE id = v_keep;

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
        AND NOT EXISTS (SELECT 1 FROM public.boxes bx WHERE bx.model_id = m.id);
    END LOOP;

    IF v_keep_name IS NOT NULL THEN
      UPDATE public.models SET name = v_keep_name WHERE id = v_keep;
    END IF;
  END LOOP;
END;
$$;

-- 3) Informe de posibles residuales (solo NOTICE; no falla)
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT 1
    FROM public.models m
    LEFT JOIN public.brands b ON b.id = m.brand_id
    GROUP BY m.brand_id, m.technology_id, public.catalog_model_fingerprint(m.name, b.name)
    HAVING count(*) > 1
  ) x;
  RAISE NOTICE 'Modelos near-duplicate restantes tras 174: %', COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_model_fingerprint(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_model_fingerprint(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_catalog_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_catalog_label(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
