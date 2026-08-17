-- =============================================================================
-- 210 — ETL de reporte de devoluciones (cantidades por agencia / motivo)
-- =============================================================================
-- Evita el hang del tab REPORTES (antes cargaba todas las filas + backfill).
-- Tabla de hechos + refresh RPC + get stats agregados para la UI.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.returns_report_etl (
  id            text PRIMARY KEY,
  source_type   text NOT NULL CHECK (source_type IN ('box', 'sap_block')),
  agency        text NOT NULL DEFAULT 'Sin asignar',
  motivo        text NOT NULL DEFAULT 'Sin motivo',
  event_at      timestamptz,
  refreshed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_report_etl_agency
  ON public.returns_report_etl (agency);

CREATE INDEX IF NOT EXISTS idx_returns_report_etl_motivo
  ON public.returns_report_etl (motivo);

ALTER TABLE public.returns_report_etl ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS returns_report_etl_select ON public.returns_report_etl;
CREATE POLICY returns_report_etl_select
  ON public.returns_report_etl
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.returns_report_etl TO authenticated;

-- ── Refresh (EXTRACT + TRANSFORM + LOAD) ─────────────────────────────────────

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

  -- LOAD: rebuild snapshot (WHERE requerido por pg_safeupdate / políticas DELETE)
  DELETE FROM public.returns_report_etl WHERE true;

  -- EXTRACT/TRANSFORM: cajas clasificadas como devolución (histórico operativo)
  INSERT INTO public.returns_report_etl (id, source_type, agency, motivo, event_at, refreshed_at)
  SELECT
    'box:' || rg.id::text,
    'box',
    COALESCE(
      NULLIF(TRIM(rg.agency), ''),
      NULLIF(TRIM(r.carrier), ''),
      'Sin asignar'
    ),
    COALESCE(NULLIF(TRIM(rg.motivo), ''), 'Sin motivo'),
    COALESCE(rg.classified_at, r.created_at, v_now),
    v_now
  FROM public.reception_guides rg
  INNER JOIN public.receptions r ON r.id = rg.reception_id
  WHERE lower(COALESCE(rg.category, '')) = 'devolucion'
    AND upper(COALESCE(r.status, '')) NOT IN ('ARCHIVADO', 'ELIMINADO', 'DEVUELTO');

  GET DIAGNOSTICS v_box_count = ROW_COUNT;

  -- EXTRACT/TRANSFORM: bloques SAP DEVUELTO_BLOQUE (1 fila por OS / documento)
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
    COALESCE(
      NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), ''),
      NULLIF(TRIM(rg.motivo), ''),
      'Devolución bloque SAP'
    ),
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

REVOKE ALL ON FUNCTION public.refresh_returns_report_etl() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_returns_report_etl() TO authenticated;

-- ── Read agregados para UI ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_returns_report_stats()
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
  FROM public.returns_report_etl;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', agency, 'count', cnt)
    ORDER BY cnt DESC, agency ASC
  ), '[]'::jsonb)
  INTO v_agencies
  FROM (
    SELECT agency, count(*)::int AS cnt
    FROM public.returns_report_etl
    GROUP BY agency
  ) a;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', motivo, 'count', cnt)
    ORDER BY cnt DESC, motivo ASC
  ), '[]'::jsonb)
  INTO v_reasons
  FROM (
    SELECT motivo, count(*)::int AS cnt
    FROM public.returns_report_etl
    GROUP BY motivo
  ) r;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'agencies', v_agencies,
    'reasons', v_reasons,
    'refreshed_at', v_refreshed,
    'source', 'returns_report_etl'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_returns_report_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_returns_report_stats() TO authenticated;

COMMENT ON TABLE public.returns_report_etl IS
  'ETL snapshot de devoluciones (cajas + bloques SAP) para el tab REPORTES';
COMMENT ON FUNCTION public.refresh_returns_report_etl() IS
  'Rebuild del snapshot ETL de devoluciones';
COMMENT ON FUNCTION public.get_returns_report_stats() IS
  'Cantidades agregadas (total / agencia / motivo) desde returns_report_etl';

NOTIFY pgrst, 'reload schema';
