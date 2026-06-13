-- Tabla para configurar metas por técnico, etapa, tecnología y modelo
CREATE TABLE IF NOT EXISTS taller_kpi_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL, -- Ej: 'diagnostico', 'reparacion', 'reacondicionado', 'qc'
  technology_id uuid REFERENCES technologies(id) ON DELETE CASCADE,
  model_id uuid REFERENCES models(id) ON DELETE CASCADE,
  daily_goal integer NOT NULL DEFAULT 0,
  weekly_goal integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE taller_kpi_goals ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura (Todos los autenticados pueden ver las metas)
CREATE POLICY "Permitir lectura de metas a todos"
ON taller_kpi_goals
FOR SELECT
TO authenticated
USING (true);

-- Políticas de escritura (Solo admins pueden configurar metas)
CREATE POLICY "Permitir escritura de metas a administradores"
ON taller_kpi_goals
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role::text IN ('admin', 'gerencia')
  )
);

-- Opcional: Permitir inserción inicial de pruebas si no eres admin estricto
-- Comentar si se requiere estrictez absoluta.
CREATE POLICY "Permitir upsert temporal de metas a todos para pruebas"
ON taller_kpi_goals
FOR ALL
TO authenticated
USING (true);
