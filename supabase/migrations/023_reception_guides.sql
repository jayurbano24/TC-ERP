-- Guías de recepción (CAC/PX). Origen histórico: web/migration_v6.sql (SQL Editor).
-- Debe existir antes de 024_sap_transfer_documents (FK reception_guide_id).

CREATE TABLE IF NOT EXISTS public.reception_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  guide_number text NOT NULL,
  category text CHECK (category IN ('equipo', 'accesorio', 'telefono', 'devolucion')),
  status text DEFAULT 'PENDIENTE',
  agency text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reception_guides_reception_id
  ON public.reception_guides (reception_id);

CREATE INDEX IF NOT EXISTS idx_reception_guides_status
  ON public.reception_guides (status);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS reception_guide_id uuid REFERENCES public.reception_guides(id);
