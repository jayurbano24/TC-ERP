-- 255 — RPC candidatos backfill pre-diagnóstico (CHG-015 Fase 1).

CREATE OR REPLACE FUNCTION public.list_prediagnostico_backfill_candidates(
  p_cutoff timestamptz,
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  service_order_id uuid,
  serial_number text,
  model_id uuid,
  brand_id uuid,
  technology_id uuid,
  ingress_at timestamptz,
  current_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    so.id AS service_order_id,
    COALESCE(
      NULLIF(trim(so.main_serial), ''),
      (
        SELECT s.serial_number
        FROM public.series s
        WHERE s.service_order_id = so.id
        ORDER BY s.created_at ASC NULLS LAST
        LIMIT 1
      )
    ) AS serial_number,
    so.model_id,
    COALESCE(so.brand_id, m.brand_id) AS brand_id,
    m.technology_id,
    so.created_at AS ingress_at,
    (
      SELECT s.current_status::text
      FROM public.series s
      WHERE s.service_order_id = so.id
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1
    ) AS current_status
  FROM public.service_orders so
  INNER JOIN public.models m ON m.id = so.model_id
  LEFT JOIN public.prediagnosticos p ON p.service_order_id = so.id
  WHERE p.id IS NULL
    AND so.created_at < p_cutoff
    AND so.model_id IS NOT NULL
    AND m.technology_id IS NOT NULL
  ORDER BY so.created_at ASC, so.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION public.list_prediagnostico_backfill_candidates IS
  'OS sin prediagnóstico, pre-cutoff, con modelo/tecnología — paginado para backfill CHG-015.';

GRANT EXECUTE ON FUNCTION public.list_prediagnostico_backfill_candidates(timestamptz, int, int)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
