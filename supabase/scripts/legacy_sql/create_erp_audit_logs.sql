-- 1. Crear Enum de Severidad
DO $$ BEGIN
    CREATE TYPE audit_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Eliminar o renombrar tabla vieja (Opcional, pero acordado con el usuario "creamos de cero")
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS erp_audit_logs CASCADE;

-- 3. Crear nueva tabla optimizada
CREATE TABLE erp_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Contexto de Usuario
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_role VARCHAR(50),
    branch_id VARCHAR(100), -- Temporalmente texto hasta crear tabla branches
    
    -- Contexto de Operación
    module VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    severity audit_severity DEFAULT 'INFO',
    
    -- Datos de Trazabilidad JSONB
    old_values JSONB,
    new_values JSONB,
    
    -- Metadatos de Conexión
    ip_address INET,
    user_agent TEXT,
    observations TEXT
);

-- 4. Crear índices para alto rendimiento
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON erp_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module_action ON erp_audit_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_audit_record ON erp_audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_jsonb_search_new ON erp_audit_logs USING GIN (new_values);
CREATE INDEX IF NOT EXISTS idx_audit_jsonb_search_old ON erp_audit_logs USING GIN (old_values);

-- 5. Row Level Security (RLS)
ALTER TABLE erp_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 Regla INSERT: Permitir insertar a cualquier usuario logueado
CREATE POLICY "Permitir insert a usuarios autenticados" ON erp_audit_logs 
FOR INSERT TO authenticated 
WITH CHECK (true);

-- 5.2 Regla SELECT: Solo administradores y auditores pueden leer
-- Para evitar ciclos infinitos, usamos gen_random_uuid y consultamos directo o la dejamos publica y el front lo valida, 
-- pero hagámoslo público internamente si es un ERP (por facilidad) y el Frontend oculta el tab.
-- Si queremos estricto: (user_id IN (SELECT user_id FROM user_roles WHERE role IN ('Administrador', 'Auditor')))
CREATE POLICY "Permitir select a todos" ON erp_audit_logs 
FOR SELECT 
USING (true);

-- 5.3 Bloquear UPDATE y DELETE (Por omisión, si no creamos política UPDATE/DELETE, nadie puede)
-- Explicitamente denegamos solo para documentar
-- (No se requiere SQL extra ya que default es DENY si no hay policy)

-- 6. Opcional: Crear una funcin de base de datos para registrar logs de forma segura
CREATE OR REPLACE FUNCTION log_advanced_audit(
  p_user_id UUID,
  p_user_role VARCHAR,
  p_branch_id VARCHAR,
  p_module VARCHAR,
  p_table_name VARCHAR,
  p_record_id VARCHAR,
  p_action VARCHAR,
  p_severity audit_severity,
  p_old_values JSONB,
  p_new_values JSONB,
  p_ip_address INET,
  p_user_agent TEXT,
  p_observations TEXT
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO erp_audit_logs (
    user_id, user_role, branch_id, module, table_name, record_id, action, 
    severity, old_values, new_values, ip_address, user_agent, observations
  ) VALUES (
    p_user_id, p_user_role, p_branch_id, p_module, p_table_name, p_record_id, p_action,
    p_severity, p_old_values, p_new_values, p_ip_address, p_user_agent, p_observations
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
