-- Fusiona modelos duplicados (misma marca + mismo nombre normalizado) y bloquea futuros duplicados.

DO $$
DECLARE
  v_table text;
  v_sql text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_model_dupes (
    dupe_id uuid PRIMARY KEY,
    keeper_id uuid NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE tmp_model_dupes;

  INSERT INTO tmp_model_dupes (dupe_id, keeper_id)
  SELECT id, keeper_id
  FROM (
    SELECT
      id,
      first_value(id) OVER (
        PARTITION BY brand_id, upper(trim(name))
        ORDER BY id ASC
      ) AS keeper_id,
      row_number() OVER (
        PARTITION BY brand_id, upper(trim(name))
        ORDER BY id ASC
      ) AS rn
    FROM public.models
  ) ranked
  WHERE rn > 1;

  IF NOT EXISTS (SELECT 1 FROM tmp_model_dupes) THEN
    RETURN;
  END IF;

  -- Reasignar model_id en TODAS las tablas public que tengan esa columna (incl. boxes, cac_tray_units, etc.)
  FOR v_table IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'model_id'
      AND c.table_name <> 'models'
    ORDER BY c.table_name
  LOOP
    v_sql := format(
      'UPDATE public.%I t SET model_id = d.keeper_id FROM tmp_model_dupes d WHERE t.model_id = d.dupe_id',
      v_table
    );
    EXECUTE v_sql;
  END LOOP;

  -- cat_reacondicionado_tests.model_ids (uuid[]) si existe
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'cat_reacondicionado_tests'
      AND c.column_name = 'model_ids'
  ) THEN
    UPDATE public.cat_reacondicionado_tests t
    SET model_ids = (
      SELECT COALESCE(array_agg(DISTINCT x), '{}')
      FROM (
        SELECT CASE
          WHEN u = d.dupe_id THEN d.keeper_id
          ELSE u
        END AS x
        FROM unnest(t.model_ids) AS u
        LEFT JOIN tmp_model_dupes d ON d.dupe_id = u
      ) mapped
    )
    WHERE t.model_ids IS NOT NULL
      AND t.model_ids && (SELECT array_agg(dupe_id) FROM tmp_model_dupes);
  END IF;

  -- part_catalog_models: evitar PK duplicada al fusionar
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'part_catalog_models'
  ) THEN
    DELETE FROM public.part_catalog_models pcm
    USING tmp_model_dupes d
    WHERE pcm.model_id = d.dupe_id
      AND EXISTS (
        SELECT 1 FROM public.part_catalog_models keep
        WHERE keep.catalog_id = pcm.catalog_id
          AND keep.model_id = d.keeper_id
      );

    UPDATE public.part_catalog_models pcm
    SET model_id = d.keeper_id
    FROM tmp_model_dupes d
    WHERE pcm.model_id = d.dupe_id;
  END IF;

  DELETE FROM public.models m
  USING tmp_model_dupes d
  WHERE m.id = d.dupe_id;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS models_brand_name_unique
  ON public.models (brand_id, upper(trim(name)));
