-- Parche: correlation_id uuid vs text en domain_events (Fase A)
-- Ejecutar si 050 falló en get_correlation_timeline con:
--   operator does not exist: uuid = text

DO $$
BEGIN
  IF to_regclass('public.domain_events') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'domain_events'
        AND column_name = 'correlation_id'
        AND udt_name = 'uuid'
    ) THEN
      ALTER TABLE public.domain_events
        ALTER COLUMN correlation_id TYPE text USING correlation_id::text;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_correlation_timeline(
  p_correlation_id text,
  p_limit int DEFAULT 100
)
RETURNS SETOF public.domain_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.domain_events
  WHERE correlation_id::text = p_correlation_id
  ORDER BY occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_correlation_timeline(text, int) TO authenticated, service_role;
