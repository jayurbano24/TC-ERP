-- Migration para la tabla activity_costs

CREATE TABLE IF NOT EXISTS activity_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  cost numeric(10,2) NOT NULL DEFAULT 0.00,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insertar actividades por defecto si no existen
INSERT INTO activity_costs (name, cost, description)
VALUES 
  ('Recepción', 0.50, 'Costo por equipo recepcionado y clasificado'),
  ('Diagnóstico', 1.00, 'Costo por revisión técnica y diagnóstico'),
  ('Limpieza', 0.75, 'Costo por limpieza y sanitización de equipos'),
  ('Pruebas', 0.80, 'Costo por pruebas de estrés y validación'),
  ('Reparación', 5.00, 'Costo estándar por equipo reparado'),
  ('Cosmética', 1.50, 'Costo por pintura y cambio de carcasas'),
  ('Empaque', 0.60, 'Costo por empaquetado, caja y accesorios')
ON CONFLICT (name) DO NOTHING;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_activity_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_activity_costs_timestamp ON activity_costs;
CREATE TRIGGER update_activity_costs_timestamp
BEFORE UPDATE ON activity_costs
FOR EACH ROW
EXECUTE FUNCTION update_activity_costs_updated_at();

-- Habilitar RLS y Políticas (ajustar según el proyecto, aquí lo dejamos público para lectura/escritura en ERP interno)
ALTER TABLE activity_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir select en activity_costs para todos" ON activity_costs FOR SELECT USING (true);
CREATE POLICY "Permitir insert en activity_costs para todos" ON activity_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update en activity_costs para todos" ON activity_costs FOR UPDATE USING (true);
CREATE POLICY "Permitir delete en activity_costs para todos" ON activity_costs FOR DELETE USING (true);
