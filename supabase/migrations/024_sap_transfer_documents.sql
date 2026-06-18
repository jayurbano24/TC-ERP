-- Relación Guía Courier (1) → N Traslados SAP → N Equipos
-- Fase CAC: agrupación por documento SAP dentro de cada guía

CREATE TABLE IF NOT EXISTS public.sap_transfer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id UUID NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  reception_guide_id UUID NOT NULL REFERENCES public.reception_guides(id) ON DELETE CASCADE,
  sap_document_number TEXT NOT NULL,
  agency TEXT,
  registered_by TEXT,
  status TEXT NOT NULL DEFAULT 'PENDIENTE_INGRESO_BODEGA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sap_transfer_per_guide UNIQUE (reception_guide_id, sap_document_number)
);

CREATE INDEX IF NOT EXISTS idx_sap_transfer_reception_id
  ON public.sap_transfer_documents(reception_id);

CREATE INDEX IF NOT EXISTS idx_sap_transfer_sap_number
  ON public.sap_transfer_documents(sap_document_number);

CREATE INDEX IF NOT EXISTS idx_sap_transfer_status
  ON public.sap_transfer_documents(status);

-- service_orders / series: vínculo al grupo SAP
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS sap_transfer_id UUID REFERENCES public.sap_transfer_documents(id) ON DELETE SET NULL;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS sap_transfer_id UUID REFERENCES public.sap_transfer_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_sap_transfer_id
  ON public.service_orders(sap_transfer_id);

CREATE INDEX IF NOT EXISTS idx_series_sap_transfer_id
  ON public.series(sap_transfer_id);

-- reception_guides: columnas usadas por backoffice (idempotente)
ALTER TABLE public.reception_guides
  ADD COLUMN IF NOT EXISTS classified_by TEXT,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo TEXT;

-- receptions: guías procesadas (array)
ALTER TABLE public.receptions
  ADD COLUMN IF NOT EXISTS processed_guides TEXT[];

-- Índice único guía por recepción (requerido por upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_guides_reception_guide
  ON public.reception_guides(reception_id, guide_number);

-- OS label explícitamente único
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_orders_os_label
  ON public.service_orders(os_label);
