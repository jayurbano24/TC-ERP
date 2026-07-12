-- =============================================================================
-- 114 — boxes: material + valuation (despacho / master box)
-- =============================================================================
ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS valuation text;

COMMENT ON COLUMN public.boxes.material IS
  'Material SAP esperado/declarado en caja de despacho (master box).';
COMMENT ON COLUMN public.boxes.valuation IS
  'Lote/Valoración SAP esperado/declarado en caja de despacho.';

NOTIFY pgrst, 'reload schema';
