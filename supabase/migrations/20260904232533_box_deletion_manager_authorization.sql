-- Toda eliminación de una caja operativa/finalizada requiere aprobación previa
-- y exclusiva de gurbano@techcommwireless.com.
--
-- La protección vive en un trigger para cubrir UI, REST, RPC y service_role.
-- Sólo se exceptúan cajas temporales que aún no llegaron a inventario:
-- no cerradas, sin series vinculadas y sin equipo PX promovido.

CREATE OR REPLACE FUNCTION public.app_gerente_general_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(array_agg(p.id), '{}'::uuid[])
  FROM public.profiles p
  WHERE lower(trim(coalesce(p.email, ''))) = 'gurbano@techcommwireless.com'
    AND coalesce(p.is_active, true);
$$;

CREATE OR REPLACE FUNCTION public.app_is_box_deletion_manager(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND lower(trim(coalesce(p.email, ''))) = 'gurbano@techcommwireless.com'
      AND coalesce(p.is_active, true)
  );
$$;

REVOKE ALL ON FUNCTION public.app_gerente_general_user_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_is_box_deletion_manager(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_gerente_general_user_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.app_is_box_deletion_manager(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_boxes_require_deletion_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_request_id uuid;
  v_is_governed boolean;
BEGIN
  IF upper(trim(coalesce(NEW.rack_location, ''))) <> 'ELIMINADO'
    OR upper(trim(coalesce(OLD.rack_location, ''))) = 'ELIMINADO'
  THEN
    RETURN NEW;
  END IF;

  -- Una caja temporal fallida/cancelada puede limpiarse sin intervención gerencial.
  -- En cuanto se cierra, recibe series o promueve equipo PX, queda gobernada.
  v_is_governed :=
    lower(coalesce(OLD.status::text, '')) IN ('closed', 'cerrada')
    OR EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.current_box_id = OLD.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.px_reception_equipment pe
      WHERE pe.box_id = OLD.id
        AND pe.capture_status = 'promoted'
    );

  IF NOT v_is_governed THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_request_id := nullif(
      current_setting('app.box_deletion_approved_request_id', true),
      ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_request_id := NULL;
  END;

  IF v_request_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.box_deletion_requests r
    WHERE r.id = v_request_id
      AND r.box_id = OLD.id
      AND r.status = 'approved'
      AND r.reviewed_by = auth.uid()
      AND public.app_is_box_deletion_manager(r.reviewed_by)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BOX_DELETION_REQUIRES_MANAGER_APPROVAL',
      DETAIL = format(
        'La caja %s requiere autorización previa de gurbano@techcommwireless.com.',
        coalesce(OLD.box_code, OLD.id::text)
      ),
      HINT = 'Genere una solicitud y espere su aprobación en el módulo Autorizaciones.';
  END IF;

  NEW.deletion_status := 'eliminated';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boxes_require_deletion_approval ON public.boxes;
CREATE TRIGGER boxes_require_deletion_approval
BEFORE UPDATE OF rack_location ON public.boxes
FOR EACH ROW
EXECUTE FUNCTION public.trg_boxes_require_deletion_approval();

REVOKE ALL ON FUNCTION public.trg_boxes_require_deletion_approval() FROM PUBLIC, anon, authenticated;

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
  v_uid uuid := auth.uid();
  v_manager uuid;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  PERFORM public.app_assert_any_role(
    'admin', 'supervisor', 'bodega', 'receptor_px', 'receptor_cac'
  );

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Se requiere una sesión de usuario.';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Indique el motivo de eliminación (mín. 5 caracteres).';
  END IF;

  SELECT * INTO v_box
  FROM public.boxes
  WHERE id = p_box_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_NOT_FOUND';
  END IF;

  IF upper(coalesce(v_box.rack_location, '')) = 'ELIMINADO' THEN
    RAISE EXCEPTION 'BOX_NOT_ACTIVE: La caja ya fue eliminada.';
  END IF;

  IF coalesce(v_box.deletion_status, '') = 'pending_approval'
    OR EXISTS (
      SELECT 1
      FROM public.box_deletion_requests r
      WHERE r.box_id = p_box_id
        AND r.status = 'pending'
    )
  THEN
    RAISE EXCEPTION 'ALREADY_PENDING: Ya existe una solicitud pendiente para esta caja.';
  END IF;

  IF coalesce(array_length(public.app_gerente_general_user_ids(), 1), 0) = 0 THEN
    RAISE EXCEPTION
      'MANAGER_NOT_CONFIGURED: No existe un perfil activo para gurbano@techcommwireless.com.';
  END IF;

  INSERT INTO public.box_deletion_requests (
    box_id,
    box_code,
    reason,
    observations,
    status,
    requested_by
  )
  VALUES (
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

  FOREACH v_manager IN ARRAY public.app_gerente_general_user_ids() LOOP
    INSERT INTO public.erp_notifications (
      user_id,
      title,
      body,
      kind,
      link,
      payload
    )
    VALUES (
      v_manager,
      'Solicitud de eliminación de caja',
      format(
        'Caja %s — motivo: %s. Requiere su autorización.',
        coalesce(v_box.box_code, p_box_id::text),
        v_reason
      ),
      'box_deletion_request',
      '/autorizaciones',
      jsonb_build_object(
        'request_id', v_req_id,
        'box_id', p_box_id,
        'box_code', v_box.box_code,
        'reason', v_reason,
        'requested_by', v_uid
      )
    );
  END LOOP;

  INSERT INTO public.erp_audit_logs (
    user_id,
    user_role,
    module,
    table_name,
    record_id,
    action,
    severity,
    old_values,
    new_values,
    observations
  )
  VALUES (
    v_uid,
    'SOLICITANTE',
    'Bodega',
    'boxes',
    p_box_id,
    'ELIMINACION_CAJA_SOLICITADA',
    'WARNING',
    jsonb_build_object(
      'rack_location', v_box.rack_location,
      'deletion_status', v_box.deletion_status
    ),
    jsonb_build_object(
      'request_id', v_req_id,
      'box_code', v_box.box_code,
      'deletion_status', 'pending_approval',
      'reason', v_reason
    ),
    nullif(trim(coalesce(p_observations, '')), '')
  );

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'box_id', p_box_id,
    'box_code', v_box.box_code,
    'status', 'pending',
    'message',
    'Solicitud enviada a gurbano@techcommwireless.com. La caja permanece activa hasta su autorización.'
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
  v_box record;
  v_uid uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision, '')));
