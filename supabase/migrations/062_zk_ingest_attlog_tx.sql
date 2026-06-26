-- SEC/TX-03 — zk_ingest_attlog_tx: ingesta atómica e idempotente de marcaciones ZKTeco.
--
-- Antes, /api/iclock/cdata insertaba cada marcación ATTLOG por separado: si fallaba
-- la línea N las anteriores quedaban a medias, y los reintentos del reloj duplicaban
-- marcaciones. Esta función actualiza el device, inserta todas las marcaciones del
-- lote en una sola transacción y es idempotente (índice único device_sn+user_pin+check_time
-- con ON CONFLICT DO NOTHING). Devuelve los ids realmente insertados para procesarlos.
--
-- NOTA: el esquema base de ZKTeco (supabase/024_zkteco_adms_schema.sql) puede no estar
-- aplicado en todos los entornos. El dedup y el índice se ejecutan sólo si la tabla
-- existe; la función se crea igualmente (sus referencias se resuelven en runtime).

DO $$
BEGIN
  IF to_regclass('public.zk_raw_logs') IS NOT NULL THEN
    -- 1) Deduplicar marcaciones idénticas previas (reintentos) antes del índice único
    DELETE FROM public.zk_raw_logs a
    USING public.zk_raw_logs b
    WHERE a.ctid < b.ctid
      AND a.device_sn = b.device_sn
      AND a.user_pin = b.user_pin
      AND a.check_time = b.check_time;

    -- 2) Índice único para idempotencia
    CREATE UNIQUE INDEX IF NOT EXISTS ux_zk_raw_logs_dedup
      ON public.zk_raw_logs (device_sn, user_pin, check_time);
  ELSE
    RAISE NOTICE 'zk_raw_logs no existe; se omiten dedup e índice. Aplica 024_zkteco_adms_schema.sql para activar iclock.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.zk_ingest_attlog_tx(
  p_device_sn text,
  p_logs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_ids uuid[];
BEGIN
  -- Mantener el device online (y garantizar la FK de zk_raw_logs)
  INSERT INTO public.zk_devices (sn, state, last_activity)
  VALUES (p_device_sn, 'ONLINE', now())
  ON CONFLICT (sn) DO UPDATE SET state = 'ONLINE', last_activity = now();

  -- Inserción set-based e idempotente; sólo retorna las marcaciones nuevas
  WITH ins AS (
    INSERT INTO public.zk_raw_logs (
      device_sn, user_pin, check_time, verify_type, sensor_status, processed
    )
    SELECT p_device_sn, x.user_pin, x.check_time, x.verify_type, x.sensor_status, false
    FROM jsonb_to_recordset(p_logs) AS x(
      user_pin text, check_time timestamptz, verify_type int, sensor_status int
    )
    WHERE nullif(trim(x.user_pin), '') IS NOT NULL
      AND x.check_time IS NOT NULL
    ON CONFLICT (device_sn, user_pin, check_time) DO NOTHING
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_inserted_ids FROM ins;

  RETURN jsonb_build_object('inserted_ids', v_inserted_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.zk_ingest_attlog_tx(text, jsonb) TO authenticated, service_role, anon;
