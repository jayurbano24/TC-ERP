-- =============================================================================
-- 237 — Devolución de pieza BUENA (sin usar) a stock de bodega
-- Distinto de Bodega Mala: reingresa el mismo tipo de stock (NEW/RECOVERED)
-- y deja movimiento IN_RETURN_GOOD para no perder visibilidad.
-- =============================================================================

ALTER TABLE public.part_dispatch_items
  ADD COLUMN IF NOT EXISTS unused_return_status text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS unused_return_at timestamptz,
  ADD COLUMN IF NOT EXISTS unused_return_by uuid,
  ADD COLUMN IF NOT EXISTS unused_return_by_name text;

DO $$
BEGIN
  ALTER TABLE public.part_dispatch_items
    DROP CONSTRAINT IF EXISTS part_dispatch_items_unused_return_status_check;
  ALTER TABLE public.part_dispatch_items
    ADD CONSTRAINT part_dispatch_items_unused_return_status_check
    CHECK (unused_return_status IN ('NONE', 'RETURNED'));
END $$;

DO $$
BEGIN
  ALTER TABLE public.part_movements DROP CONSTRAINT IF EXISTS part_movements_movement_type_check;
  ALTER TABLE public.part_movements
    ADD CONSTRAINT part_movements_movement_type_check CHECK (movement_type IN (
      'IN_PURCHASE', 'IN_ADJUST', 'RESERVE', 'UNRESERVE',
      'DISPATCH', 'RETURN_BAD', 'OUT_ADJUST', 'SCRAP', 'VENDOR_RETURN',
      'IN_RETURN_GOOD'
    ));
END $$;

CREATE INDEX IF NOT EXISTS idx_part_dispatch_items_unused_return
  ON public.part_dispatch_items (unused_return_status, unused_return_at DESC)
  WHERE unused_return_status = 'RETURNED';

NOTIFY pgrst, 'reload schema';
