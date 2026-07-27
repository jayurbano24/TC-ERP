-- =============================================================================
-- 170 — Fix cron attendance-close-open (time_logs_evento_detectado_check)
-- =============================================================================
-- Prod error:
--   new row for relation "time_logs" violates check constraint
--   "time_logs_evento_detectado_check"
-- Causa: internal.close_open_attendance_tx insertaba 'SALIDA_OMITIDA'.
-- Fix: insertar 'SALIDA_FINAL' (permitido) + estado_marcacion/justificación de
--      omisión; proyección employee_current_status sigue con 'SALIDA_OMITIDA' → SIN_SALIDA.
-- =============================================================================

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
  v_dow := EXTRACT(DOW FROM v_local_now)::int;
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
    IF r.fecha_estado < v_hoy THEN
      NULL;
    ELSE
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
      'SALIDA_FINAL',
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

CREATE OR REPLACE FUNCTION public.close_open_attendance_tx(
  p_grace_min integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.close_open_attendance_tx(p_grace_min);
$$;

REVOKE ALL ON FUNCTION public.close_open_attendance_tx(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_open_attendance_tx(integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION internal.close_open_attendance_tx(integer) IS
  'Cron: cierra jornadas abiertas con SALIDA_FINAL + SIN_SALIDA; proyección SALIDA_OMITIDA → SIN_SALIDA.';
