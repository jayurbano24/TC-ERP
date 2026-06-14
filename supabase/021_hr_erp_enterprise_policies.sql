-- migration: 021_hr_erp_enterprise_policies.sql
-- Descripción: Tablas y alteraciones para evolucionar el control de asistencia a un ERP completo.

-- 1. Tabla de Políticas Globales (HR_POLICIES)
CREATE TABLE IF NOT EXISTS hr_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tolerancia_ingreso_min INT NOT NULL DEFAULT 10,
    tolerancia_salida_min INT NOT NULL DEFAULT 10,
    duracion_desayuno_min INT NOT NULL DEFAULT 15,
    duracion_almuerzo_min INT NOT NULL DEFAULT 60,
    max_exceso_receso_min INT NOT NULL DEFAULT 5,
    permitir_horas_extra BOOLEAN NOT NULL DEFAULT true,
    requerir_aprobacion_extra BOOLEAN NOT NULL DEFAULT true,
    permitir_marcaje_especial BOOLEAN NOT NULL DEFAULT true,
    kiosko_voz_activa BOOLEAN NOT NULL DEFAULT true,
    kiosko_tiempo_bloqueo_ms INT NOT NULL DEFAULT 4000,
    kiosko_mensaje_bienvenida TEXT DEFAULT 'Bienvenido a Tech Corps Guatemala',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Insertar política por defecto (si no existe)
INSERT INTO hr_policies (tolerancia_ingreso_min, duracion_desayuno_min, duracion_almuerzo_min)
SELECT 10, 15, 60
WHERE NOT EXISTS (SELECT 1 FROM hr_policies LIMIT 1);

-- 2. Alterar company_shifts para permitir sobreescribir configuraciones globales por turno
ALTER TABLE company_shifts 
ADD COLUMN IF NOT EXISTS ventana_desayuno_inicio TIME,
ADD COLUMN IF NOT EXISTS ventana_desayuno_fin TIME,
ADD COLUMN IF NOT EXISTS ventana_almuerzo_inicio TIME,
ADD COLUMN IF NOT EXISTS ventana_almuerzo_fin TIME,
ADD COLUMN IF NOT EXISTS duracion_desayuno_override INT,
ADD COLUMN IF NOT EXISTS duracion_almuerzo_override INT,
ADD COLUMN IF NOT EXISTS permitir_horas_extra BOOLEAN DEFAULT true;

-- 3. Tabla de Justificaciones y Aprobaciones
CREATE TYPE justification_type AS ENUM ('LLEGADA_TARDE', 'SALIDA_ANTICIPADA', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'HORA_EXTRA', 'MARCAJE_ESPECIAL');
CREATE TYPE justification_status AS ENUM ('PENDIENTE', 'APROBADA_SUPERVISOR', 'RECHAZADA', 'CERRADA_RRHH');

CREATE TABLE IF NOT EXISTS time_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time_log_id UUID NOT NULL REFERENCES time_logs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    tipo justification_type NOT NULL,
    minutos_calculados INT NOT NULL DEFAULT 0,
    motivo_empleado TEXT,
    estado justification_status NOT NULL DEFAULT 'PENDIENTE',
    aprobado_por_supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    comentario_supervisor TEXT,
    cerrado_por_rrhh_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla de Auditoría (Audit Logs)
CREATE TABLE IF NOT EXISTS hr_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    modulo TEXT NOT NULL,
    accion TEXT NOT NULL,
    estado_anterior JSONB,
    estado_nuevo JSONB,
    ip TEXT,
    dispositivo TEXT,
    navegador TEXT
);

-- Habilitar RLS en las nuevas tablas
ALTER TABLE hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_justifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad Base
CREATE POLICY "Políticas visibles para usuarios autenticados" ON hr_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Justificaciones visibles para el empleado o admins" ON time_justifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir inserción de justificaciones (Kiosko)" ON time_justifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Permitir actualización a supervisores/rrhh" ON time_justifications FOR UPDATE TO authenticated USING (true);

-- Trigger para updated_at en hr_policies
CREATE OR REPLACE FUNCTION update_hr_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hr_policies_modtime
BEFORE UPDATE ON hr_policies
FOR EACH ROW EXECUTE PROCEDURE update_hr_policies_updated_at();

-- Trigger para updated_at en time_justifications
CREATE OR REPLACE FUNCTION update_time_just_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_time_just_modtime
BEFORE UPDATE ON time_justifications
FOR EACH ROW EXECUTE PROCEDURE update_time_just_updated_at();
