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
