-- =============================================================================
-- 234 — Solicitud y despacho de piezas por lote, con trazabilidad por OS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.part_request_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  qty_per_order integer NOT NULL CHECK (qty_per_order > 0),
  total_orders integer NOT NULL CHECK (total_orders > 0),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENTE')),
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PARTIAL', 'FULFILLED', 'CANCELLED')),
  requested_by uuid REFERENCES auth.users(id),
  requested_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.part_requests
  ADD COLUMN IF NOT EXISTS batch_id uuid
    REFERENCES public.part_request_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS serial_numbers text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.part_requests
SET
  series_ids = CASE
    WHEN series_id IS NULL THEN '{}'::uuid[]
    ELSE ARRAY[series_id]
  END,
  serial_numbers = CASE
    WHEN NULLIF(trim(serial_number), '') IS NULL THEN '{}'::text[]
    ELSE ARRAY[serial_number]
  END
WHERE cardinality(series_ids) = 0
  AND cardinality(serial_numbers) = 0;

ALTER TABLE IF EXISTS public.part_dispatches
  ADD COLUMN IF NOT EXISTS batch_id uuid
    REFERENCES public.part_request_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_part_requests_batch
  ON public.part_requests(batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_part_dispatches_batch
  ON public.part_dispatches(batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.part_request_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.part_request_batches FROM anon, authenticated;
GRANT ALL ON public.part_request_batches TO service_role;

NOTIFY pgrst, 'reload schema';
