-- RBAC operativo (modelo vivo): hr_positions + erp_role_permissions.
-- Orden lex: después de 053_* y antes de 054_nav_reportes_permissions.

CREATE TABLE IF NOT EXISTS public.hr_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hr_positions (name, description)
VALUES
  ('Administrador', 'Control total del sistema'),
  ('Supervisor', 'Gestión de operaciones'),
  ('GERENTE GENERAL', 'Admin total (ADR-011)'),
  ('GERENTE', 'Gerencia operativa'),
  ('SUPER ADMIN', 'Super administrador')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.erp_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.hr_positions(id) ON DELETE CASCADE,
  module_name varchar(100) NOT NULL,
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_approve boolean DEFAULT false,
  can_export boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (role_id, module_name)
);

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.hr_positions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.erp_user_security (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  force_pwd_change boolean DEFAULT false,
  require_2fa boolean DEFAULT false,
  failed_attempts integer DEFAULT 0,
  locked_until timestamptz,
  allowed_ips jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.erp_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_user_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_positions ENABLE ROW LEVEL SECURITY;
