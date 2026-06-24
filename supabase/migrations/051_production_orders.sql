-- Fase 2A — production_orders (CHG-040)
-- PO solo Taller + equipos en bodega; FK nullable en service_orders.

CREATE SEQUENCE IF NOT EXISTS public.production_order_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

CREATE OR REPLACE FUNCTION public.next_production_order_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.production_order_seq')::text, 4, '0');
$$;

CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'BORRADOR'
    CHECK (status IN ('BORRADOR', 'APROBADA', 'EN_PROCESO', 'CERRADA', 'CANCELADA')),
  technology_id uuid REFERENCES public.technologies(id),
  model_id uuid REFERENCES public.models(id),
  target_quantity int NOT NULL DEFAULT 1 CHECK (target_quantity > 0),
  warehouse_scope text NOT NULL DEFAULT 'BODEGA_GENERAL',
  requested_by uuid REFERENCES public.profiles(id),
  requested_by_name text,
  approved_by_name text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  closed_at timestamptz
);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id);

CREATE INDEX IF NOT EXISTS idx_production_orders_status
  ON public.production_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_orders_number
  ON public.production_orders (po_number);

CREATE INDEX IF NOT EXISTS idx_service_orders_production_order
  ON public.service_orders (production_order_id)
  WHERE production_order_id IS NOT NULL;

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_orders_auth ON public.production_orders;
CREATE POLICY production_orders_auth ON public.production_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Crear PO (BORRADOR)
CREATE OR REPLACE FUNCTION public.production_order_create_tx(
  p_technology_id uuid DEFAULT NULL,
  p_model_id uuid DEFAULT NULL,
  p_target_quantity int DEFAULT 1,
  p_notes text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'Operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
BEGIN
  v_number := public.next_production_order_number();

  INSERT INTO public.production_orders (
    po_number, status, technology_id, model_id, target_quantity,
    requested_by, requested_by_name, notes
  ) VALUES (
    v_number, 'BORRADOR', p_technology_id, p_model_id,
    GREATEST(1, COALESCE(p_target_quantity, 1)),
    p_operator_id, p_operator_name, nullif(trim(p_notes), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'po_number', v_number,
    'status', 'BORRADOR',
    'target_quantity', GREATEST(1, COALESCE(p_target_quantity, 1))
  );
END;
$$;

-- Aprobar PO
CREATE OR REPLACE FUNCTION public.production_order_approve_tx(
  p_po_id uuid,
  p_operator_name text DEFAULT 'Supervisor'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po public.production_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.production_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: PO no encontrada.'; END IF;
  IF v_po.status <> 'BORRADOR' THEN
    RAISE EXCEPTION 'INVALID_STATE: Solo se aprueban PO en BORRADOR.';
  END IF;

  UPDATE public.production_orders
  SET status = 'APROBADA',
      approved_by_name = p_operator_name,
      updated_at = timezone('utc', now())
  WHERE id = p_po_id;

  RETURN jsonb_build_object('id', p_po_id, 'status', 'APROBADA', 'po_number', v_po.po_number);
END;
$$;

-- Asignar OS a PO (equipo en bodega)
CREATE OR REPLACE FUNCTION public.production_order_assign_os_tx(
  p_po_id uuid,
  p_service_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po public.production_orders%ROWTYPE;
  v_os public.service_orders%ROWTYPE;
  v_series_status text;
BEGIN
  SELECT * INTO v_po FROM public.production_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: PO no encontrada.'; END IF;
  IF v_po.status NOT IN ('APROBADA', 'EN_PROCESO') THEN
    RAISE EXCEPTION 'INVALID_STATE: PO debe estar APROBADA o EN_PROCESO.';
  END IF;

  SELECT * INTO v_os FROM public.service_orders WHERE id = p_service_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: OS no encontrada.'; END IF;

  IF v_os.production_order_id IS NOT NULL AND v_os.production_order_id <> p_po_id THEN
    RAISE EXCEPTION 'ALREADY_ASSIGNED: La OS ya pertenece a otra PO.';
  END IF;

  SELECT s.current_status INTO v_series_status
  FROM public.series s
  WHERE s.service_order_id = p_service_order_id
  ORDER BY s.created_at
  LIMIT 1;

  IF v_series_status IS NULL THEN
    RAISE EXCEPTION 'NO_SERIES: La OS no tiene series.';
  END IF;

  IF v_series_status NOT IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL') THEN
    RAISE EXCEPTION 'INELIGIBLE: El equipo no está en bodega (estado: %).', v_series_status;
  END IF;

  UPDATE public.service_orders
  SET production_order_id = p_po_id
  WHERE id = p_service_order_id;

  IF v_po.status = 'APROBADA' THEN
    UPDATE public.production_orders
    SET status = 'EN_PROCESO', updated_at = timezone('utc', now())
    WHERE id = p_po_id;
  END IF;

  RETURN jsonb_build_object(
    'po_id', p_po_id,
    'service_order_id', p_service_order_id,
    'po_status', CASE WHEN v_po.status = 'APROBADA' THEN 'EN_PROCESO' ELSE v_po.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_production_order_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.production_order_create_tx(uuid, uuid, int, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.production_order_approve_tx(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.production_order_assign_os_tx(uuid, uuid) TO authenticated, service_role;
