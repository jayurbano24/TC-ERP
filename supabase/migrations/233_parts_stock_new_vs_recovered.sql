-- =============================================================================
-- 233 — Bodega de Partes: separar stock NUEVO vs RECUPERADO
-- =============================================================================

-- 1) Inventario por tipo de stock (sin romper columnas actuales)
ALTER TABLE IF EXISTS public.parts_inventory
  ADD COLUMN IF NOT EXISTS qty_new_on_hand integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_recovered_on_hand integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_new_reserved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_recovered_reserved integer NOT NULL DEFAULT 0;

-- Backfill inicial para instalaciones existentes:
-- todo lo que ya existía se considera stock NUEVO.
UPDATE public.parts_inventory
SET
  qty_new_on_hand = qty_on_hand,
  qty_recovered_on_hand = 0
WHERE COALESCE(qty_new_on_hand, 0) = 0
  AND COALESCE(qty_recovered_on_hand, 0) = 0
  AND COALESCE(qty_on_hand, 0) > 0;

UPDATE public.parts_inventory
SET
  qty_new_reserved = qty_reserved,
  qty_recovered_reserved = 0
WHERE COALESCE(qty_new_reserved, 0) = 0
  AND COALESCE(qty_recovered_reserved, 0) = 0
  AND COALESCE(qty_reserved, 0) > 0;

DO $$
BEGIN
  ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_new_nonnegative;
  ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_recovered_nonnegative;
  ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_new_reserved_lte_on_hand;
  ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_recovered_reserved_lte_on_hand;
  ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_totals_match_split;
  ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_reserved_totals_match_split;

  ALTER TABLE public.parts_inventory
    ADD CONSTRAINT parts_inventory_new_nonnegative CHECK (qty_new_on_hand >= 0 AND qty_new_reserved >= 0),
    ADD CONSTRAINT parts_inventory_recovered_nonnegative CHECK (qty_recovered_on_hand >= 0 AND qty_recovered_reserved >= 0),
    ADD CONSTRAINT parts_inventory_new_reserved_lte_on_hand CHECK (qty_new_reserved <= qty_new_on_hand),
    ADD CONSTRAINT parts_inventory_recovered_reserved_lte_on_hand CHECK (qty_recovered_reserved <= qty_recovered_on_hand),
    ADD CONSTRAINT parts_inventory_totals_match_split CHECK (qty_on_hand = qty_new_on_hand + qty_recovered_on_hand),
    ADD CONSTRAINT parts_inventory_reserved_totals_match_split CHECK (qty_reserved = qty_new_reserved + qty_recovered_reserved);
END $$;

-- 2) Marcar origen del stock en reservas/despachos/movimientos
ALTER TABLE IF EXISTS public.part_reservations
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'NEW';

ALTER TABLE IF EXISTS public.part_dispatch_items
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'NEW';

ALTER TABLE IF EXISTS public.part_movements
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'NEW';

DO $$
BEGIN
  ALTER TABLE public.part_reservations DROP CONSTRAINT IF EXISTS part_reservations_source_type_check;
  ALTER TABLE public.part_dispatch_items DROP CONSTRAINT IF EXISTS part_dispatch_items_source_type_check;
  ALTER TABLE public.part_movements DROP CONSTRAINT IF EXISTS part_movements_source_type_check;

  ALTER TABLE public.part_reservations
    ADD CONSTRAINT part_reservations_source_type_check CHECK (source_type IN ('NEW', 'RECOVERED'));
  ALTER TABLE public.part_dispatch_items
    ADD CONSTRAINT part_dispatch_items_source_type_check CHECK (source_type IN ('NEW', 'RECOVERED'));
  ALTER TABLE public.part_movements
    ADD CONSTRAINT part_movements_source_type_check CHECK (source_type IN ('NEW', 'RECOVERED'));
END $$;

CREATE INDEX IF NOT EXISTS idx_part_movements_source_type
  ON public.part_movements (source_type, created_at DESC);
