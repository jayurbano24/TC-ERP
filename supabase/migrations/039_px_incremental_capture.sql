-- CHG-006: PX captura incremental (consolidado 039)
-- Staging + locks multi-operador + captura inmediata + finalize.
-- Idempotente: seguro re-ejecutar si 034/035 se aplicaron parcialmente.

-- Limpiar sobrecargas previas (evita ERROR 42725 en GRANT / CREATE)
DROP FUNCTION IF EXISTS public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.join_or_start_px_reception_tx(text, text, text, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.join_or_start_px_reception_tx(text, text, text, integer, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.acquire_box_lock_tx(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.release_box_lock_tx(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_px_box_quantity_tx(uuid, integer, text, integer, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_px_box_quantity_tx(uuid, integer, text, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.close_px_box_tx(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.close_px_box_tx(uuid, integer, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.reopen_px_box_tx(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.finalize_px_reception_tx(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.promote_px_box_tx(uuid, uuid, text);

-- CHG-006 Fase 1: captura incremental PX (staging + RPC capture)

-- 1. Extender estados de caja
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'box_status' AND e.enumlabel = 'en_captura'
  ) THEN
    ALTER TYPE public.box_status ADD VALUE 'en_captura';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'box_status' AND e.enumlabel = 'incompleta'
  ) THEN
    ALTER TYPE public.box_status ADD VALUE 'incompleta';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'box_status' AND e.enumlabel = 'cerrada'
  ) THEN
    ALTER TYPE public.box_status ADD VALUE 'cerrada';
  END IF;
END $$;

ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS declared_quantity integer;

COMMENT ON COLUMN public.boxes.declared_quantity IS
  'Cantidad aceptada por caja (PX incremental). R-048';

-- 2. Lotes PX por caja
CREATE TABLE IF NOT EXISTS public.px_reception_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  technology_name text,
  brand_id uuid REFERENCES public.brands(id),
  model_id uuid REFERENCES public.models(id),
  brand_name text,
  model_name text,
  expected_units integer NOT NULL DEFAULT 0 CHECK (expected_units >= 0),
  material text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_px_reception_lots_box
  ON public.px_reception_lots (box_id);

-- 3. Staging equipos (no inventario oficial)
CREATE TABLE IF NOT EXISTS public.px_reception_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  main_serial text NOT NULL,
  serial_s2 text,
  serial_s3 text,
  serial_s4 text,
  brand_id uuid REFERENCES public.brands(id),
  model_id uuid REFERENCES public.models(id),
  material text,
  capture_status text NOT NULL DEFAULT 'active'
    CHECK (capture_status IN ('active', 'deleted', 'promoted')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid REFERENCES public.profiles(id),
  promoted_at timestamptz,
  promoted_service_order_id uuid REFERENCES public.service_orders(id),
  UNIQUE (reception_id, main_serial)
);

CREATE INDEX IF NOT EXISTS idx_px_equipment_reception_box_active
  ON public.px_reception_equipment (reception_id, box_id)
  WHERE capture_status = 'active';

-- 4. Líneas por serie (duplicados R-042 en recepción)
CREATE TABLE IF NOT EXISTS public.px_reception_serial_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.px_reception_equipment(id) ON DELETE CASCADE,
  reception_id uuid NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  serial_number text NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  UNIQUE (reception_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_px_serial_lines_reception
  ON public.px_reception_serial_lines (reception_id, serial_number);

-- 5. Métricas captura (observabilidad Fase 5)
CREATE TABLE IF NOT EXISTS public.px_capture_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid REFERENCES public.receptions(id) ON DELETE SET NULL,
  box_id uuid REFERENCES public.boxes(id) ON DELETE SET NULL,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'error')),
  duration_ms integer,
  error_code text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_px_capture_metrics_created
  ON public.px_capture_metrics (created_at DESC);

-- RLS: service role bypass; lectura autenticada
ALTER TABLE public.px_reception_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.px_reception_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.px_reception_serial_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.px_capture_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS px_lots_auth ON public.px_reception_lots;
CREATE POLICY px_lots_auth ON public.px_reception_lots FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS px_equipment_auth ON public.px_reception_equipment;
CREATE POLICY px_equipment_auth ON public.px_reception_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS px_serial_lines_auth ON public.px_reception_serial_lines;
CREATE POLICY px_serial_lines_auth ON public.px_reception_serial_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS px_metrics_auth ON public.px_capture_metrics;
CREATE POLICY px_metrics_auth ON public.px_capture_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Helper: serie bloqueada en inventario global
CREATE OR REPLACE FUNCTION public.px_is_serial_blocked_in_inventory(p_serial text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.series%ROWTYPE;
  v_rec_status text;
  v_os_status text;
BEGIN
  IF p_serial IS NULL OR trim(p_serial) = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row
  FROM public.series
  WHERE upper(serial_number) = upper(trim(p_serial))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF lower(v_row.current_status::text) NOT IN (
    'recepcionado_bodega_general',
    'in_central_warehouse',
    'clasificada',
    'received'
  ) THEN
    RETURN false;
  END IF;

  SELECT upper(coalesce(r.status, '')) INTO v_rec_status
  FROM public.receptions r
  WHERE r.id = v_row.current_reception_id;

  IF v_rec_status IN ('ELIMINADO POR BODEGA', 'ELIMINADO', 'ARCHIVADO', 'DEVUELTO') THEN
    RETURN false;
  END IF;

  IF v_row.service_order_id IS NOT NULL THEN
    SELECT upper(coalesce(so.status, '')) INTO v_os_status
    FROM public.service_orders so
    WHERE so.id = v_row.service_order_id;
  ELSE
    SELECT upper(coalesce(so.status, '')) INTO v_os_status
    FROM public.service_orders so
    WHERE upper(so.main_serial) = upper(trim(p_serial))
    ORDER BY so.created_at DESC
    LIMIT 1;
  END IF;

  IF v_os_status IS NOT NULL AND (
    v_os_status LIKE '%DESPACHADO%'
    OR v_os_status LIKE '%ENTREGADO%'
    OR v_os_status LIKE '%SALIDA%'
    OR v_os_status LIKE '%DEVUELTO%'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER TABLE public.px_reception_equipment
  ADD COLUMN IF NOT EXISTS capture_workstation text;
ALTER TABLE public.px_reception_equipment
  ADD COLUMN IF NOT EXISTS captured_by_name text;

-- CHG-006 Fase 1b: colaboración multi-operador, lock por caja, caja parcial, join SAP

-- 1. Columnas recepción
ALTER TABLE public.receptions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.receptions ADD COLUMN IF NOT EXISTS expected_units_sap integer;
ALTER TABLE public.receptions ADD COLUMN IF NOT EXISTS variance_units integer;
ALTER TABLE public.receptions ADD COLUMN IF NOT EXISTS variance_reason text;
ALTER TABLE public.receptions ADD COLUMN IF NOT EXISTS variance_authorized_by uuid REFERENCES public.profiles(id);

-- 2. Columnas caja — lock, asignación, parcial, versionado
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS assigned_operator_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS declared_quantity_original integer;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS quantity_adjustment_reason text;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS quantity_adjusted_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS quantity_adjusted_at timestamptz;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS is_partial_box boolean NOT NULL DEFAULT false;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS partial_box_reason text;

ALTER TABLE public.px_reception_equipment ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.px_reception_equipment ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.px_reception_equipment ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3. Timeline operativo (mínimo Fase 1b)
CREATE TABLE IF NOT EXISTS public.px_reception_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  box_id uuid REFERENCES public.boxes(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  summary text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  actor_display_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_px_activity_reception
  ON public.px_reception_activity (reception_id, created_at DESC);

ALTER TABLE public.px_reception_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS px_activity_auth ON public.px_reception_activity;
CREATE POLICY px_activity_auth ON public.px_reception_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Una recepción PX activa por Documento SAP (R-069)
CREATE UNIQUE INDEX IF NOT EXISTS uq_receptions_px_one_active_sap
ON public.receptions (source, sap_document)
WHERE source = 'px'
  AND sap_document IS NOT NULL
  AND sap_document <> 'SIN-PEDIDO'
  AND upper(coalesce(status, '')) IN (
    'BORRADOR', 'EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO'
  );

-- Helper: log actividad
CREATE OR REPLACE FUNCTION public.px_log_activity(
  p_reception_id uuid,
  p_box_id uuid,
  p_activity_type text,
  p_summary text,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.px_reception_activity (
    reception_id, box_id, activity_type, summary, actor_id, actor_display_name, metadata
  ) VALUES (
    p_reception_id, p_box_id, p_activity_type, p_summary, p_actor_id, p_actor_name, p_metadata
  );
END;
$$;

-- Helper: siguiente REC-XXXXXX
CREATE OR REPLACE FUNCTION public.px_next_guide_number()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer := 800000;
  v_num integer;
BEGIN
  SELECT coalesce(max(
    CASE WHEN guide_number ~ '^REC-[0-9]+$'
      THEN substring(guide_number from '^REC-([0-9]+)$')::integer
      ELSE NULL END
  ), 800000) INTO v_num
  FROM public.receptions
  WHERE source = 'px';

  IF v_num IS NULL THEN
    RETURN 'REC-800000';
  END IF;
  RETURN 'REC-' || (v_num + 1)::text;
END;
$$;

-- RPC: única entrada recepción activa por SAP (R-070)
CREATE OR REPLACE FUNCTION public.join_or_start_px_reception_tx(
  p_sap_document text,
  p_carrier text,
  p_notes text,
  p_expected_units_sap integer DEFAULT NULL,
  p_preferred_guide text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sap text;
  v_rec public.receptions%ROWTYPE;
  v_guide text;
  v_joined boolean := false;
BEGIN
  v_sap := trim(coalesce(p_sap_document, ''));
  IF v_sap = '' OR v_sap = 'SIN-PEDIDO' THEN
    RAISE EXCEPTION 'INVALID_SAP: Documento SAP obligatorio.';
  END IF;

  SELECT * INTO v_rec
  FROM public.receptions
  WHERE source = 'px'
    AND sap_document = v_sap
    AND upper(coalesce(status, '')) IN ('BORRADOR', 'EN_PROCESO', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_joined := true;
  ELSE
    v_guide := trim(coalesce(p_preferred_guide, ''));
    IF v_guide = '' THEN
      v_guide := public.px_next_guide_number();
    END IF;

    INSERT INTO public.receptions (
      source, guide_number, sap_document, carrier, status, notes,
      expected_units, expected_units_sap, received_units
    ) VALUES (
      'px', v_guide, v_sap, coalesce(nullif(trim(p_carrier), ''), 'N/A'),
      'EN_PROCESO', coalesce(p_notes, ''),
      coalesce(p_expected_units_sap, 0), p_expected_units_sap, 0
    )
    RETURNING * INTO v_rec;

    PERFORM public.px_log_activity(
      v_rec.id, NULL, 'reception_started',
      coalesce(p_operator_name, 'Operador') || ' inició recepción ' || v_rec.guide_number,
      p_operator_id, p_operator_name,
      jsonb_build_object('sap_document', v_sap, 'joined', false)
    );
  END IF;

  IF v_joined THEN
    PERFORM public.px_log_activity(
      v_rec.id, NULL, 'operator_joined',
      coalesce(p_operator_name, 'Operador') || ' se unió a ' || v_rec.guide_number,
      p_operator_id, p_operator_name,
      jsonb_build_object('sap_document', v_sap, 'joined', true)
    );
  END IF;

  RETURN jsonb_build_object(
    'reception_id', v_rec.id,
    'guide_number', v_rec.guide_number,
    'joined', v_joined,
    'version', v_rec.version,
    'status', v_rec.status
  );
END;
$$;

-- RPC: lock exclusivo por caja (R-057)
CREATE OR REPLACE FUNCTION public.acquire_box_lock_tx(
  p_box_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_lock_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.';
  END IF;

  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_CLOSED: La caja ya está cerrada.';
  END IF;

  IF v_box.locked_by IS NOT NULL
     AND v_box.lock_expires_at > now()
     AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Caja en uso por otro operador.';
  END IF;

  UPDATE public.boxes SET
    locked_by = p_operator_id,
    locked_at = now(),
    lock_expires_at = now() + (p_lock_minutes || ' minutes')::interval,
    assigned_operator_id = coalesce(assigned_operator_id, p_operator_id),
    status = CASE WHEN status::text IN ('open', 'abierta') THEN 'en_captura'::public.box_status ELSE status END,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_lock_acquired',
    coalesce(p_operator_name, 'Operador') || ' tomó control de ' || v_box.box_code,
    p_operator_id, p_operator_name, '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'box_code', v_box.box_code,
    'locked_by', v_box.locked_by,
    'lock_expires_at', v_box.lock_expires_at,
    'version', v_box.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_box_lock_tx(
  p_box_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'manual_release'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF v_box.locked_by IS NOT NULL
     AND v_box.locked_by IS DISTINCT FROM p_operator_id
     AND p_reason NOT IN ('supervisor_timeout_override', 'supervisor_release') THEN
    RAISE EXCEPTION 'BOX_LOCKED: Solo el operador con lock o un supervisor puede liberar.';
  END IF;

  UPDATE public.boxes SET
    locked_by = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_lock_released',
    'Lock liberado en ' || v_box.box_code || ' (' || p_reason || ')',
    p_operator_id, NULL, jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('box_id', v_box.id, 'version', v_box.version);
END;
$$;

-- RPC: ajustar cantidad declarada caja (R-071)
CREATE OR REPLACE FUNCTION public.adjust_px_box_quantity_tx(
  p_box_id uuid,
  p_new_declared_quantity integer,
  p_reason text,
  p_expected_version integer,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_captured integer;
  v_reason text;
BEGIN
  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio para ajustar cantidad.';
  END IF;
  IF p_new_declared_quantity IS NULL OR p_new_declared_quantity < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: Cantidad inválida.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;
  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_CLOSED: No se puede ajustar una caja cerrada.';
  END IF;
  IF v_box.locked_by IS NOT NULL AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Sin lock sobre esta caja.';
  END IF;

  SELECT count(*)::integer INTO v_captured
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  IF p_new_declared_quantity < v_captured THEN
    RAISE EXCEPTION 'QUANTITY_BELOW_CAPTURED: Ya hay % equipos capturados; no puede bajar a %.', v_captured, p_new_declared_quantity;
  END IF;

  UPDATE public.boxes SET
    declared_quantity_original = coalesce(declared_quantity_original, declared_quantity, capacity),
    declared_quantity = p_new_declared_quantity,
    capacity = p_new_declared_quantity,
    quantity_adjustment_reason = v_reason,
    quantity_adjusted_by = p_operator_id,
    quantity_adjusted_at = now(),
    is_partial_box = (p_new_declared_quantity < coalesce(declared_quantity_original, declared_quantity, capacity)),
    partial_box_reason = CASE
      WHEN p_new_declared_quantity < coalesce(declared_quantity_original, declared_quantity, capacity) THEN v_reason
      ELSE partial_box_reason END,
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  UPDATE public.px_reception_lots SET expected_units = p_new_declared_quantity
  WHERE box_id = p_box_id;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_quantity_adjusted',
    coalesce(p_operator_name, 'Operador') || ' ajustó cantidad de ' || v_box.box_code || ' a ' || p_new_declared_quantity,
    p_operator_id, p_operator_name,
    jsonb_build_object('reason', v_reason, 'captured', v_captured)
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'declared_quantity', v_box.declared_quantity,
    'captured_count', v_captured,
    'is_partial_box', v_box.is_partial_box,
    'version', v_box.version
  );
END;
$$;

-- RPC: cerrar caja — completa o parcial con motivo (R-041, R-072)
CREATE OR REPLACE FUNCTION public.close_px_box_tx(
  p_box_id uuid,
  p_expected_version integer,
  p_partial_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_captured integer;
  v_declared integer;
  v_reason text;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;
  IF v_box.locked_by IS NOT NULL AND v_box.locked_by IS DISTINCT FROM p_operator_id THEN
    RAISE EXCEPTION 'BOX_LOCKED: Sin lock sobre esta caja.';
  END IF;

  SELECT count(*)::integer INTO v_captured
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);
  v_reason := trim(coalesce(p_partial_reason, ''));

  IF v_captured = 0 THEN
    RAISE EXCEPTION 'BOX_EMPTY: La caja no tiene equipos capturados.';
  END IF;

  IF v_captured < v_declared THEN
    IF v_reason = '' THEN
      RAISE EXCEPTION 'PARTIAL_REASON_REQUIRED: Capturados % de % — indique motivo de caja parcial o ajuste cantidad.', v_captured, v_declared;
    END IF;
    UPDATE public.boxes SET
      status = 'cerrada'::public.box_status,
      is_partial_box = true,
      partial_box_reason = v_reason,
      locked_by = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      version = version + 1
    WHERE id = p_box_id
    RETURNING * INTO v_box;
  ELSIF v_captured >= v_declared THEN
    UPDATE public.boxes SET
      status = 'cerrada'::public.box_status,
      locked_by = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      version = version + 1
    WHERE id = p_box_id
    RETURNING * INTO v_box;
  END IF;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_closed',
    coalesce(p_operator_name, 'Operador') || ' cerró ' || v_box.box_code || ' (' || v_captured || '/' || v_declared || ')',
    p_operator_id, p_operator_name,
    jsonb_build_object('partial', v_box.is_partial_box, 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'box_id', v_box.id,
    'status', v_box.status,
    'captured_count', v_captured,
    'declared_quantity', v_declared,
    'is_partial_box', v_box.is_partial_box,
    'version', v_box.version
  );
END;
$$;

-- Actualizar capture: exige lock activo del operador
CREATE OR REPLACE FUNCTION public.capture_px_equipment_tx(
  p_reception_id uuid,
  p_box_id uuid,
  p_main_serial text,
  p_serial_s2 text DEFAULT NULL,
  p_serial_s3 text DEFAULT NULL,
  p_serial_s4 text DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_model_id uuid DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_captured_by uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box public.boxes%ROWTYPE;
  v_main text;
  v_serials text[];
  v_sn text;
  v_active integer;
  v_declared integer;
  v_equipment_id uuid;
  v_slot smallint;
BEGIN
  v_main := upper(trim(coalesce(p_main_serial, '')));
  IF v_main = '' THEN
    RAISE EXCEPTION 'DUPLICATE_INVALID: Serie principal obligatoria.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta capturas.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND reception_id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja está cerrada.';
  END IF;

  IF v_box.locked_by IS NULL OR v_box.lock_expires_at <= now() THEN
    RAISE EXCEPTION 'BOX_NOT_LOCKED: Debe tomar control de la caja antes de escanear.';
  END IF;

  IF v_box.locked_by IS DISTINCT FROM p_captured_by THEN
    RAISE EXCEPTION 'BOX_LOCKED: Otro operador tiene control de esta caja.';
  END IF;

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);
  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  IF v_declared > 0 AND v_active >= v_declared THEN
    RAISE EXCEPTION 'BOX_FULL: La caja alcanzó su capacidad (%).', v_declared;
  END IF;

  v_serials := ARRAY[v_main];
  IF p_serial_s2 IS NOT NULL AND trim(p_serial_s2) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s2)));
  END IF;
  IF p_serial_s3 IS NOT NULL AND trim(p_serial_s3) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s3)));
  END IF;
  IF p_serial_s4 IS NOT NULL AND trim(p_serial_s4) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s4)));
  END IF;

  IF (SELECT count(DISTINCT s) FROM unnest(v_serials) s) <> array_length(v_serials, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_IN_EQUIPMENT: Series duplicadas en el mismo equipo.';
  END IF;

  FOREACH v_sn IN ARRAY v_serials LOOP
    IF EXISTS (
      SELECT 1 FROM public.px_reception_serial_lines sl
      WHERE sl.reception_id = p_reception_id AND upper(sl.serial_number) = v_sn
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_IN_RECEPTION: La serie % ya fue capturada en esta recepción.', v_sn;
    END IF;
    IF public.px_is_serial_blocked_in_inventory(v_sn) THEN
      RAISE EXCEPTION 'DUPLICATE_GLOBAL: La serie % ya está en inventario activo.', v_sn;
    END IF;
  END LOOP;

  INSERT INTO public.px_reception_equipment (
    reception_id, box_id, main_serial, serial_s2, serial_s3, serial_s4,
    brand_id, model_id, material, captured_by, captured_by_name, capture_workstation
  ) VALUES (
    p_reception_id, p_box_id, v_main,
    NULLIF(upper(trim(coalesce(p_serial_s2, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s3, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s4, ''))), ''),
    p_brand_id, p_model_id, NULLIF(trim(coalesce(p_material, '')), ''),
    p_captured_by, NULLIF(trim(coalesce(p_operator_name, '')), ''), NULLIF(trim(coalesce(p_workstation, '')), '')
  )
  RETURNING id INTO v_equipment_id;

  v_slot := 1;
  FOREACH v_sn IN ARRAY v_serials LOOP
    INSERT INTO public.px_reception_serial_lines (
      equipment_id, reception_id, box_id, serial_number, slot
    ) VALUES (v_equipment_id, p_reception_id, p_box_id, v_sn, v_slot);
    v_slot := v_slot + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  UPDATE public.boxes SET
    status = 'incompleta'::public.box_status,
    lock_expires_at = now() + interval '30 minutes',
    version = version + 1
  WHERE id = p_box_id;

  PERFORM public.px_log_activity(
    p_reception_id, p_box_id, 'equipment_captured',
    coalesce(p_operator_name, 'Operador') || ' capturó ' || v_main,
    p_captured_by, p_operator_name, jsonb_build_object('equipment_id', v_equipment_id)
  );

  RETURN jsonb_build_object(
    'equipment_id', v_equipment_id,
    'main_serial', v_main,
    'captured_count', v_active,
    'declared_quantity', v_declared,
    'box_status', (SELECT status::text FROM public.boxes WHERE id = p_box_id)
  );
END;
$$;

-- RPC: reabrir caja cerrada (solo recepción EN_PROCESO)
CREATE OR REPLACE FUNCTION public.reopen_px_box_tx(
  p_box_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
  v_rec public.receptions%ROWTYPE;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La caja fue modificada por otro usuario.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = v_box.reception_id;
  IF upper(coalesce(v_rec.status, '')) <> 'EN_PROCESO' THEN
    RAISE EXCEPTION 'INVALID_STATE: Solo se puede reabrir en recepción EN_PROCESO.';
  END IF;

  IF v_box.status::text NOT IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'INVALID_STATE: La caja no está cerrada.';
  END IF;

  UPDATE public.boxes SET
    status = 'en_captura'::public.box_status,
    locked_by = p_operator_id,
    locked_at = now(),
    lock_expires_at = now() + interval '30 minutes',
    version = version + 1
  WHERE id = p_box_id
  RETURNING * INTO v_box;

  PERFORM public.px_log_activity(
    v_box.reception_id, v_box.id, 'box_reopened',
    coalesce(p_operator_name, 'Operador') || ' reabrió ' || v_box.box_code,
    p_operator_id, p_operator_name,
    jsonb_build_object('reason', coalesce(p_reason, ''))
  );

  RETURN jsonb_build_object('box_id', v_box.id, 'status', v_box.status, 'version', v_box.version);
END;
$$;

-- RPC: finalizar recepción PX — promueve staging → series + OS + BOX-N en bodega
CREATE OR REPLACE FUNCTION public.finalize_px_reception_tx(
  p_reception_id uuid,
  p_expected_version integer,
  p_variance_reason text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box record;
  v_eq record;
  v_os_id uuid;
  v_reentry integer;
  v_new_box_code text;
  v_total_captured integer := 0;
  v_total_expected integer := 0;
  v_variance integer;
  v_is_partial boolean := false;
  v_serials text[];
  v_sn text;
BEGIN
  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;

  IF (v_rec.version IS NOT NULL AND v_rec.version <> p_expected_version) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: La recepción fue modificada por otro usuario.';
  END IF;

  IF upper(coalesce(v_rec.status, '')) = 'CLASIFICADA' THEN
    RETURN jsonb_build_object(
      'reception_id', v_rec.id,
      'guide_number', v_rec.guide_number,
      'status', v_rec.status,
      'received_units', coalesce(v_rec.received_units, 0),
      'expected_units', coalesce(v_rec.expected_units, 0),
      'is_partial', false,
      'already_finalized', true
    );
  END IF;

  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no puede finalizarse en estado %.', v_rec.status;
  END IF;

  SELECT count(*)::integer INTO v_total_captured
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id AND capture_status = 'active';

  IF v_total_captured = 0 THEN
    RAISE EXCEPTION 'RECEPTION_EMPTY: No hay equipos capturados para finalizar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      )
      AND b.status::text NOT IN ('cerrada', 'closed')
  ) THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Debe cerrar todas las cajas con equipos antes de finalizar.';
  END IF;

  SELECT coalesce(sum(coalesce(b.declared_quantity, b.capacity, 0)), 0)::integer INTO v_total_expected
  FROM public.boxes b
  WHERE b.reception_id = p_reception_id
    AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
    AND EXISTS (
      SELECT 1 FROM public.px_reception_equipment e
      WHERE e.box_id = b.id AND e.capture_status = 'active'
    );

  v_variance := v_total_expected - v_total_captured;
  IF v_variance > 0 THEN
    v_is_partial := true;
    IF trim(coalesce(p_variance_reason, '')) = '' THEN
      RAISE EXCEPTION 'VARIANCE_REASON_REQUIRED: Faltan % equipos vs declarado — indique motivo.', v_variance;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.reception_id = p_reception_id AND coalesce(b.is_partial_box, false)
  ) THEN
    v_is_partial := true;
  END IF;

  FOR v_box IN
    SELECT b.*
    FROM public.boxes b
    WHERE b.reception_id = p_reception_id
      AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
      AND EXISTS (
        SELECT 1 FROM public.px_reception_equipment e
        WHERE e.box_id = b.id AND e.capture_status = 'active'
      )
    ORDER BY b.created_at
  LOOP
    v_new_box_code := public.next_box_code();

    UPDATE public.boxes SET
      box_code = v_new_box_code,
      rack_location = 'BODEGA_CENTRAL',
      status = 'closed'::public.box_status,
      capacity = coalesce(v_box.declared_quantity, v_box.capacity, 0),
      closed_at = now()
    WHERE id = v_box.id;

    FOR v_eq IN
      SELECT * FROM public.px_reception_equipment
      WHERE box_id = v_box.id AND capture_status = 'active'
      ORDER BY captured_at
    LOOP
      SELECT count(*)::integer INTO v_reentry
      FROM public.service_orders so
      WHERE upper(so.main_serial) = upper(v_eq.main_serial);

      INSERT INTO public.service_orders (
        reception_id, model_id, brand_id, main_serial, reentry_count, status
      ) VALUES (
        p_reception_id,
        coalesce(v_eq.model_id, v_box.model_id),
        coalesce(v_eq.brand_id, v_box.brand_id),
        v_eq.main_serial,
        v_reentry + 1,
        'INGRESADO'
      )
      RETURNING id INTO v_os_id;

      v_serials := ARRAY[v_eq.main_serial];
      IF v_eq.serial_s2 IS NOT NULL AND trim(v_eq.serial_s2) <> '' THEN
        v_serials := array_append(v_serials, upper(trim(v_eq.serial_s2)));
      END IF;
      IF v_eq.serial_s3 IS NOT NULL AND trim(v_eq.serial_s3) <> '' THEN
        v_serials := array_append(v_serials, upper(trim(v_eq.serial_s3)));
      END IF;
      IF v_eq.serial_s4 IS NOT NULL AND trim(v_eq.serial_s4) <> '' THEN
        v_serials := array_append(v_serials, upper(trim(v_eq.serial_s4)));
      END IF;

      FOREACH v_sn IN ARRAY v_serials LOOP
        INSERT INTO public.series (
          serial_number, brand_id, model_id, material,
          current_status, current_box_id, current_reception_id, service_order_id
        ) VALUES (
          v_sn,
          coalesce(v_eq.brand_id, v_box.brand_id),
          coalesce(v_eq.model_id, v_box.model_id),
          v_eq.material,
          'in_central_warehouse',
          v_box.id,
          p_reception_id,
          v_os_id
        )
        ON CONFLICT (serial_number) DO UPDATE SET
          brand_id = EXCLUDED.brand_id,
          model_id = EXCLUDED.model_id,
          material = EXCLUDED.material,
          current_status = EXCLUDED.current_status,
          current_box_id = EXCLUDED.current_box_id,
          current_reception_id = EXCLUDED.current_reception_id,
          service_order_id = EXCLUDED.service_order_id,
          updated_at = now();
      END LOOP;

      UPDATE public.px_reception_equipment SET
        capture_status = 'promoted',
        promoted_at = now(),
        promoted_service_order_id = v_os_id
      WHERE id = v_eq.id;
    END LOOP;
  END LOOP;

  UPDATE public.receptions SET
    status = 'CLASIFICADA',
    received_units = v_total_captured,
    expected_units = v_total_expected,
    variance_units = CASE WHEN v_variance > 0 THEN v_variance ELSE NULL END,
    variance_reason = CASE WHEN v_variance > 0 THEN trim(p_variance_reason) ELSE NULL END,
    version = coalesce(version, 1) + 1
  WHERE id = p_reception_id
  RETURNING * INTO v_rec;

  PERFORM public.px_log_activity(
    p_reception_id, NULL, 'reception_finalized',
    coalesce(p_operator_name, 'Operador') || ' finalizó ' || v_rec.guide_number,
    p_operator_id, p_operator_name,
    jsonb_build_object(
      'received_units', v_total_captured,
      'expected_units', v_total_expected,
      'is_partial', v_is_partial
    )
  );

  RETURN jsonb_build_object(
    'reception_id', v_rec.id,
    'guide_number', v_rec.guide_number,
    'status', v_rec.status,
    'received_units', v_total_captured,
    'expected_units', v_total_expected,
    'is_partial', v_is_partial
  );
END;
$$;

-- Promover una sola caja (opcional — misma lógica que finalize por caja)
CREATE OR REPLACE FUNCTION public.promote_px_box_tx(
  p_box_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.boxes%ROWTYPE;
BEGIN
  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;
  IF v_box.status::text NOT IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_NOT_CLOSED: Cierre la caja antes de promover.';
  END IF;
  IF coalesce(v_box.rack_location, 'PX_CAPTURA') = 'BODEGA_CENTRAL' THEN
    RETURN jsonb_build_object('box_id', v_box.id, 'already_promoted', true);
  END IF;
  RAISE EXCEPTION 'INVALID_STATE: Use finalizar recepción para ingresar a bodega.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_or_start_px_reception_tx(text, text, text, integer, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acquire_box_lock_tx(uuid, uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_box_lock_tx(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_px_box_quantity_tx(uuid, integer, text, integer, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_px_box_tx(uuid, integer, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_log_activity(uuid, uuid, text, text, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_is_serial_blocked_in_inventory(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_next_guide_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_px_box_tx(uuid, integer, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_px_reception_tx(uuid, integer, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_px_box_tx(uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
