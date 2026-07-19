-- =============================================================================
-- 154 — Fase 2: employee_current_status + cierre automático sin salida
-- =============================================================================
-- 1) Tabla de proyección del estado actual por empleado
-- 2) Sync desde kiosk_insert_time_log
-- 3) internal.close_open_attendance_tx — cron: cierra jornadas abiertas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employee_current_status (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  estado_actual text NOT NULL DEFAULT 'FUERA'
    CHECK (estado_actual IN (
      'FUERA', 'LABORANDO', 'DESAYUNO', 'ALMUERZO', 'COMISION', 'PERMISO',
      'SALIDA_FINAL', 'SIN_SALIDA', 'TRABAJO_EXTRA'
    )),
  ultimo_evento text,
  ultimo_time_log_id uuid REFERENCES public.time_logs(id) ON DELETE SET NULL,
  attendance_session_id text,
  llego_tarde_hoy boolean NOT NULL DEFAULT false,
  fecha_estado date NOT NULL DEFAULT (timezone('America/Guatemala', now()))::date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_current_status_estado_idx
  ON public.employee_current_status (estado_actual);

CREATE INDEX IF NOT EXISTS employee_current_status_fecha_idx
  ON public.employee_current_status (fecha_estado);

COMMENT ON TABLE public.employee_current_status IS
  'Proyección del estado de asistencia en tiempo real (Fase 2 motor inteligente).';

ALTER TABLE public.employee_current_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_current_status_select_auth ON public.employee_current_status;
CREATE POLICY employee_current_status_select_auth ON public.employee_current_status
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.employee_current_status FROM PUBLIC;
GRANT SELECT ON public.employee_current_status TO authenticated, service_role;
GRANT ALL ON public.employee_current_status TO service_role;

-- ---------------------------------------------------------------------------
-- Mapear evento → estado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_attendance_estado_from_evento(p_evento text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(replace(trim(COALESCE(p_evento, '')), ' ', '_'))
    WHEN 'INGRESO' THEN 'LABORANDO'
    WHEN 'INGRESO_ESPECIAL' THEN 'LABORANDO'
    WHEN 'DESAYUNO_INICIO' THEN 'DESAYUNO'
    WHEN 'SALIDA_REFACCION' THEN 'DESAYUNO'
    WHEN 'DESAYUNO_FIN' THEN 'LABORANDO'
    WHEN 'REGRESO_REFACCION' THEN 'LABORANDO'
    WHEN 'ALMUERZO_INICIO' THEN 'ALMUERZO'
    WHEN 'SALIDA_ALMUERZO' THEN 'ALMUERZO'
    WHEN 'ALMUERZO_FIN' THEN 'LABORANDO'
    WHEN 'REGRESO_ALMUERZO' THEN 'LABORANDO'
    WHEN 'SALIDA_COMISION' THEN 'COMISION'
    WHEN 'REGRESO_COMISION' THEN 'LABORANDO'
    WHEN 'SALIDA_FINAL' THEN 'SALIDA_FINAL'
    WHEN 'SALIDA_OMITIDA' THEN 'SIN_SALIDA'
    ELSE 'FUERA'
  END;
$$;

REVOKE ALL ON FUNCTION public.app_attendance_estado_from_evento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_attendance_estado_from_evento(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Upsert proyección
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_upsert_employee_current_status(
  p_employee_id uuid,
  p_evento text,
  p_time_log_id uuid,
  p_session text,
  p_estado_marcacion text DEFAULT NULL,
  p_force_estado text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_hoy date := (timezone('America/Guatemala', now()))::date;
  v_tarde boolean := false;
  v_prev public.employee_current_status%ROWTYPE;
BEGIN
  v_estado := COALESCE(
    NULLIF(trim(p_force_estado), ''),
    public.app_attendance_estado_from_evento(p_evento)
  );

  SELECT * INTO v_prev FROM public.employee_current_status WHERE employee_id = p_employee_id;

  IF v_prev.employee_id IS NOT NULL AND v_prev.fecha_estado = v_hoy THEN
    v_tarde := v_prev.llego_tarde_hoy;
  END IF;

  IF upper(replace(trim(COALESCE(p_evento, '')), ' ', '_')) IN ('INGRESO', 'INGRESO_ESPECIAL')
     AND upper(COALESCE(p_estado_marcacion, '')) = 'TARDE' THEN
    v_tarde := true;
  END IF;

  IF upper(replace(trim(COALESCE(p_evento, '')), ' ', '_')) IN ('INGRESO', 'INGRESO_ESPECIAL')
     AND (v_prev.employee_id IS NULL OR v_prev.fecha_estado IS DISTINCT FROM v_hoy) THEN
    -- Nuevo día: reset tarde salvo este ingreso
    v_tarde := (upper(COALESCE(p_estado_marcacion, '')) = 'TARDE');
  END IF;

  INSERT INTO public.employee_current_status AS s (
    employee_id, estado_actual, ultimo_evento, ultimo_time_log_id,
    attendance_session_id, llego_tarde_hoy, fecha_estado, updated_at
  ) VALUES (
    p_employee_id, v_estado, p_evento, p_time_log_id,
    p_session, v_tarde, v_hoy, now()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    estado_actual = EXCLUDED.estado_actual,
    ultimo_evento = EXCLUDED.ultimo_evento,
    ultimo_time_log_id = EXCLUDED.ultimo_time_log_id,
    attendance_session_id = COALESCE(EXCLUDED.attendance_session_id, s.attendance_session_id),
    llego_tarde_hoy = CASE
      WHEN EXCLUDED.fecha_estado IS DISTINCT FROM s.fecha_estado THEN EXCLUDED.llego_tarde_hoy
      ELSE (s.llego_tarde_hoy OR EXCLUDED.llego_tarde_hoy)
    END,
    fecha_estado = EXCLUDED.fecha_estado,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.app_upsert_employee_current_status(uuid, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_upsert_employee_current_status(uuid, text, uuid, text, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Parche: kiosk_insert_time_log sincroniza status
-- ---------------------------------------------------------------------------
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
  v_estado_marc text;
BEGIN
  IF p_device_pin IS DISTINCT FROM public.app_kiosk_biometric_pin() THEN
    RAISE EXCEPTION 'kiosk_unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_punch_payload' USING ERRCODE = '22023';
  END IF;

  v_employee_id := NULLIF(trim(p_payload->>'employee_id'), '')::uuid;
  v_evento := NULLIF(trim(p_payload->>'evento_detectado'), '');
  v_estado_marc := NULLIF(trim(p_payload->>'estado_marcacion'), '');

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
        AND tl.evento_detectado IS DISTINCT FROM 'SALIDA_OMITIDA'
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
    v_estado_marc,
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

  PERFORM public.app_upsert_employee_current_status(
    v_employee_id,
    v_evento,
    v_log_id,
    v_session,
    v_estado_marc,
    NULL
  );

  RETURN jsonb_build_object(
    'id', v_log_id,
    'attendance_session_id', v_session,
    'evento_detectado', v_evento
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cierre de jornadas abiertas (sin marcaje de salida)
-- p_grace_min: minutos tras hora de salida del turno antes de cerrar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.close_open_attendance_tx(
  p_grace_min integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
  r record;
  v_day_key text;
  v_salida text;
  v_salida_ts timestamptz;
  v_now timestamptz := now();
  v_hoy date := (timezone('America/Guatemala', now()))::date;
  v_local_now timestamp := timezone('America/Guatemala', now());
  v_grace int := GREATEST(COALESCE(p_grace_min, 30), 0);
  v_closed int := 0;
  v_log_id uuid;
  v_session text;
  v_dow int;
BEGIN
  v_dow := EXTRACT(DOW FROM v_local_now)::int; -- 0=dom … 6=sáb
  v_day_key := CASE WHEN v_dow = 0 THEN '7' ELSE v_dow::text END;

  FOR r IN
    SELECT
      s.employee_id,
      s.estado_actual,
      s.attendance_session_id,
      s.fecha_estado,
      e.shift_id,
      cs.weekly_schedule
    FROM public.employee_current_status s
    JOIN public.employees e ON e.id = s.employee_id
    LEFT JOIN public.company_shifts cs ON cs.id = e.shift_id
    WHERE s.estado_actual IN ('LABORANDO', 'DESAYUNO', 'ALMUERZO', 'COMISION', 'PERMISO', 'TRABAJO_EXTRA')
  LOOP
    -- 1) Día anterior sin cerrar → cerrar siempre
    IF r.fecha_estado < v_hoy THEN
      NULL;
    ELSE
      -- 2) Mismo día: cerrar solo tras salida programada + gracia
      v_salida := NULL;
      IF r.weekly_schedule IS NOT NULL THEN
        v_salida := NULLIF(trim(r.weekly_schedule -> v_day_key ->> 'salida'), '');
      END IF;

      IF v_salida IS NOT NULL THEN
        BEGIN
          v_salida_ts := (
            date_trunc('day', v_local_now) + (v_salida::time)
          ) AT TIME ZONE 'America/Guatemala';
        EXCEPTION WHEN OTHERS THEN
          v_salida_ts := NULL;
        END;
        IF v_salida_ts IS NULL OR v_now <= (v_salida_ts + make_interval(mins => v_grace)) THEN
          CONTINUE;
        END IF;
      ELSE
        -- Sin horario en el turno: cerrar solo después de las 20:00 (GT)
        IF EXTRACT(HOUR FROM v_local_now) < 20 THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;

    v_session := COALESCE(
      r.attendance_session_id,
      format('ATD-%s-AUTO-%s', to_char(v_hoy, 'YYYYMMDD'), left(r.employee_id::text, 8))
    );

    INSERT INTO public.time_logs (
      employee_id,
      evento_detectado,
      attendance_session_id,
      tipo_jornada,
      estado_marcacion,
      justificacion
    ) VALUES (
      r.employee_id,
      'SALIDA_OMITIDA',
      v_session,
      'Laboral',
      'SIN_SALIDA',
      'Cierre automático: no se registró salida'
    )
    RETURNING id INTO v_log_id;

    PERFORM public.app_upsert_employee_current_status(
      r.employee_id,
      'SALIDA_OMITIDA',
      v_log_id,
      v_session,
      'SIN_SALIDA',
      'SIN_SALIDA'
    );

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'closed', v_closed,
    'grace_min', v_grace,
    'at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION internal.close_open_attendance_tx(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.close_open_attendance_tx(integer) TO service_role;

COMMENT ON FUNCTION internal.close_open_attendance_tx(integer) IS
  'Cron: inserta SALIDA_OMITIDA y marca SIN_SALIDA tras hora de salida + gracia.';

-- ---------------------------------------------------------------------------
-- Backfill proyección desde logs de hoy (Guatemala)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_estado text;
  v_hoy date := (timezone('America/Guatemala', now()))::date;
  v_start timestamptz := (v_hoy::timestamp AT TIME ZONE 'America/Guatemala');
BEGIN
  FOR r IN
    SELECT DISTINCT ON (tl.employee_id)
      tl.employee_id,
      tl.id,
      tl.evento_detectado,
      tl.attendance_session_id,
      tl.estado_marcacion,
      tl.timestamp
    FROM public.time_logs tl
    WHERE tl.timestamp >= v_start
    ORDER BY tl.employee_id, tl.timestamp DESC
  LOOP
    v_estado := public.app_attendance_estado_from_evento(r.evento_detectado);
    PERFORM public.app_upsert_employee_current_status(
      r.employee_id,
      r.evento_detectado,
      r.id,
      r.attendance_session_id,
      r.estado_marcacion,
      v_estado
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
