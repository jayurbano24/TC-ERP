-- Fase A — domain_events, outbox mejorado, emit_domain_event (observe-only pipeline)
-- Aplicar en Supabase antes de activar workers en producción.

-- =============================================================================
-- 0) Alinear correlation_id a text (instalaciones previas usaban uuid)
-- =============================================================================
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

  IF to_regclass('public.outbox_event') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbox_event'
        AND column_name = 'correlation_id'
        AND udt_name = 'uuid'
    ) THEN
      ALTER TABLE public.outbox_event
        ALTER COLUMN correlation_id TYPE text USING correlation_id::text;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 1) domain_events
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  correlation_id text,
  source text NOT NULL DEFAULT 'platform',
  actor_id uuid,
  actor_label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_log_id uuid
);

CREATE INDEX IF NOT EXISTS idx_domain_events_occurred
  ON public.domain_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON public.domain_events (aggregate_type, aggregate_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_correlation
  ON public.domain_events (correlation_id, occurred_at DESC)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_type
  ON public.domain_events (event_type, occurred_at DESC);

-- =============================================================================
-- 2) outbox_event — columnas para worker (retry / DLQ)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  error text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  processed_at timestamptz
);

ALTER TABLE public.outbox_event ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE public.outbox_event ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.outbox_event ADD COLUMN IF NOT EXISTS next_retry timestamptz;
ALTER TABLE public.outbox_event ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE public.outbox_event ADD COLUMN IF NOT EXISTS domain_event_id uuid;

CREATE INDEX IF NOT EXISTS idx_outbox_event_pending
  ON public.outbox_event (status, created_at)
  WHERE status IN ('PENDING', 'FAILED');

-- =============================================================================
-- 3) emit_domain_event — inserta evento + outbox (misma transacción)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.emit_domain_event(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_correlation_id text DEFAULT NULL,
  p_source text DEFAULT 'platform',
  p_actor_label text DEFAULT NULL,
  p_audit_log_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.domain_events (
    event_type,
    aggregate_type,
    aggregate_id,
    correlation_id,
    source,
    actor_label,
    payload,
    audit_log_id
  ) VALUES (
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_correlation_id,
    COALESCE(p_source, 'platform'),
    p_actor_label,
    COALESCE(p_payload, '{}'::jsonb),
    p_audit_log_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.outbox_event (
    event_name,
    payload,
    status,
    correlation_id,
    domain_event_id
  ) VALUES (
    p_event_type,
    jsonb_build_object(
      'eventName', p_event_type,
      'aggregateType', p_aggregate_type,
      'aggregateId', p_aggregate_id,
      'correlationId', p_correlation_id,
      'source', COALESCE(p_source, 'platform'),
      'payload', COALESCE(p_payload, '{}'::jsonb),
      'domainEventId', v_id
    ),
    'PENDING',
    p_correlation_id,
    v_id
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_domain_event(text, text, text, jsonb, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_domain_event(text, text, text, jsonb, text, text, text, uuid) TO authenticated, service_role;

-- =============================================================================
-- 4) Timelines + stats (usados por domainEvents.ts)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_entity_timeline(
  p_aggregate_type text,
  p_aggregate_id text,
  p_limit int DEFAULT 50
)
RETURNS SETOF public.domain_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.domain_events
  WHERE aggregate_type = p_aggregate_type
    AND aggregate_id::text = p_aggregate_id
  ORDER BY occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

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

CREATE OR REPLACE FUNCTION public.audit_domain_events_stats(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH windowed AS (
    SELECT *
    FROM public.domain_events
    WHERE occurred_at > now() - make_interval(days => GREATEST(1, COALESCE(p_days, 30)))
  ),
  by_source AS (
    SELECT source, count(*)::bigint AS cnt
    FROM windowed
    GROUP BY source
  ),
  by_type AS (
    SELECT event_type, count(*)::bigint AS cnt
    FROM windowed
    GROUP BY event_type
  )
  SELECT jsonb_build_object(
    'days', GREATEST(1, COALESCE(p_days, 30)),
    'total', (SELECT count(*)::bigint FROM windowed),
    'with_audit_link', (SELECT count(*)::bigint FROM windowed WHERE audit_log_id IS NOT NULL),
    'by_source', COALESCE((SELECT jsonb_object_agg(source, cnt) FROM by_source), '{}'::jsonb),
    'by_event_type', COALESCE((SELECT jsonb_object_agg(event_type, cnt) FROM by_type), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_entity_timeline(text, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_correlation_timeline(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_domain_events_stats(int) TO authenticated, service_role;
