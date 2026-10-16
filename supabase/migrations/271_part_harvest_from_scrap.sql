-- =============================================================================
-- 271 — Harvesting: piezas recuperadas desde equipos Scrap / Irreparables
-- =============================================================================
-- Stock destino: parts_inventory.qty_recovered_on_hand (RECOVERED).
-- Trazabilidad: part_harvest_sessions + part_movements (IN_HARVEST, ref session).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.part_harvest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  serial_number text,
  donor_status text NOT NULL,
  rack_location text,
  os_label text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_harvest_sessions_os
  ON public.part_harvest_sessions (service_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_part_harvest_sessions_series
  ON public.part_harvest_sessions (series_id) WHERE series_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.part_harvest_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.part_harvest_sessions(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  qty integer NOT NULL CHECK (qty > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_harvest_lines_session
  ON public.part_harvest_lines (session_id);

CREATE INDEX IF NOT EXISTS idx_part_harvest_lines_catalog
  ON public.part_harvest_lines (catalog_id);

DO $$
BEGIN
  ALTER TABLE public.part_movements DROP CONSTRAINT IF EXISTS part_movements_movement_type_check;
  ALTER TABLE public.part_movements
    ADD CONSTRAINT part_movements_movement_type_check CHECK (movement_type IN (
      'IN_PURCHASE', 'IN_ADJUST', 'RESERVE', 'UNRESERVE',
      'DISPATCH', 'RETURN_BAD', 'OUT_ADJUST', 'SCRAP', 'VENDOR_RETURN',
      'IN_RETURN_GOOD', 'IN_HARVEST'
    ));
END $$;

ALTER TABLE public.part_harvest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_harvest_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.part_harvest_sessions FROM anon, authenticated;
REVOKE ALL ON public.part_harvest_lines FROM anon, authenticated;
GRANT ALL ON public.part_harvest_sessions TO service_role;
GRANT ALL ON public.part_harvest_lines TO service_role;

NOTIFY pgrst, 'reload schema';
