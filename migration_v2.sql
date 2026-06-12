-- MIGRACIÓN PARA HORARIOS DINÁMICOS
-- 1. Vaciar temporalmente las tablas dependientes (solo para entorno de desarrollo)
DELETE FROM public.time_logs;
DELETE FROM public.employees;
DELETE FROM public.company_shifts;

-- 2. Modificar la estructura de company_shifts
ALTER TABLE public.company_shifts 
  DROP COLUMN IF EXISTS dias_laborables,
  DROP COLUMN IF EXISTS hora_entrada,
  DROP COLUMN IF EXISTS hora_salida,
  DROP COLUMN IF EXISTS tolerancia_minutos,
  DROP COLUMN IF EXISTS refaccion_inicio,
  DROP COLUMN IF EXISTS refaccion_fin,
  DROP COLUMN IF EXISTS almuerzo_inicio,
  DROP COLUMN IF EXISTS almuerzo_fin;

-- 3. Añadir la nueva columna dinámica
ALTER TABLE public.company_shifts 
  ADD COLUMN IF NOT EXISTS weekly_schedule JSONB NOT NULL DEFAULT '{}'::jsonb;
