-- =============================================================================
-- 231 — Bodega de Partes: catálogo, inventario, solicitudes, despachos,
--       retornos (logística inversa), compras + status waiting_parts.
-- =============================================================================

-- 1) Nuevo estado de serie: ESPERANDO PARTES
DO $$
BEGIN
  ALTER TYPE public.series_status ADD VALUE IF NOT EXISTS 'waiting_parts';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;

-- 2) Catálogo de repuestos
CREATE TABLE IF NOT EXISTS public.parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
  manufacturer text,
  part_number text,
  uom text NOT NULL DEFAULT 'UN',
  standard_cost numeric(14, 4) NOT NULL DEFAULT 0,
  internal_price numeric(14, 4) NOT NULL DEFAULT 0,
  stock_min integer NOT NULL DEFAULT 0,
  stock_max integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 0,
  requires_return boolean NOT NULL DEFAULT true,
  primary_supplier text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parts_catalog_sku_unique UNIQUE (sku)
);

CREATE INDEX IF NOT EXISTS idx_parts_catalog_brand_model
  ON public.parts_catalog (brand_id, model_id);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_active
  ON public.parts_catalog (active) WHERE active = true;

-- N:N opcional marca/modelo adicionales
CREATE TABLE IF NOT EXISTS public.part_catalog_models (
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  PRIMARY KEY (catalog_id, model_id)
);

-- 3) Inventario físico
CREATE TABLE IF NOT EXISTS public.parts_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  qty_on_hand integer NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  qty_reserved integer NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  location text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parts_inventory_catalog_unique UNIQUE (catalog_id),
  CONSTRAINT parts_inventory_reserved_lte_on_hand CHECK (qty_reserved <= qty_on_hand)
);

CREATE OR REPLACE FUNCTION public.parts_available_qty(p_on_hand integer, p_reserved integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, COALESCE(p_on_hand, 0) - COALESCE(p_reserved, 0));
$$;

-- 4) Movimientos (ledger)
CREATE TABLE IF NOT EXISTS public.part_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  movement_type text NOT NULL CHECK (movement_type IN (
    'IN_PURCHASE', 'IN_ADJUST', 'RESERVE', 'UNRESERVE',
    'DISPATCH', 'RETURN_BAD', 'OUT_ADJUST', 'SCRAP', 'VENDOR_RETURN'
  )),
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric(14, 4) NOT NULL DEFAULT 0,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  ref_type text,
  ref_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_movements_catalog_created
  ON public.part_movements (catalog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_movements_os
  ON public.part_movements (service_order_id) WHERE service_order_id IS NOT NULL;

-- 5) Solicitudes desde Taller
CREATE TABLE IF NOT EXISTS public.part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id),
  series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  serial_number text,
  brand_id uuid REFERENCES public.brands(id),
  model_id uuid REFERENCES public.models(id),
  technician_id uuid REFERENCES auth.users(id),
  technician_name text,
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENTE')),
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'PARTIAL', 'FULFILLED', 'REJECTED', 'CANCELLED'
  )),
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_requests_status_created
  ON public.part_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_requests_os
  ON public.part_requests (service_order_id);

CREATE TABLE IF NOT EXISTS public.part_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.part_requests(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  qty_requested integer NOT NULL CHECK (qty_requested > 0),
  qty_reserved integer NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  qty_dispatched integer NOT NULL DEFAULT 0 CHECK (qty_dispatched >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'RESERVED', 'DISPATCHED', 'REJECTED', 'CANCELLED'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_request_items_request
  ON public.part_request_items (request_id);

-- 6) Reservas
CREATE TABLE IF NOT EXISTS public.part_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_item_id uuid NOT NULL REFERENCES public.part_request_items(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  qty integer NOT NULL CHECK (qty > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'CONSUMED')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_part_reservations_active
  ON public.part_reservations (catalog_id, status) WHERE status = 'ACTIVE';

-- 7) Despachos
CREATE TABLE IF NOT EXISTS public.part_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_number text,
  request_id uuid REFERENCES public.part_requests(id) ON DELETE SET NULL,
  service_order_id uuid REFERENCES public.service_orders(id),
  series_id uuid REFERENCES public.series(id),
  dispatched_by uuid REFERENCES auth.users(id),
  dispatched_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.part_dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.part_dispatches(id) ON DELETE CASCADE,
  request_item_id uuid REFERENCES public.part_request_items(id),
  reservation_id uuid REFERENCES public.part_reservations(id),
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric(14, 4) NOT NULL DEFAULT 0,
  return_required boolean NOT NULL DEFAULT false,
  return_status text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (return_status IN (
    'NOT_REQUIRED', 'PENDING', 'RECEIVED', 'EVALUATED', 'SCRAP', 'VENDOR'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_dispatch_items_return
  ON public.part_dispatch_items (return_status)
  WHERE return_status = 'PENDING';

-- 8) Retornos (Bodega Mala)
CREATE TABLE IF NOT EXISTS public.part_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_item_id uuid NOT NULL REFERENCES public.part_dispatch_items(id),
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  service_order_id uuid REFERENCES public.service_orders(id),
  qty integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED', 'EVALUATED', 'SCRAP', 'VENDOR'
  )),
  received_by uuid REFERENCES auth.users(id),
  received_by_name text,
  evaluation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_returns_status
  ON public.part_returns (status, created_at DESC);

