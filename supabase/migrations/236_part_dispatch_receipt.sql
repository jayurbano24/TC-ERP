-- =============================================================================
-- 236 — Confirmación de recepción de pieza despachada (taller → bodega)
-- =============================================================================

ALTER TABLE public.part_dispatch_items
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS receipt_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS receipt_confirmed_by_name text;

DO $$
BEGIN
  ALTER TABLE public.part_dispatch_items
    DROP CONSTRAINT IF EXISTS part_dispatch_items_receipt_status_check;
  ALTER TABLE public.part_dispatch_items
    ADD CONSTRAINT part_dispatch_items_receipt_status_check
    CHECK (receipt_status IN ('PENDING', 'RECEIVED', 'NOT_RECEIVED'));
END $$;

CREATE INDEX IF NOT EXISTS idx_part_dispatch_items_receipt_not_received
  ON public.part_dispatch_items (receipt_status, created_at DESC)
  WHERE receipt_status = 'NOT_RECEIVED';

NOTIFY pgrst, 'reload schema';
