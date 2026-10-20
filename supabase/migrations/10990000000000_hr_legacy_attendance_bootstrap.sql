-- =============================================================================
-- 10990000000000 — Bootstrap HR / asistencia (fuentes fuera de migrations/)
-- Generado por scripts/assemble-hr-legacy-migration.mjs — no editar a mano.
-- Orden lex: después de 109_* y antes de 110_rls_cleanup (time_logs / employees).
-- =============================================================================


-- >>> BEGIN hr_legacy/000_hr_attendance_core.sql (sha256:7344cc233db86829cf1621e11db8327c44dd9d5e805116445aeb07cc181a2473)
-- =============================================================================
-- HR / asistencia — esquema base (nunca estuvo en migrations/ del repo).
-- Reconstruido desde: supabase/020–023, migration_v2–v5, proyecciones TS (RRHH/kiosko),
-- migraciones 110+, 146 (face_embedding legacy), 153/154 (time_logs), 209 (absences).
-- Idempotente: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- company_shifts (migration_v2 weekly_schedule + 021 overrides)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ventana_desayuno_inicio time,
  ventana_desayuno_fin time,
  ventana_almuerzo_inicio time,
  ventana_almuerzo_fin time,
  duracion_desayuno_override integer,
  duracion_almuerzo_override integer,
  permitir_horas_extra boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- employees (expediente + kiosko; ampliado en 020 y app RRHH)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_empleado text UNIQUE,
  nombre_completo text NOT NULL,
  departamento text,
  shift_id uuid REFERENCES public.company_shifts(id) ON DELETE SET NULL,
  status text DEFAULT 'Activo',
  estado_rrhh text DEFAULT 'Activo',
  tipo_contrato text,
  fecha_inicio_labores date,
  sueldo_mensual_base numeric(12, 2) DEFAULT 0,
  bono_metas numeric(10, 2) DEFAULT 0,
  inicio_temporada date,
  fin_temporada date,
  contrato_url text,
  fotografia_url text,
  carnet text,
  dpi text,
  nit text,
  igss text,
  fecha_nacimiento date,
  sexo text,
  estado_civil text,
  direccion text,
  telefono text,
  email text,
  contacto_emergencia jsonb DEFAULT '{}'::jsonb,
  banco text,
  numero_cuenta text,
  tipo_pago text,
  fecha_baja date,
  department_id uuid,
  position_id uuid,
  employee_type_id uuid,
  pin_reloj text,
  face_embedding jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_pin_reloj ON public.employees(pin_reloj)
  WHERE pin_reloj IS NOT NULL;

-- ---------------------------------------------------------------------------
-- time_logs (022 exact timestamps + 023 session + migration_v3–v5 + kiosk RPC)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  evento_detectado text NOT NULL,
  attendance_session_id text,
  tipo_jornada text DEFAULT 'Laboral',
  minutos_retraso_entrada integer DEFAULT 0,
  minutos_exceso_almuerzo integer DEFAULT 0,
  minutos_salida_anticipada integer DEFAULT 0,
  minutos_extra integer DEFAULT 0,
  es_dia_extra boolean DEFAULT false,
  justificacion text,
  razon_tardanza text,
  hora_entrada_prog time,
  hora_salida_prog time,
  desayuno_inicio_prog time,
  desayuno_fin_prog time,
  almuerzo_inicio_prog time,
  almuerzo_fin_prog time,
  estado_marcacion text,
  tiempo_laborado_segundos integer DEFAULT 0,
  tiempo_efectivo_segundos integer DEFAULT 0,
  tiempo_desayuno_segundos integer DEFAULT 0,
  tiempo_almuerzo_segundos integer DEFAULT 0,
  tiempo_fuera_segundos integer DEFAULT 0,
  tardanza_segundos integer DEFAULT 0,
  salida_anticipada_segundos integer DEFAULT 0,
  horas_extra_segundos integer DEFAULT 0,
  tiempo_tolerancia_segundos integer DEFAULT 0,
  tiempo_excedido_segundos integer DEFAULT 0,
  segundos_justificables integer DEFAULT 0,
  segundos_no_justificados integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_logs_employee_ts_idx
  ON public.time_logs (employee_id, timestamp DESC);

