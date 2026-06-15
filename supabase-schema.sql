-- ==========================================
-- SCRIPT DE MIGRACIÓN PARA ARQUITECTURA CQRS
-- Ejecuta esto en el SQL Editor de Supabase
-- ==========================================

-- 1. TABLAS CORE DE RECEPCIÓN (Módulo Recepción)
CREATE TABLE IF NOT EXISTS public.log_equipo (
    id TEXT PRIMARY KEY,
    numero_serie TEXT NOT NULL UNIQUE,
    marca TEXT,
    modelo TEXT,
    tipo_dispositivo TEXT,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.log_orden_servicio (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    equipo_id TEXT NOT NULL REFERENCES public.log_equipo(id),
    tipo_recepcion TEXT NOT NULL,
    estado_recepcion TEXT NOT NULL,
    diagnostico_inicial TEXT,
    falla_reportada TEXT,
    guia_px TEXT,
    transporte TEXT,
    version INTEGER DEFAULT 1,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABLA OUTBOX PARA EVENTOS DE DOMINIO (CQRS / EventBus)
CREATE TABLE IF NOT EXISTS public.outbox_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- 3. TABLA FEATURE FLAGS
CREATE TABLE IF NOT EXISTS public.feature_flag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(code, tenant_id, branch_id)
);

-- Habilitar los flags para que el CQRS funcione si lo leen de DB
INSERT INTO public.feature_flag (code, is_enabled, tenant_id)
VALUES 
    ('USE_NEW_RECEPTION_MODULE', true, 'tenant-1'),
    ('USE_NEW_DESPACHO_MODULE', true, 'tenant-1'),
    ('USE_NEW_PROD_DASHBOARD', true, 'tenant-1'),
    ('USE_NEW_RRHH_MODULE', true, 'tenant-1')
ON CONFLICT DO NOTHING;
