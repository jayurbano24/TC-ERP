-- 1. Tabla de Roles Maestros
CREATE TABLE IF NOT EXISTS erp_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Permisos por Rol
CREATE TABLE IF NOT EXISTS erp_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES erp_roles(id) ON DELETE CASCADE,
    module_name VARCHAR(100) NOT NULL,
    can_view BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_approve BOOLEAN DEFAULT false,
    can_export BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, module_name)
);

-- 3. Tabla de Seguridad de Usuario
CREATE TABLE IF NOT EXISTS erp_user_security (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    force_pwd_change BOOLEAN DEFAULT false,
    require_2fa BOOLEAN DEFAULT false,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    allowed_ips JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Actualizar tabla user_roles para usar UUID opcionalmente
-- Como user_roles actualmente usa un campo "role" de tipo VARCHAR,
-- añadiremos la columna role_id para migrar a modelo relacional.
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES erp_roles(id) ON DELETE SET NULL;

-- ==========================================
-- SCRIPT DE MIGRACIÓN DE DATOS (AUTO-SEMILLA)
-- ==========================================

-- 5. Insertar roles estándar del ERP si no existen
INSERT INTO erp_roles (name, description, is_system) VALUES 
('Administrador', 'Control total del sistema y seguridad.', true),
('Supervisor', 'Gestión de operaciones y reportes consolidados.', true),
('Backoffice', 'Procesamiento de órdenes, series y auditorías de inventario.', true),
('Técnico', 'Reparación de equipos y actualización de diagnósticos.', true),
('Logística', 'Manejo de despachos, rutas y transferencias.', true),
('Inventario', 'Control de bodega y conteos cíclicos.', true),
('Consulta', 'Acceso de solo lectura al sistema.', true),
('Operador', 'Operaciones básicas de piso.', true)
ON CONFLICT (name) DO NOTHING;

-- 6. Migrar roles de texto de usuarios a UUID
UPDATE user_roles ur
SET role_id = er.id
FROM erp_roles er
WHERE ur.role::text = er.name
AND ur.role_id IS NULL;

-- 7. Sembrar permisos básicos (Opcional, pero recomendado)
-- El Administrador tiene todo habilitado por defecto
INSERT INTO erp_role_permissions (role_id, module_name, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT 
    er.id,
    module,
    true, true, true, true, true, true
FROM erp_roles er
CROSS JOIN (
    VALUES ('Dashboard'), ('Recepción'), ('Diagnóstico'), ('Reparación'), ('Inventario'), ('Logística'), ('Garantías'), ('Compras'), ('Reportes'), ('Clientes'), ('Usuarios'), ('Configuración')
) AS modules(module)
WHERE er.name = 'Administrador'
ON CONFLICT (role_id, module_name) DO NOTHING;

-- 8. Configurar RLS (Row Level Security)
ALTER TABLE erp_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_user_security ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT a todos los autenticados para roles y permisos
CREATE POLICY "Permitir select roles" ON erp_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir select permisos" ON erp_role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir select user_security" ON erp_user_security FOR SELECT TO authenticated USING (true);

-- Permitir INSERT/UPDATE/DELETE (Solo administradores deberían poder hacerlo en un entorno real,
-- por ahora lo dejaremos publico internamente para facilidad de desarrollo, el Frontend bloquea si no es Admin)
CREATE POLICY "Permitir full access roles" ON erp_roles FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir full access permisos" ON erp_role_permissions FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir full access user_security" ON erp_user_security FOR ALL TO authenticated USING (true);

-- 9. Trigger para updated_at en erp_roles
CREATE OR REPLACE FUNCTION update_erp_roles_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_erp_roles_timestamp ON erp_roles;
CREATE TRIGGER update_erp_roles_timestamp BEFORE UPDATE ON erp_roles
FOR EACH ROW EXECUTE FUNCTION update_erp_roles_updated_at();

-- 10. Trigger para updated_at en erp_role_permissions
CREATE OR REPLACE FUNCTION update_erp_role_permissions_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_erp_role_permissions_timestamp ON erp_role_permissions;
CREATE TRIGGER update_erp_role_permissions_timestamp BEFORE UPDATE ON erp_role_permissions
FOR EACH ROW EXECUTE FUNCTION update_erp_role_permissions_updated_at();

-- 11. Trigger para updated_at en erp_user_security
CREATE OR REPLACE FUNCTION update_erp_user_security_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_erp_user_security_timestamp ON erp_user_security;
CREATE TRIGGER update_erp_user_security_timestamp BEFORE UPDATE ON erp_user_security
FOR EACH ROW EXECUTE FUNCTION update_erp_user_security_updated_at();