BEGIN
  IF v_uid IS NULL OR NOT public.app_is_box_deletion_manager(v_uid) THEN
    RAISE EXCEPTION
      'FORBIDDEN: Solo gurbano@techcommwireless.com puede autorizar o rechazar.';
  END IF;

  IF v_decision NOT IN ('approve', 'approved', 'reject', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION: Use approve o reject.';
  END IF;

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

  SELECT * INTO v_box
  FROM public.boxes
  WHERE id = v_req.box_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_NOT_FOUND';
  END IF;

  IF v_decision IN ('approve', 'approved') THEN
    UPDATE public.box_deletion_requests
    SET
      status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_notes = nullif(trim(coalesce(p_review_notes, '')), '')
    WHERE id = p_request_id;

    PERFORM set_config(
      'app.box_deletion_approved_request_id',
      p_request_id::text,
      true
    );

    UPDATE public.boxes
    SET
      rack_location = 'ELIMINADO',
      deletion_status = 'eliminated'
    WHERE id = v_req.box_id;

    INSERT INTO public.erp_audit_logs (
      user_id,
      user_role,
      module,
      table_name,
      record_id,
      action,
      severity,
      old_values,
      new_values,
      observations
    )
    VALUES (
      v_uid,
      'GERENTE_AUTORIZADOR',
      'Bodega',
      'boxes',
      v_req.box_id,
      'ELIMINACION_CAJA_AUTORIZADA',
      'CRITICAL',
      jsonb_build_object(
        'rack_location', v_box.rack_location,
        'deletion_status', v_box.deletion_status
      ),
      jsonb_build_object(
        'request_id', p_request_id,
        'box_code', v_req.box_code,
        'rack_location', 'ELIMINADO',
        'deletion_status', 'eliminated',
        'requested_by', v_req.requested_by,
        'reviewed_by', v_uid
      ),
      nullif(trim(coalesce(p_review_notes, '')), '')
    );

    IF v_req.requested_by IS NOT NULL THEN
      INSERT INTO public.erp_notifications (
        user_id,
        title,
        body,
        kind,
        link,
        payload
      )
      VALUES (
        v_req.requested_by,
        'Eliminación de caja APROBADA',
        format(
          'La caja %s fue autorizada por gurbano@techcommwireless.com y marcada como ELIMINADA.',
          coalesce(v_req.box_code, v_req.box_id::text)
        ),
        'box_deletion_approved',
        '/bodega/gestion',
        jsonb_build_object(
          'request_id', p_request_id,
          'box_id', v_req.box_id,
          'box_code', v_req.box_code,
          'reviewed_by', v_uid
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', 'approved',
      'box_id', v_req.box_id,
      'soft_deleted', true,
      'reviewed_by', v_uid
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

  INSERT INTO public.erp_audit_logs (
    user_id,
    user_role,
    module,
    table_name,
    record_id,
    action,
    severity,
    old_values,
    new_values,
    observations
  )
  VALUES (
    v_uid,
    'GERENTE_AUTORIZADOR',
    'Bodega',
    'boxes',
    v_req.box_id,
    'ELIMINACION_CAJA_RECHAZADA',
    'WARNING',
    jsonb_build_object(
      'request_id', p_request_id,
      'deletion_status', 'pending_approval'
    ),
    jsonb_build_object(
      'request_id', p_request_id,
      'box_code', v_req.box_code,
      'deletion_status', NULL,
      'requested_by', v_req.requested_by,
      'reviewed_by', v_uid
    ),
    nullif(trim(coalesce(p_review_notes, '')), '')
  );

  IF v_req.requested_by IS NOT NULL THEN
    INSERT INTO public.erp_notifications (
      user_id,
      title,
      body,
      kind,
      link,
      payload
    )
    VALUES (
      v_req.requested_by,
      'Eliminación de caja RECHAZADA',
      format(
        'La solicitud para eliminar %s fue rechazada. La caja continúa activa.',
        coalesce(v_req.box_code, v_req.box_id::text)
      ),
      'box_deletion_rejected',
      '/bodega/gestion',
      jsonb_build_object(
        'request_id', p_request_id,
        'box_id', v_req.box_id,
        'box_code', v_req.box_code,
        'reviewed_by', v_uid
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'rejected',
    'box_id', v_req.box_id,
    'reviewed_by', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bodega_request_box_deletion_tx(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bodega_review_box_deletion_tx(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bodega_request_box_deletion_tx(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodega_review_box_deletion_tx(uuid, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
