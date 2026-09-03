-- 220: Schema base ZKTeco ADMS (faltaba en prod — 024 nunca se aplicó como migration).
-- Sin estas tablas /api/iclock/* ACK al reloj pero no persiste device ni ATTLOG.

CREATE TABLE IF NOT EXISTS public.zk_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sn TEXT NOT NULL UNIQUE,
    name TEXT,
    ip_address TEXT,
    last_activity TIMESTAMP WITH TIME ZONE,
    state TEXT DEFAULT 'OFFLINE',
    timezone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.zk_raw_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_sn TEXT NOT NULL REFERENCES public.zk_devices(sn) ON DELETE CASCADE,
    user_pin TEXT NOT NULL,
    check_time TIMESTAMP WITH TIME ZONE NOT NULL,
    verify_type INTEGER,
    sensor_status INTEGER,
    work_code TEXT,
    reserved TEXT,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.zk_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_sn TEXT NOT NULL REFERENCES public.zk_devices(sn) ON DELETE CASCADE,
    command_str TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    return_code TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pin_reloj TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_pin_reloj ON public.employees(pin_reloj);

-- Dedup ATTLOG (idempotencia de reintentos del reloj)
DO $$
BEGIN
  IF to_regclass('public.zk_raw_logs') IS NOT NULL THEN
    DELETE FROM public.zk_raw_logs a
    USING public.zk_raw_logs b
    WHERE a.ctid < b.ctid
      AND a.device_sn = b.device_sn
      AND a.user_pin = b.user_pin
      AND a.check_time = b.check_time;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_zk_raw_logs_dedup
      ON public.zk_raw_logs (device_sn, user_pin, check_time);
  END IF;
END $$;

ALTER TABLE public.zk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zk_raw_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zk_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir full access a autenticados zk_devices" ON public.zk_devices;
DROP POLICY IF EXISTS "Permitir full access a autenticados zk_raw_logs" ON public.zk_raw_logs;
DROP POLICY IF EXISTS "Permitir full access a autenticados zk_commands" ON public.zk_commands;

CREATE POLICY "Permitir full access a autenticados zk_devices"
  ON public.zk_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir full access a autenticados zk_raw_logs"
  ON public.zk_raw_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir full access a autenticados zk_commands"
  ON public.zk_commands FOR ALL USING (true) WITH CHECK (true);

-- Reafirmar RPC + grants (por si 062 existía sin tablas)
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
  INSERT INTO public.zk_devices (sn, state, last_activity)
  VALUES (p_device_sn, 'ONLINE', now())
  ON CONFLICT (sn) DO UPDATE SET state = 'ONLINE', last_activity = now();

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
