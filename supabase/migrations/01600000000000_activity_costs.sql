-- Promovido desde create_activity_costs_table.sql (nombre inválido para Supabase CLI).
-- Catálogo operativo KPI/costos; RLS operacional en 105_rls_phase_b_remaining_tables.

CREATE TABLE IF NOT EXISTS public.activity_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  cost numeric(10, 2) NOT NULL DEFAULT 0.00,
  description text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.activity_costs (name, cost, description)
VALUES
  ('Recepción', 0.50, 'Costo por equipo recepcionado y clasificado'),
  ('Diagnóstico', 1.00, 'Costo por revisión técnica y diagnóstico'),
  ('Limpieza', 0.75, 'Costo por limpieza y sanitización de equipos'),
  ('Pruebas', 0.80, 'Costo por pruebas de estrés y validación'),
  ('Reparación', 5.00, 'Costo estándar por equipo reparado'),
  ('Cosmética', 1.50, 'Costo por pintura y cambio de carcasas'),
  ('Empaque', 0.60, 'Costo por empaquetado, caja y accesorios')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_activity_costs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_activity_costs_timestamp ON public.activity_costs;
CREATE TRIGGER update_activity_costs_timestamp
  BEFORE UPDATE ON public.activity_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_activity_costs_updated_at();
