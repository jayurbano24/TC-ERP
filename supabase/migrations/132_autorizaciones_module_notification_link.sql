-- 132: Enlace de notificaciones de eliminación → módulo Autorizaciones.

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
      format('Caja %s — motivo: %s. Revise el módulo Autorizaciones.', coalesce(v_box.box_code, p_box_id::text), v_reason),
      'box_deletion_request',
      '/autorizaciones',
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
    'message', 'Solicitud enviada. Revise el módulo Autorizaciones (Gerente General).'
  );
END;
$$;

-- Actualizar enlaces de notificaciones ya creadas
UPDATE public.erp_notifications
SET link = '/autorizaciones'
WHERE kind = 'box_deletion_request'
  AND coalesce(link, '') IN ('/bodega/gestion', '');

NOTIFY pgrst, 'reload schema';
