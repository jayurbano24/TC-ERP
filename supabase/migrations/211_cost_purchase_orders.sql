-- =============================================================================
-- 211 — Órdenes de compra (PO) para módulo Costos
-- =============================================================================
-- Pestaña /gestion/costos → PO: líneas de PO con precio, cantidad y totales.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cost_po_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     text NOT NULL,
  po_date       date,
  sku           text,
  description   text NOT NULL DEFAULT '',
  technology    text,
  status        text NOT NULL DEFAULT 'Pendiente de PO/ en Proceso',
  unit_price    numeric(14, 4) NOT NULL DEFAULT 0,
  quantity      integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_po_lines_po_number
  ON public.cost_po_lines (po_number);

CREATE INDEX IF NOT EXISTS idx_cost_po_lines_po_date
  ON public.cost_po_lines (po_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cost_po_lines_status
  ON public.cost_po_lines (status);

CREATE INDEX IF NOT EXISTS idx_cost_po_lines_sku
  ON public.cost_po_lines (sku);

ALTER TABLE public.cost_po_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_po_lines_read_auth ON public.cost_po_lines;
CREATE POLICY cost_po_lines_read_auth
  ON public.cost_po_lines
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS cost_po_lines_write_ops ON public.cost_po_lines;
CREATE POLICY cost_po_lines_write_ops
  ON public.cost_po_lines
  FOR ALL
  TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('supervisor')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('supervisor')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_po_lines TO authenticated;

COMMENT ON TABLE public.cost_po_lines IS
  'Líneas de PO (Purchase Order) para el módulo Costos — precio, cantidad, tecnología y estatus.';

-- Seed inicial (solo si la tabla está vacía) — muestra estructura del Excel Claro/TC
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cost_po_lines LIMIT 1) THEN
    INSERT INTO public.cost_po_lines
      (po_number, po_date, sku, description, technology, status, unit_price, quantity)
    VALUES
      ('4500365031', '2026-05-26', '34037411', 'CABLE MODEM EMTA HITRON CGNV5CLR (REP)', 'EMTA', 'Entregado/Pendiente de Fact.', 4.32, 600),
      ('4500365031', '2026-05-26', '34026214', 'EMTA KAON CG 2200 (REPARADO)', 'EMTA', 'Entregado/Pendiente de Fact.', 2.78, 150),
      ('4500374829', '2026-07-26', '34037411', 'CABLE MODEM EMTA HITRON CGNV5CLR (REP)', 'EMTA', 'Pendiente de PO/ en Proceso', 4.32, 465),
      ('4500374829', '2026-07-26', '34040102', 'ONT GPON HUAWEI HG8245W5-6T (REACONDIC)', 'ONT', 'Pendiente de PO/ en Proceso', 3.64, 1600);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
