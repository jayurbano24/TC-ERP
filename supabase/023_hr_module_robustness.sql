-- migration: 023_hr_module_robustness.sql
-- Descripción: Implementación de arquitectura final de asistencia (Jornada Inmutable, Auditoría y Trazabilidad)

-- 1. Añadir columnas a time_logs para identificar y clasificar la jornada
ALTER TABLE time_logs
ADD COLUMN IF NOT EXISTS attendance_session_id TEXT,
ADD COLUMN IF NOT EXISTS tipo_jornada TEXT DEFAULT 'Laboral';

-- (Opcional: migrar data histórica si se requiere, pero podemos dejarlo así para registros nuevos)

-- 2. Añadir campos expandidos a time_justifications
ALTER TABLE time_justifications
ADD COLUMN IF NOT EXISTS descripcion TEXT,
ADD COLUMN IF NOT EXISTS evidencia_url TEXT,
ADD COLUMN IF NOT EXISTS aprobado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolucion TEXT DEFAULT 'Pendiente';

-- 3. Crear tabla de auditoría para time_justifications
CREATE TABLE IF NOT EXISTS public.time_justifications_audit (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    justification_id UUID REFERENCES public.time_justifications(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_modificacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    campo_modificado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    motivo_cambio TEXT
);

-- Activar RLS en la nueva tabla de auditoría
ALTER TABLE public.time_justifications_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura a RRHH" ON public.time_justifications_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escritura a RRHH" ON public.time_justifications_audit FOR INSERT TO authenticated WITH CHECK (true);
