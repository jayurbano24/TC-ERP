-- =====================================================================================
-- MIGRACIÓN ZKTECO ADMS
-- =====================================================================================

-- 1. Agregar pin_reloj a la tabla de empleados (si existe)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pin_reloj TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_pin_reloj ON public.employees(pin_reloj);

-- 2. Tabla de dispositivos ZKTeco
CREATE TABLE IF NOT EXISTS public.zk_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sn TEXT NOT NULL UNIQUE, -- Serial Number
    name TEXT,
    ip_address TEXT,
    last_activity TIMESTAMP WITH TIME ZONE,
    state TEXT DEFAULT 'OFFLINE',
    timezone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de marcaciones en crudo (Raw Logs)
CREATE TABLE IF NOT EXISTS public.zk_raw_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_sn TEXT NOT NULL REFERENCES public.zk_devices(sn) ON DELETE CASCADE,
    user_pin TEXT NOT NULL,
    check_time TIMESTAMP WITH TIME ZONE NOT NULL,
    verify_type INTEGER, -- Ej: 1=Huella, 15=Rostro, 4=Tarjeta
    sensor_status INTEGER,
    work_code TEXT,
    reserved TEXT,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabla de comandos hacia el reloj
CREATE TABLE IF NOT EXISTS public.zk_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_sn TEXT NOT NULL REFERENCES public.zk_devices(sn) ON DELETE CASCADE,
    command_str TEXT NOT NULL, -- Ej: DATA UPDATE USERINFO PIN=100 Name=Juan
    status TEXT DEFAULT 'PENDING', -- PENDING, SENT, SUCCESS, FAILED
    return_code TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activar RLS en las nuevas tablas
ALTER TABLE public.zk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zk_raw_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zk_commands ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura/escritura abiertas para personal autenticado y roles de servicio
CREATE POLICY "Permitir full access a autenticados zk_devices" ON public.zk_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir full access a autenticados zk_raw_logs" ON public.zk_raw_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir full access a autenticados zk_commands" ON public.zk_commands FOR ALL USING (true) WITH CHECK (true);
