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
