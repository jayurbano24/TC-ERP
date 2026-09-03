-- =============================================================================
-- 232 — Solicitudes de eliminación de piezas (con stock → Autorizaciones)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.part_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  sku text,
  part_name text,
  qty_on_hand integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  observations text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS part_deletion_requests_one_pending
  ON public.part_deletion_requests (catalog_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS part_deletion_requests_status_idx
  ON public.part_deletion_requests (status, requested_at DESC);

ALTER TABLE public.part_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS part_deletion_requests_read ON public.part_deletion_requests;
CREATE POLICY part_deletion_requests_read ON public.part_deletion_requests
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS part_deletion_requests_write ON public.part_deletion_requests;
CREATE POLICY part_deletion_requests_write ON public.part_deletion_requests
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.part_deletion_requests TO authenticated;

COMMENT ON TABLE public.part_deletion_requests IS
  'Eliminación de piezas con stock: requiere aprobación en /autorizaciones.';
