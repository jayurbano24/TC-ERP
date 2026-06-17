-- ==========================================
-- MIGRATION: CENTRO DE INTEGRACION SAP
-- ==========================================

-- 1. Tabla de Archivos Físicos (Auditoría de Cargas)
CREATE TABLE IF NOT EXISTS public.sap_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    archivo TEXT NOT NULL,
    hash_sha256 TEXT NOT NULL,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    usuario TEXT NOT NULL,
    registros INTEGER DEFAULT 0,
    encontrados INTEGER DEFAULT 0,
    no_encontrados INTEGER DEFAULT 0,
    inconsistencias INTEGER DEFAULT 0,
    tiempo_proceso TEXT,
    estado TEXT NOT NULL -- Ej: 'Completado', 'Fallido'
);

-- 2. Tabla de Sesiones de Validación
CREATE TABLE IF NOT EXISTS public.sap_validation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID REFERENCES public.sap_uploads(id) ON DELETE CASCADE,
    fecha_inicio TIMESTAMPTZ DEFAULT NOW(),
    fecha_fin TIMESTAMPTZ,
    usuario TEXT NOT NULL,
    estado TEXT NOT NULL, -- 'En Espera', 'Procesando', 'Finalizado', 'Finalizado con Advertencias', 'Error', 'Cancelado'
    activa BOOLEAN DEFAULT false
);

-- 3. Modificaciones a la tabla Operativa Base: service_orders (Equipos)
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS sap_integration_status TEXT DEFAULT 'Pendiente Validación',
ADD COLUMN IF NOT EXISTS last_sap_sync TIMESTAMPTZ;

-- 4. Modificaciones a la tabla Operativa Base: series
ALTER TABLE public.series
ADD COLUMN IF NOT EXISTS sap_validation_id UUID REFERENCES public.sap_validation_sessions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sap_status TEXT DEFAULT 'Pendiente';

-- 5. Tabla de Detalles de Validación (Corazón de la Validación en Cascada)
CREATE TABLE IF NOT EXISTS public.sap_validation_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validation_id UUID REFERENCES public.sap_validation_sessions(id) ON DELETE CASCADE,
    equipo_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,
    tipo_serie TEXT, -- 'S1', 'S2', 'S3', 'S4'
    serie TEXT,
    material TEXT,
    descripcion TEXT,
    centro TEXT,
    almacen TEXT,
    lote TEXT,
    estado_sap TEXT,
    valoracion TEXT,
    coincidencia BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Bitácora de Procesos y Auditoría
CREATE TABLE IF NOT EXISTS public.sap_validation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES public.sap_validation_sessions(id) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'INFO', -- 'INFO', 'WARN', 'ERROR', 'STATE_CHANGE'
    serie TEXT, -- Opcional, si es un cambio de estado específico
    estado_anterior TEXT,
    estado_nuevo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices recomendados para agilizar las búsquedas sobre los 300,000 registros
CREATE INDEX IF NOT EXISTS idx_sap_uploads_hash ON public.sap_uploads(hash_sha256);
CREATE INDEX IF NOT EXISTS idx_sap_details_equipo ON public.sap_validation_details(equipo_id);
CREATE INDEX IF NOT EXISTS idx_sap_details_validation ON public.sap_validation_details(validation_id);
CREATE INDEX IF NOT EXISTS idx_so_sap_status ON public.service_orders(sap_integration_status);
CREATE INDEX IF NOT EXISTS idx_series_sap_status ON public.series(sap_status);
