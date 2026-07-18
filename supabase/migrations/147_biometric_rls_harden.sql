-- =============================================================================
-- 147 — Endurecer RLS biométrico (Security Advisor: rls_policy_always_true)
-- =============================================================================
-- Quita INSERT/UPDATE/DELETE con USING/WITH CHECK (true) en:
--   employee_face_embeddings, face_recognition_logs
-- Escritura autenticada: roles admin / supervisor / gerencia
-- Kiosco (anon): RPCs SECURITY DEFINER validados con PIN de dispositivo
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: ¿puede gestionar biometría desde sesión ERP?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_can_manage_biometrics()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.app_is_admin()
    OR public.app_has_role('admin'::public.app_role)
    OR public.app_has_role('supervisor'::public.app_role)
    OR public.app_has_role('gerencia'::public.app_role),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.app_can_manage_biometrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_can_manage_biometrics() TO authenticated, service_role;

COMMENT ON FUNCTION public.app_can_manage_biometrics() IS
  'RRHH/ops: admin, supervisor o gerencia pueden mutar embeddings.';

-- ---------------------------------------------------------------------------
-- PIN del kiosco (políticas activas o default 1234 — mismo PIN de UI actual)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_kiosk_biometric_pin()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
BEGIN
  BEGIN
    IF to_regclass('public.hr_policies_versions') IS NOT NULL THEN
      SELECT NULLIF(trim(v.settings->>'kiosko_pin_biometrico'), '')
      INTO v_pin
      FROM public.hr_policies_versions v
      WHERE v.is_active = true
      ORDER BY v.version DESC
      LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pin := NULL;
  END;
  RETURN COALESCE(v_pin, '1234');
END;
$$;

REVOKE ALL ON FUNCTION public.app_kiosk_biometric_pin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_kiosk_biometric_pin() TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: enrolar (desactiva modelo previo + inserta capturas)
-- p_captures: [{embedding, pose, quality, brightness, sharpness, contrast, face_size, tilt, model}]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiosk_enroll_face_embeddings(
  p_employee_id uuid,
  p_model text,
  p_captures jsonb,
  p_device_pin text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row jsonb;
BEGIN
  IF p_device_pin IS DISTINCT FROM public.app_kiosk_biometric_pin() THEN
    RAISE EXCEPTION 'kiosk_unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_employee_id IS NULL OR p_model IS NULL OR jsonb_typeof(p_captures) <> 'array' THEN
    RAISE EXCEPTION 'invalid_enrollment_payload' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee_id) THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.employee_face_embeddings
  SET active = false
  WHERE employee_id = p_employee_id
    AND model = p_model
    AND active = true;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_captures)
  LOOP
    INSERT INTO public.employee_face_embeddings (
      employee_id, embedding, pose, quality, brightness, sharpness,
      contrast, face_size, tilt, model, active
    ) VALUES (
      p_employee_id,
      ARRAY(SELECT jsonb_array_elements_text(v_row->'embedding')::real),
      COALESCE(v_row->>'pose', 'FRONT'),
      COALESCE((v_row->>'quality')::numeric, 0),
      NULLIF(v_row->>'brightness', '')::numeric,
      NULLIF(v_row->>'sharpness', '')::numeric,
      NULLIF(v_row->>'contrast', '')::numeric,
      NULLIF(v_row->>'face_size', '')::numeric,
      NULLIF(v_row->>'tilt', '')::numeric,
      COALESCE(NULLIF(v_row->>'model', ''), p_model),
      true
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: desactivar embeddings (re-enrolar / borrar lógico)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiosk_deactivate_face_embeddings(
  p_employee_id uuid,
  p_model text,
  p_device_pin text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_device_pin IS DISTINCT FROM public.app_kiosk_biometric_pin() THEN
    RAISE EXCEPTION 'kiosk_unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_face_embeddings
  SET active = false
  WHERE employee_id = p_employee_id
    AND model = COALESCE(p_model, model)
    AND active = true;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.kiosk_deactivate_face_embeddings(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_deactivate_face_embeddings(uuid, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: insertar log de reconocimiento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiosk_log_face_recognition(
  p_payload jsonb,
  p_device_pin text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_device_pin IS DISTINCT FROM public.app_kiosk_biometric_pin() THEN
    RAISE EXCEPTION 'kiosk_unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.face_recognition_logs (
    employee_id, result, confidence, distance, duration_ms,
    tablet_id, reject_reason, model
  ) VALUES (
    NULLIF(p_payload->>'employee_id', '')::uuid,
    COALESCE(p_payload->>'result', 'ERROR'),
    NULLIF(p_payload->>'confidence', '')::numeric,
    NULLIF(p_payload->>'distance', '')::numeric,
    NULLIF(p_payload->>'duration_ms', '')::integer,
    NULLIF(p_payload->>'tablet_id', ''),
    NULLIF(p_payload->>'reject_reason', ''),
    NULLIF(p_payload->>'model', '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kiosk_log_face_recognition(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_log_face_recognition(jsonb, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants de tabla: anon solo SELECT (match); mutaciones vía RPC o rol ERP
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.employee_face_embeddings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.face_recognition_logs FROM anon;
GRANT SELECT ON public.employee_face_embeddings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_face_embeddings TO authenticated, service_role;
GRANT SELECT, INSERT ON public.face_recognition_logs TO authenticated, service_role;
GRANT UPDATE, DELETE ON public.face_recognition_logs TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Políticas: sin USING/WITH CHECK (true) en mutaciones
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_face_embeddings_select ON public.employee_face_embeddings;
DROP POLICY IF EXISTS employee_face_embeddings_insert ON public.employee_face_embeddings;
DROP POLICY IF EXISTS employee_face_embeddings_update ON public.employee_face_embeddings;
DROP POLICY IF EXISTS employee_face_embeddings_delete ON public.employee_face_embeddings;

CREATE POLICY employee_face_embeddings_select ON public.employee_face_embeddings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY employee_face_embeddings_insert ON public.employee_face_embeddings
  FOR INSERT TO authenticated
  WITH CHECK (public.app_can_manage_biometrics());

CREATE POLICY employee_face_embeddings_update ON public.employee_face_embeddings
  FOR UPDATE TO authenticated
  USING (public.app_can_manage_biometrics())
  WITH CHECK (public.app_can_manage_biometrics());

CREATE POLICY employee_face_embeddings_delete ON public.employee_face_embeddings
  FOR DELETE TO authenticated
  USING (public.app_can_manage_biometrics());

DROP POLICY IF EXISTS face_recognition_logs_select ON public.face_recognition_logs;
DROP POLICY IF EXISTS face_recognition_logs_insert ON public.face_recognition_logs;
DROP POLICY IF EXISTS face_recognition_logs_update ON public.face_recognition_logs;
DROP POLICY IF EXISTS face_recognition_logs_delete ON public.face_recognition_logs;

CREATE POLICY face_recognition_logs_select ON public.face_recognition_logs
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY face_recognition_logs_insert ON public.face_recognition_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY face_recognition_logs_update ON public.face_recognition_logs
  FOR UPDATE TO authenticated
  USING (public.app_can_manage_biometrics())
  WITH CHECK (public.app_can_manage_biometrics());

CREATE POLICY face_recognition_logs_delete ON public.face_recognition_logs
  FOR DELETE TO authenticated
  USING (public.app_is_admin() OR public.app_has_role('admin'::public.app_role));
