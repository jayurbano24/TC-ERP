-- =============================================================================
-- 176 — Quitar marca como sufijo/prefijo del nombre de modelo y fusionar
-- =============================================================================
-- Ej: "3.0 BC-RT905 BLUECASTLE" → "3.0 BC-RT905" (misma brand/tech)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.catalog_model_fingerprint(p_model text, p_brand text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cleaned AS (
    SELECT
      CASE
        WHEN public.normalize_catalog_label(p_brand) IS NULL THEN public.normalize_catalog_label(p_model)
        ELSE NULLIF(
          btrim(
            regexp_replace(
              regexp_replace(
                public.normalize_catalog_label(p_model),
                '^' || public.normalize_catalog_label(p_brand) || '[[:space:]]*[-–—:/]?[[:space:]]*',
                '',
                'i'
              ),
              '[[:space:]]*[-–—:/]?[[:space:]]*' || public.normalize_catalog_label(p_brand) || '$',
              '',
              'i'
            )
          ),
          ''
        )
      END AS clean_name
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
    FROM cleaned
  )
  SELECT NULLIF(regexp_replace(regexp_replace(fp, '-+', '-', 'g'), '^-+|-+$', '', 'g'), '')
  FROM canon;
$$;

-- 1) Limpiar prefijo/sufijo de marca en models.name
UPDATE public.models m
SET name = public.normalize_catalog_label(
  regexp_replace(
    regexp_replace(
      public.normalize_catalog_label(m.name),
      '^' || public.normalize_catalog_label(b.name) || '[[:space:]]*[-–—:/]?[[:space:]]*',
      '',
      'i'
    ),
    '[[:space:]]*[-–—:/]?[[:space:]]*' || public.normalize_catalog_label(b.name) || '$',
    '',
    'i'
  )
)
FROM public.brands b
WHERE m.brand_id = b.id
  AND public.normalize_catalog_label(b.name) IS NOT NULL
  AND public.normalize_catalog_label(m.name) IS NOT NULL
  AND (
    lower(public.normalize_catalog_label(m.name)) LIKE lower(public.normalize_catalog_label(b.name)) || '%'
    OR lower(public.normalize_catalog_label(m.name)) LIKE '%' || lower(public.normalize_catalog_label(b.name))
  )
  AND length(public.normalize_catalog_label(m.name))
      > length(public.normalize_catalog_label(b.name)) + 1
  AND m.name IS DISTINCT FROM public.normalize_catalog_label(
    regexp_replace(
      regexp_replace(
        public.normalize_catalog_label(m.name),
        '^' || public.normalize_catalog_label(b.name) || '[[:space:]]*[-–—:/]?[[:space:]]*',
        '',
        'i'
      ),
      '[[:space:]]*[-–—:/]?[[:space:]]*' || public.normalize_catalog_label(b.name) || '$',
      '',
      'i'
    )
  );

-- 2) Fusionar duplicados por fingerprint (brand + tech)
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

-- 3) Caso explícito BLUECASTLE residual (cualquier tech/brand)
UPDATE public.models
SET name = public.normalize_catalog_label(
  regexp_replace(name, '[[:space:]]+BLUECASTLE[[:space:]]*$', '', 'i')
)
WHERE name ~* 'BLUECASTLE[[:space:]]*$'
  AND length(public.normalize_catalog_label(name)) > length('BLUECASTLE') + 1;

NOTIFY pgrst, 'reload schema';
