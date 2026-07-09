-- 101: Backfill Material + Valoración (Lote) desde auditoría SAP a series.
-- Cubre cargas validados antes de la migración 100 (solo sap_status, sin material/valuation).

UPDATE public.series s
SET
  material = COALESCE(
    NULLIF(trim(s.material), ''),
    NULLIF(trim(d.material), '')
  ),
  valuation = COALESCE(
    NULLIF(trim(s.valuation), ''),
    NULLIF(trim(d.lote), ''),
    NULLIF(trim(d.valoracion), '')
  )
FROM (
  SELECT DISTINCT ON (upper(trim(serie)))
    upper(trim(serie)) AS serie_key,
    material,
    lote,
    valoracion
  FROM public.sap_validation_details
  WHERE coalesce(coincidencia, false) = true
    AND nullif(trim(serie), '') IS NOT NULL
    AND (
      nullif(trim(material), '') IS NOT NULL
      OR nullif(trim(lote), '') IS NOT NULL
      OR nullif(trim(valoracion), '') IS NOT NULL
    )
  ORDER BY upper(trim(serie)), created_at DESC NULLS LAST
) d
WHERE upper(trim(s.serial_number)) = d.serie_key
  AND (
    nullif(trim(s.material), '') IS NULL
    OR nullif(trim(s.valuation), '') IS NULL
  );

-- También por serial_normalized si existe (migración 097)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'serial_normalized'
  ) THEN
    UPDATE public.series s
    SET
      material = COALESCE(
        NULLIF(trim(s.material), ''),
        NULLIF(trim(d.material), '')
      ),
      valuation = COALESCE(
        NULLIF(trim(s.valuation), ''),
        NULLIF(trim(d.lote), ''),
        NULLIF(trim(d.valoracion), '')
      )
    FROM (
      SELECT DISTINCT ON (upper(trim(serie)))
        upper(trim(serie)) AS serie_key,
        material,
        lote,
        valoracion
      FROM public.sap_validation_details
      WHERE coalesce(coincidencia, false) = true
        AND nullif(trim(serie), '') IS NOT NULL
      ORDER BY upper(trim(serie)), created_at DESC NULLS LAST
    ) d
    WHERE s.serial_normalized = d.serie_key
      AND (
        nullif(trim(s.material), '') IS NULL
        OR nullif(trim(s.valuation), '') IS NULL
      );
  END IF;
END $$;
