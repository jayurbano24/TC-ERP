-- 131: Pre-autorización para eliminar cajas de bodega (Gerente General).
-- Soft delete solo tras APROBADA. No borra series/OS (trazabilidad).

CREATE TABLE IF NOT EXISTS public.box_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES public.boxes(id),
  box_code text,
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

CREATE UNIQUE INDEX IF NOT EXISTS box_deletion_requests_one_pending
  ON public.box_deletion_requests (box_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS box_deletion_requests_status_idx
  ON public.box_deletion_requests (status, requested_at DESC);

ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS deletion_status text;

COMMENT ON COLUMN public.boxes.deletion_status IS
  'null=activa; pending_approval=espera GG; rejected=rechazada; eliminated=soft delete';

CREATE TABLE IF NOT EXISTS public.erp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'info',
  link text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_notifications_user_unread_idx
  ON public.erp_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.box_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_deletion_requests_read ON public.box_deletion_requests;
CREATE POLICY box_deletion_requests_read ON public.box_deletion_requests
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS box_deletion_requests_no_direct_write ON public.box_deletion_requests;
CREATE POLICY box_deletion_requests_no_direct_write ON public.box_deletion_requests
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS erp_notifications_own_read ON public.erp_notifications;
CREATE POLICY erp_notifications_own_read ON public.erp_notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS erp_notifications_own_update ON public.erp_notifications;
CREATE POLICY erp_notifications_own_update ON public.erp_notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Helper: usuarios con puesto GERENTE GENERAL
CREATE OR REPLACE FUNCTION public.app_gerente_general_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(array_agg(DISTINCT ur.user_id), '{}'::uuid[])
  FROM public.user_roles ur
  INNER JOIN public.hr_positions hp ON hp.id = ur.role_id
  WHERE upper(trim(hp.name)) = 'GERENTE GENERAL';
$$;

CREATE OR REPLACE FUNCTION public.bodega_request_box_deletion_tx(
  p_box_id uuid,
  p_reason text,
  p_observations text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box record;
  v_req_id uuid;
  v_uid uuid;
  v_gg uuid;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Indique el motivo de eliminación (mín. 5 caracteres).';
  END IF;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_NOT_FOUND';
  END IF;

  IF upper(coalesce(v_box.rack_location, '')) IN ('ELIMINADO', 'DESPACHO') THEN
    RAISE EXCEPTION 'BOX_NOT_ACTIVE: La caja ya no está operativa.';
  END IF;

  IF coalesce(v_box.deletion_status, '') = 'pending_approval' THEN
    RAISE EXCEPTION 'ALREADY_PENDING: Ya existe una solicitud pendiente para esta caja.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.box_deletion_requests r
    WHERE r.box_id = p_box_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'ALREADY_PENDING: Ya existe una solicitud pendiente para esta caja.';
  END IF;

  INSERT INTO public.box_deletion_requests (
    box_id, box_code, reason, observations, status, requested_by
  ) VALUES (
    p_box_id,
    v_box.box_code,
    v_reason,
    nullif(trim(coalesce(p_observations, '')), ''),
    'pending',
    v_uid
  )
  RETURNING id INTO v_req_id;

  UPDATE public.boxes
  SET deletion_status = 'pending_approval'
  WHERE id = p_box_id;

  FOREACH v_gg IN ARRAY public.app_gerente_general_user_ids() LOOP
    INSERT INTO public.erp_notifications (user_id, title, body, kind, link, payload)
    VALUES (
      v_gg,
      'Solicitud de eliminación de caja',
      format('Caja %s — motivo: %s. Requiere autorización del Gerente General.', coalesce(v_box.box_code, p_box_id::text), v_reason),
      'box_deletion_request',
      '/bodega/gestion',
      jsonb_build_object(
        'request_id', v_req_id,
        'box_id', p_box_id,
        'box_code', v_box.box_code,
        'reason', v_reason
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'box_id', p_box_id,
    'box_code', v_box.box_code,
    'status', 'pending',
    'message', 'Solicitud enviada. La caja queda Pendiente de Aprobación hasta autorización del Gerente General.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bodega_review_box_deletion_tx(
  p_request_id uuid,
  p_decision text,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_uid uuid;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_notify_uid uuid;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Solo el Gerente General puede autorizar o rechazar.';
  END IF;

  IF v_decision NOT IN ('approve', 'approved', 'reject', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION: Use approve o reject.';
  END IF;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  SELECT * INTO v_req
  FROM public.box_deletion_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'NOT_PENDING: La solicitud ya fue resuelta (%).', v_req.status;
  END IF;

  IF v_decision IN ('approve', 'approved') THEN
    UPDATE public.box_deletion_requests
    SET
      status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_notes = nullif(trim(coalesce(p_review_notes, '')), '')
    WHERE id = p_request_id;

    -- Soft delete: no borra series ni OS (auditoría / conciliación)
    UPDATE public.boxes
    SET
      rack_location = 'ELIMINADO',
      deletion_status = 'eliminated'
    WHERE id = v_req.box_id;

    IF v_req.requested_by IS NOT NULL THEN
      INSERT INTO public.erp_notifications (user_id, title, body, kind, link, payload)
      VALUES (
        v_req.requested_by,
        'Eliminación de caja APROBADA',
        format('La caja %s fue autorizada y marcada como ELIMINADA.', coalesce(v_req.box_code, v_req.box_id::text)),
        'box_deletion_approved',
        '/bodega/gestion',
        jsonb_build_object('request_id', p_request_id, 'box_id', v_req.box_id, 'box_code', v_req.box_code)
      );
    END IF;

    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', 'approved',
      'box_id', v_req.box_id,
      'soft_deleted', true
    );
  END IF;

  UPDATE public.box_deletion_requests
  SET
    status = 'rejected',
    reviewed_by = v_uid,
    reviewed_at = now(),
    review_notes = nullif(trim(coalesce(p_review_notes, '')), '')
  WHERE id = p_request_id;

  UPDATE public.boxes
  SET deletion_status = NULL
  WHERE id = v_req.box_id
    AND coalesce(deletion_status, '') = 'pending_approval';

  IF v_req.requested_by IS NOT NULL THEN
    INSERT INTO public.erp_notifications (user_id, title, body, kind, link, payload)
    VALUES (
      v_req.requested_by,
      'Eliminación de caja RECHAZADA',
      format('La solicitud para eliminar %s fue rechazada. La caja continúa activa.', coalesce(v_req.box_code, v_req.box_id::text)),
      'box_deletion_rejected',
      '/bodega/gestion',
      jsonb_build_object('request_id', p_request_id, 'box_id', v_req.box_id, 'box_code', v_req.box_code)
    );
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'rejected',
    'box_id', v_req.box_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bodega_list_box_deletion_requests(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  box_id uuid,
  box_code text,
  reason text,
  observations text,
  status text,
  requested_by uuid,
  requested_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  rack text,
  capacity integer,
  equipos_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.box_id,
    r.box_code,
    r.reason,
    r.observations,
    r.status,
    r.requested_by,
    r.requested_at,
    r.reviewed_by,
    r.reviewed_at,
    r.review_notes,
    b.rack_location,
    b.capacity,
    (
      SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::bigint
      FROM public.series s
      WHERE s.current_box_id = r.box_id
    ) AS equipos_count
  FROM public.box_deletion_requests r
  LEFT JOIN public.boxes b ON b.id = r.box_id
  WHERE (
      p_status IS NULL
      OR trim(p_status) = ''
      OR lower(trim(p_status)) = 'all'
      OR r.status = lower(trim(p_status))
    )
  ORDER BY r.requested_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

GRANT SELECT ON public.box_deletion_requests TO authenticated;
GRANT SELECT, UPDATE ON public.erp_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_gerente_general_user_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodega_request_box_deletion_tx(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodega_review_box_deletion_tx(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodega_list_box_deletion_requests(text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