-- ---------------------------------------------------------------------------
-- employee_absences (209 cleanup, auditoría RRHH)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo_falta text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_absences_employee_fecha_idx
  ON public.employee_absences (employee_id, fecha);

-- ---------------------------------------------------------------------------
-- hr_payroll_closures (+ details para políticas 110; UI usa closures)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  fecha_proceso timestamptz DEFAULT now(),
  estado text NOT NULL DEFAULT 'Procesado',
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_empleados integer DEFAULT 0,
  total_salarios numeric(14, 2) DEFAULT 0,
  total_liquido numeric(14, 2) DEFAULT 0,
  total_igss_laboral numeric(14, 2) DEFAULT 0,
  total_isr_retenido numeric(14, 2) DEFAULT 0,
  total_igss_patronal numeric(14, 2) DEFAULT 0,
  total_irtra numeric(14, 2) DEFAULT 0,
  total_intecap numeric(14, 2) DEFAULT 0,
  costo_total_patronal numeric(14, 2) DEFAULT 0,
  costo_total_planilla numeric(14, 2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_closure_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.hr_payroll_closures(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_closure_details ENABLE ROW LEVEL SECURITY;

-- <<< END hr_legacy/000_hr_attendance_core.sql

-- >>> BEGIN 020_hr_module_phase1.sql (sha256:4dcb624658af7c634e53bd87ce29fc017e4420db8c1ada7d295dd46fb4fc5c67)
-- =====================================================================================
-- MIGRACIÓN FASE 1: MÓDULO DE RECURSOS HUMANOS (EXPEDIENTE, ORGANIZACIÓN, TIPOS)
-- Ejecutar en Supabase SQL Editor
-- =====================================================================================

-- 1. Crear tabla de Departamentos
CREATE TABLE IF NOT EXISTS public.hr_departments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Crear tabla de Cargos
CREATE TABLE IF NOT EXISTS public.hr_positions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Crear tabla de Tipos de Empleado
CREATE TABLE IF NOT EXISTS public.hr_employee_types (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    schedule_details TEXT,
    salary_details TEXT,
    benefits JSONB DEFAULT '[]'::jsonb,
    bonuses JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserciones básicas de Tipos de Empleado (Ejemplos solicitados)
INSERT INTO public.hr_employee_types (name) VALUES 
('Asociado'), ('Permanente'), ('Temporal'), ('Temporal Senior'), 
('Practicante'), ('Vacacionista'), ('Outsourcing'), ('Servicios Profesionales')
ON CONFLICT (name) DO NOTHING;

-- 4. Alterar la tabla de Empleados existente (Añadir todo el expediente)
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS fotografia_url TEXT,
ADD COLUMN IF NOT EXISTS carnet TEXT,
ADD COLUMN IF NOT EXISTS dpi TEXT,
ADD COLUMN IF NOT EXISTS nit TEXT,
ADD COLUMN IF NOT EXISTS igss TEXT,
ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
ADD COLUMN IF NOT EXISTS sexo TEXT,
ADD COLUMN IF NOT EXISTS estado_civil TEXT,
ADD COLUMN IF NOT EXISTS direccion TEXT,
ADD COLUMN IF NOT EXISTS telefono TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS contacto_emergencia JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS banco TEXT,
ADD COLUMN IF NOT EXISTS numero_cuenta TEXT,
ADD COLUMN IF NOT EXISTS tipo_pago TEXT,
ADD COLUMN IF NOT EXISTS fecha_baja DATE,
-- Relaciones con la organización y tipos
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.hr_positions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS employee_type_id UUID REFERENCES public.hr_employee_types(id) ON DELETE SET NULL;

-- 5. Vincular Cuentas del Sistema (profiles) con el Empleado
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

-- Constraint opcional: Evitar que 2 usuarios estén enlazados al mismo empleado
-- (Descomentar si es estrictamente necesario, aunque a veces un admin puede tener 2 cuentas)
-- ALTER TABLE public.profiles ADD CONSTRAINT unique_employee_profile UNIQUE (employee_id);

-- Activar RLS en las nuevas tablas
ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employee_types ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura/escritura abiertas para personal autenticado
CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.hr_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escritura a usuarios autenticados" ON public.hr_departments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.hr_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escritura a usuarios autenticados" ON public.hr_positions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.hr_employee_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escritura a usuarios autenticados" ON public.hr_employee_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- <<< END 020_hr_module_phase1.sql

-- >>> BEGIN 021_hr_erp_enterprise_policies.sql (sha256:31c2d5cf0897c3816a5b529cb0a7fd59e09cb0d4eb11b11172bb1e45af019443)
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

-- <<< END 021_hr_erp_enterprise_policies.sql

-- >>> BEGIN 022_hr_exact_timestamps.sql (sha256:ab743d07ca43d16da6c0b80089082e82dbdbc66388a2955d58c43adbd067b11c)
-- migration: 022_hr_exact_timestamps.sql
-- Descripción: Añadir estructura para precisión de segundos y copias inmutables de programación de turnos.

-- 1. Añadir columnas de programación inmutable a time_logs
ALTER TABLE time_logs
ADD COLUMN IF NOT EXISTS hora_entrada_prog TIME,
ADD COLUMN IF NOT EXISTS hora_salida_prog TIME,
ADD COLUMN IF NOT EXISTS desayuno_inicio_prog TIME,
ADD COLUMN IF NOT EXISTS desayuno_fin_prog TIME,
ADD COLUMN IF NOT EXISTS almuerzo_inicio_prog TIME,
ADD COLUMN IF NOT EXISTS almuerzo_fin_prog TIME;

-- 2. Añadir columnas de cálculos exactos en segundos (para mantener separado de la estructura vieja)
ALTER TABLE time_logs
ADD COLUMN IF NOT EXISTS estado_marcacion TEXT, -- NORMAL, TARDE, TEMPRANO, EXTRA, JUSTIFICADO
ADD COLUMN IF NOT EXISTS tiempo_laborado_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_efectivo_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_desayuno_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_almuerzo_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_fuera_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tardanza_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS salida_anticipada_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS horas_extra_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_tolerancia_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_excedido_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS segundos_justificables INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS segundos_no_justificados INT DEFAULT 0;

-- 3. Modificaremos el tipo o la aplicación insertará nuevos strings en `evento_detectado`
-- Como `evento_detectado` actualmente es un TEXT en la app (probablemente sin ENUM estricto en BD),
-- simplemente la app insertará DESAYUNO_INICIO, DESAYUNO_FIN, ALMUERZO_INICIO, ALMUERZO_FIN, SALIDA_FINAL.

-- <<< END 022_hr_exact_timestamps.sql

-- >>> BEGIN 023_hr_module_robustness.sql (sha256:197aee3d24c9f31052e67db1c76f8869c1a4444cc01cc60dc9c098813334f0a4)
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

-- <<< END 023_hr_module_robustness.sql

-- >>> BEGIN ../migration_v3.sql (sha256:6b71046a8d8e5bfdada7deba9a2f01cc029aafc85d24acd824ebfbe22af01683)
ALTER TABLE public.time_logs 
  ADD COLUMN IF NOT EXISTS minutos_extra INT DEFAULT 0;

ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS bono_metas NUMERIC(10,2) DEFAULT 0.00;

-- <<< END ../migration_v3.sql

-- >>> BEGIN ../migration_v4.sql (sha256:f729822de05c358a61d64c752047f885bb11e71b6be3b1810249e708f68f67a5)
ALTER TABLE public.time_logs 
  ADD COLUMN IF NOT EXISTS razon_tardanza TEXT;

-- <<< END ../migration_v4.sql

-- >>> BEGIN ../migration_v5.sql (sha256:d7ae982e34c2832bcde2347faced7e3533ae0af15cde563d994e0b5bfe8f1849)
ALTER TABLE public.time_logs 
  ADD COLUMN IF NOT EXISTS justificacion TEXT;

-- <<< END ../migration_v5.sql
