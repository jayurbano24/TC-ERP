-- 042: Libro de movimientos Bodega Central (diseño objetivo - FASE 1)
-- Ejecutar cuando se cablee el frontend a logWarehouseMovement / RPCs atómicas.
-- Objetivo: historial único de INGRESO | SALIDA | TRASLADO | DISPERSION_CAJA con origen, destino, quién y cuándo.

CREATE TABLE IF NOT EXISTS public.warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  movement_type text NOT NULL CHECK (movement_type IN ('INGRESO', 'SALIDA', 'TRASLADO', 'DISPERSION_CAJA')),

  -- Origen / destino lógico (módulo ERP)
  source_module text NOT NULL,  -- ej: recepcion_px, recepcion_cac, backoffice, bodega_manual, taller, despacho
  target_module text,           -- ej: bodega_central, taller_diagnostico, despacho_externo

  -- Ubicación física (rack / área)
  source_location text,
  target_location text,

  -- Actores
  performed_by uuid REFERENCES public.profiles(id),
  performed_by_name text,

  -- Caja (opcional en movimientos parciales por serie)
  box_id uuid REFERENCES public.boxes(id),
  box_code text,

  -- Recepción / guía de contexto
  reception_id uuid REFERENCES public.receptions(id),
  guide_number text,
  reference_doc text,           -- guía despacho TC-INV-xxx, SAP, etc.

  -- Detalle
  series_ids uuid[] DEFAULT '{}',
  series_count integer NOT NULL DEFAULT 0,
  reason text,                  -- motivo (varianza PX, parcial, etc.)
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Vínculo con tablas existentes
  dispatch_id uuid REFERENCES public.dispatches(id),
  audit_log_id uuid REFERENCES public.erp_audit_logs(id),

  -- Anti doble-submit
  idempotency_key uuid UNIQUE
);

-- Constraint de coherencia
ALTER TABLE public.warehouse_movements 
  ADD CONSTRAINT chk_series_count_match 
  CHECK (series_count = coalesce(array_length(series_ids, 1), 0));

CREATE INDEX IF NOT EXISTS idx_wh_movements_box ON public.warehouse_movements(box_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_movements_type ON public.warehouse_movements(movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_movements_series ON public.warehouse_movements USING GIN (series_ids);
CREATE INDEX IF NOT EXISTS idx_wh_movements_reception ON public.warehouse_movements(reception_id);

ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_movements_auth ON public.warehouse_movements;
CREATE POLICY warehouse_movements_auth ON public.warehouse_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.warehouse_movements IS
  'Libro contable de movimientos Bodega Central: ingreso, salida, traslado, dispersion con trazabilidad completa.';

-- Limpieza: cajas BODEGA_CENTRAL sin series (huérfanas) → ELIMINADO
UPDATE public.boxes b
SET rack_location = 'ELIMINADO'
WHERE upper(coalesce(b.rack_location, '')) = 'BODEGA_CENTRAL'
  AND NOT EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.current_box_id = b.id
      AND s.current_status::text = 'in_central_warehouse'
  );

NOTIFY pgrst, 'reload schema';
