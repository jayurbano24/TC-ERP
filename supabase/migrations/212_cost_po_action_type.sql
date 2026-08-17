-- =============================================================================
-- 212 — cost_po_lines: Tipos Acciones (plantilla Excel)
-- =============================================================================
ALTER TABLE public.cost_po_lines
  ADD COLUMN IF NOT EXISTS action_type text;

CREATE INDEX IF NOT EXISTS idx_cost_po_lines_action_type
  ON public.cost_po_lines (action_type);

COMMENT ON COLUMN public.cost_po_lines.action_type IS
  'Tipos Acciones de la plantilla Excel (REACONDICIONADO, REPARACIONES, etc.)';
COMMENT ON COLUMN public.cost_po_lines.sku IS
  'Modelo / código de equipo (columna Modelo de la plantilla Excel)';

NOTIFY pgrst, 'reload schema';
