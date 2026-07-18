-- =============================================================================
-- 153 — Kiosco: insertar marcaje vía RPC (anon + PIN dispositivo)
-- =============================================================================
-- Migración 110 dejó time_logs INSERT solo para authenticated.
-- El kiosco usa el cliente anon → falla "Error guardando marcaje."
-- Mismo patrón que 147: SECURITY DEFINER + app_kiosk_biometric_pin().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.kiosk_insert_time_log(
  p_payload jsonb,
  p_device_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_evento text;
  v_session text;
  v_log_id uuid;
  v_just_tipo text;
  v_just_desc text;
  v_minutos int;
BEGIN
  IF p_device_pin IS DISTINCT FROM public.app_kiosk_biometric_pin() THEN
    RAISE EXCEPTION 'kiosk_unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_punch_payload' USING ERRCODE = '22023';
  END IF;

  v_employee_id := NULLIF(trim(p_payload->>'employee_id'), '')::uuid;
  v_evento := NULLIF(trim(p_payload->>'evento_detectado'), '');

  IF v_employee_id IS NULL OR v_evento IS NULL THEN
    RAISE EXCEPTION 'invalid_punch_payload' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = v_employee_id) THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_session := NULLIF(trim(p_payload->>'attendance_session_id'), '');
  IF v_session IS NULL THEN
    IF v_evento = 'INGRESO' THEN
      v_session := format(
        'ATD-%s-%s-%s',
        to_char(timezone('utc', now()), 'YYYYMMDD'),
        COALESCE(
          (SELECT e.codigo_empleado FROM public.employees e WHERE e.id = v_employee_id),
          left(v_employee_id::text, 6)
        ),
        lpad((floor(random() * 9000) + 1000)::int::text, 4, '0')
      );
    ELSE
      SELECT tl.attendance_session_id
      INTO v_session
      FROM public.time_logs tl
      WHERE tl.employee_id = v_employee_id
        AND tl.attendance_session_id IS NOT NULL
        AND tl.evento_detectado IS DISTINCT FROM 'SALIDA_FINAL'
      ORDER BY tl.timestamp DESC
      LIMIT 1;

      IF v_session IS NULL THEN
        v_session := format(
          'ATD-%s-%s-%s',
          to_char(timezone('utc', now()), 'YYYYMMDD'),
          COALESCE(
            (SELECT e.codigo_empleado FROM public.employees e WHERE e.id = v_employee_id),
            left(v_employee_id::text, 6)
          ),
          lpad((floor(random() * 9000) + 1000)::int::text, 4, '0')
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.time_logs (
    employee_id,
    evento_detectado,
    attendance_session_id,
    tipo_jornada,
    minutos_retraso_entrada,
    minutos_exceso_almuerzo,
    minutos_salida_anticipada,
    minutos_extra,
    es_dia_extra,
    justificacion,
    hora_entrada_prog,
    hora_salida_prog,
    desayuno_inicio_prog,
    desayuno_fin_prog,
    almuerzo_inicio_prog,
    almuerzo_fin_prog,
    estado_marcacion,
    tardanza_segundos,
    tiempo_desayuno_segundos,
    tiempo_almuerzo_segundos,
    salida_anticipada_segundos,
    horas_extra_segundos
  ) VALUES (
    v_employee_id,
    v_evento,
    v_session,
    COALESCE(NULLIF(trim(p_payload->>'tipo_jornada'), ''), 'Laboral'),
    COALESCE((p_payload->>'minutos_retraso_entrada')::int, 0),
    COALESCE((p_payload->>'minutos_exceso_almuerzo')::int, 0),
    COALESCE((p_payload->>'minutos_salida_anticipada')::int, 0),
    COALESCE((p_payload->>'minutos_extra')::int, 0),
    COALESCE((p_payload->>'es_dia_extra')::boolean, false),
    NULLIF(p_payload->>'justificacion', ''),
    NULLIF(p_payload->>'hora_entrada_prog', '')::time,
    NULLIF(p_payload->>'hora_salida_prog', '')::time,
    NULLIF(p_payload->>'desayuno_inicio_prog', '')::time,
    NULLIF(p_payload->>'desayuno_fin_prog', '')::time,
    NULLIF(p_payload->>'almuerzo_inicio_prog', '')::time,
    NULLIF(p_payload->>'almuerzo_fin_prog', '')::time,
    NULLIF(p_payload->>'estado_marcacion', ''),
    COALESCE((p_payload->>'tardanza_segundos')::int, 0),
    COALESCE((p_payload->>'tiempo_desayuno_segundos')::int, 0),
    COALESCE((p_payload->>'tiempo_almuerzo_segundos')::int, 0),
    COALESCE((p_payload->>'salida_anticipada_segundos')::int, 0),
    COALESCE((p_payload->>'horas_extra_segundos')::int, 0)
  )
  RETURNING id INTO v_log_id;

  v_just_tipo := NULLIF(trim(p_payload->>'justificacion_tipo'), '');
  v_just_desc := NULLIF(trim(p_payload->>'justificacion'), '');
  v_minutos := COALESCE((p_payload->>'minutos_justificacion')::int, 0);

  IF v_just_tipo IS NOT NULL AND v_just_desc IS NOT NULL THEN
    INSERT INTO public.time_justifications (
      time_log_id,
      employee_id,
      tipo,
      minutos_calculados,
      estado,
      descripcion,
      resolucion
    ) VALUES (
      v_log_id,
      v_employee_id,
      v_just_tipo::public.justification_type,
      v_minutos,
      'PENDIENTE'::public.justification_status,
      v_just_desc,
      'Pendiente'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_log_id,
    'attendance_session_id', v_session,
    'evento_detectado', v_evento
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kiosk_insert_time_log(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_insert_time_log(jsonb, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.kiosk_insert_time_log(jsonb, text) IS
  'Kiosco anon: inserta time_logs (+ justificación opcional) validando PIN de dispositivo.';

NOTIFY pgrst, 'reload schema';