-- 9) Compras
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  supplier text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN', 'PARTIAL', 'RECEIVED', 'CANCELLED'
  )),
  notes text,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_po_unique UNIQUE (po_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  qty_ordered integer NOT NULL CHECK (qty_ordered > 0),
  qty_received integer NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_cost numeric(14, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id),
  catalog_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric(14, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10) Contador request / dispatch numbers
CREATE SEQUENCE IF NOT EXISTS public.part_request_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.part_dispatch_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_part_request_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PR-' || lpad(nextval('public.part_request_number_seq')::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_part_dispatch_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PD-' || lpad(nextval('public.part_dispatch_number_seq')::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_part_request_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_part_dispatch_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parts_available_qty(integer, integer) TO authenticated, service_role;

-- 11) RLS
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'parts_catalog', 'part_catalog_models', 'parts_inventory', 'part_movements',
    'part_requests', 'part_request_items', 'part_reservations',
    'part_dispatches', 'part_dispatch_items', 'part_returns',
    'purchase_orders', 'purchase_order_items', 'purchase_receipts', 'purchase_receipt_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS parts_%I_select ON public.%I', t, t
    );
    EXECUTE format(
      'CREATE POLICY parts_%I_select ON public.%I FOR SELECT TO authenticated USING (true)',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS parts_%I_write ON public.%I', t, t
    );
    EXECUTE format(
      'CREATE POLICY parts_%I_write ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- 12) Workshop counts: incluir esperando_partes
CREATE OR REPLACE FUNCTION public.count_workshop_os_all_tabs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'diagnostico',     (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_workshop' AND service_order_id IS NOT NULL),
    'reparacion',      (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_qc' AND service_order_id IS NOT NULL),
    'esperando_partes',(SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'waiting_parts' AND service_order_id IS NOT NULL),
    'qc',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_validation' AND service_order_id IS NOT NULL),
    'reacondicionado', (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'ready_to_dispatch' AND service_order_id IS NOT NULL),
    'l3',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_control_warehouse' AND service_order_id IS NOT NULL),
    'scraps',          (
      SELECT count(DISTINCT s.service_order_id)
      FROM public.series s
      WHERE s.current_status::text = 'irreparable'
        AND s.service_order_id IS NOT NULL
        AND s.current_box_id IS NULL
        AND NOT public.series_os_has_scrap_box(s.service_order_id)
    ),
    'listo', (
      SELECT count(DISTINCT s.service_order_id)::integer
      FROM public.series s
      WHERE s.current_status::text = 'in_central_warehouse'
        AND s.service_order_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.erp_audit_logs al
          WHERE al.record_id = s.id::text
            AND al.action IN (
              'INGRESO A TALLER',
              'DIAGNÓSTICO INICIAL COMPLETADO',
              'REPARACIÓN COMPLETADA',
              'REPARACIÓN L3 COMPLETADA',
              'CONTROL DE CALIDAD COMPLETADO',
              'REACONDICIONADO COMPLETADO',
              'TRASLADO MASIVO A TALLER'
            )
        )
    )
  );
$$;

COMMENT ON FUNCTION public.count_workshop_os_all_tabs() IS
  'Conteos OS por pestaña Taller; incluye esperando_partes (waiting_parts).';

NOTIFY pgrst, 'reload schema';
