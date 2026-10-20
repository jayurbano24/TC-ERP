-- Promovido desde create_erp_audit_logs.sql (nombre no válido para Supabase CLI).
-- Requerido antes de 035_digital_twin_operational_model (timeline).

DO $$ BEGIN
  CREATE TYPE public.audit_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.erp_audit_logs CASCADE;

CREATE TABLE public.erp_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role varchar(50),
  branch_id varchar(100),
  module varchar(100) NOT NULL,
  table_name varchar(100) NOT NULL,
  record_id varchar(255) NOT NULL,
  action varchar(50) NOT NULL,
  severity public.audit_severity DEFAULT 'INFO',
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  observations text
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.erp_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module_action ON public.erp_audit_logs (module, action);
CREATE INDEX IF NOT EXISTS idx_audit_record ON public.erp_audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_jsonb_search_new ON public.erp_audit_logs USING gin (new_values);
CREATE INDEX IF NOT EXISTS idx_audit_jsonb_search_old ON public.erp_audit_logs USING gin (old_values);

ALTER TABLE public.erp_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir insert a usuarios autenticados" ON public.erp_audit_logs;
CREATE POLICY "Permitir insert a usuarios autenticados" ON public.erp_audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir select a todos" ON public.erp_audit_logs;
CREATE POLICY "Permitir select a todos" ON public.erp_audit_logs
  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.log_advanced_audit(
  p_user_id uuid,
  p_user_role varchar,
  p_branch_id varchar,
  p_module varchar,
  p_table_name varchar,
  p_record_id varchar,
  p_action varchar,
  p_severity public.audit_severity,
  p_old_values jsonb,
  p_new_values jsonb,
  p_ip_address inet,
  p_user_agent text,
  p_observations text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.erp_audit_logs (
    user_id, user_role, branch_id, module, table_name, record_id, action,
    severity, old_values, new_values, ip_address, user_agent, observations
  ) VALUES (
    p_user_id, p_user_role, p_branch_id, p_module, p_table_name, p_record_id, p_action,
    p_severity, p_old_values, p_new_values, p_ip_address, p_user_agent, p_observations
  ) RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;
