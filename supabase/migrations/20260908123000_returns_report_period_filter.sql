-- =============================================================================
-- Filtro por periodo (semana / mes) en reporte de devoluciones.
-- Filtra sobre returns_report_etl.event_at sin re-ejecutar el ETL completo.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_returns_report_etl_event_at
  ON public.returns_report_etl (event_at);

CREATE OR REPLACE FUNCTION public.get_returns_report_stats(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_refreshed timestamptz;
  v_agencies jsonb;
  v_reasons jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*), max(refreshed_at)
  INTO v_total, v_refreshed
  FROM public.returns_report_etl e
  WHERE (p_start IS NULL OR e.event_at >= p_start)
    AND (p_end IS NULL OR e.event_at <= p_end);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', agency, 'count', cnt)
    ORDER BY cnt DESC, agency ASC
  ), '[]'::jsonb)
  INTO v_agencies
  FROM (
    SELECT agency, count(*)::int AS cnt
    FROM public.returns_report_etl e
    WHERE (p_start IS NULL OR e.event_at >= p_start)
      AND (p_end IS NULL OR e.event_at <= p_end)
    GROUP BY agency
  ) a;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', motivo, 'count', cnt)
    ORDER BY cnt DESC, motivo ASC
  ), '[]'::jsonb)
  INTO v_reasons
  FROM (
    SELECT motivo, count(*)::int AS cnt
    FROM public.returns_report_etl e
    WHERE (p_start IS NULL OR e.event_at >= p_start)
      AND (p_end IS NULL OR e.event_at <= p_end)
    GROUP BY motivo
  ) r;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'agencies', v_agencies,
    'reasons', v_reasons,
    'refreshed_at', v_refreshed,
    'source', 'returns_report_etl',
    'period_start', p_start,
    'period_end', p_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_returns_report_stats(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_returns_report_stats(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_returns_report_stats(timestamptz, timestamptz) IS
  'Cantidades agregadas de devoluciones; opcional p_start/p_end filtran por event_at.';

NOTIFY pgrst, 'reload schema';

-- Normaliza motivo N/A en el ETL de reportes (datos históricos + nuevos refreshes).
CREATE OR REPLACE FUNCTION public.refresh_returns_report_etl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_count int := 0;
  v_sap_count int := 0;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.returns_report_etl WHERE true;

  INSERT INTO public.returns_report_etl (id, source_type, agency, motivo, event_at, refreshed_at)
  SELECT
    'box:' || rg.id::text,
    'box',
    COALESCE(
      NULLIF(TRIM(rg.agency), ''),
      NULLIF(TRIM(r.carrier), ''),
      'Sin asignar'
    ),
    CASE
      WHEN NULLIF(TRIM(rg.motivo), '') IS NULL THEN 'Sin motivo declarado'
      WHEN lower(trim(rg.motivo)) IN ('n/a', 'na', '---') THEN 'Sin motivo declarado'
      ELSE trim(rg.motivo)
    END,
    COALESCE(rg.classified_at, r.created_at, v_now),
    v_now
  FROM public.reception_guides rg
  INNER JOIN public.receptions r ON r.id = rg.reception_id
  WHERE lower(COALESCE(rg.category, '')) = 'devolucion'
    AND upper(COALESCE(r.status, '')) NOT IN ('ARCHIVADO', 'ELIMINADO', 'DEVUELTO');

  GET DIAGNOSTICS v_box_count = ROW_COUNT;

  INSERT INTO public.returns_report_etl (id, source_type, agency, motivo, event_at, refreshed_at)
  SELECT DISTINCT ON (COALESCE(s.service_order_id::text, std.id::text))
    'sap:' || COALESCE(s.service_order_id::text, std.id::text),
    'sap_block',
    COALESCE(
      NULLIF(TRIM(std.agency), ''),
      NULLIF(TRIM(rg.agency), ''),
      NULLIF(TRIM(rec.carrier), ''),
      'Sin asignar'
    ),
    CASE
      WHEN NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), '') IS NULL
        AND NULLIF(TRIM(rg.motivo), '') IS NULL THEN 'Sin motivo declarado'
      WHEN lower(coalesce(
        NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), ''),
        NULLIF(TRIM(rg.motivo), ''),
        ''
      )) IN ('n/a', 'na', '---') THEN 'Sin motivo declarado'
      ELSE coalesce(
        NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), ''),
        NULLIF(TRIM(rg.motivo), ''),
        'Devolución bloque SAP'
      )
    END,
    COALESCE(s.updated_at, std.updated_at, v_now),
    v_now
  FROM public.series s
  INNER JOIN public.sap_transfer_documents std ON std.id = s.sap_transfer_id
  LEFT JOIN public.reception_guides rg ON rg.id = std.reception_guide_id
  LEFT JOIN public.receptions rec ON rec.id = std.reception_id
  WHERE lower(COALESCE(s.current_status::text, '')) = 'returned'
    AND upper(COALESCE(std.status, '')) = 'DEVUELTO_BLOQUE'
  ORDER BY COALESCE(s.service_order_id::text, std.id::text), s.updated_at DESC NULLS LAST;

  GET DIAGNOSTICS v_sap_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'box_count', v_box_count,
    'sap_count', v_sap_count,
    'total', v_box_count + v_sap_count,
    'refreshed_at', v_now
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
