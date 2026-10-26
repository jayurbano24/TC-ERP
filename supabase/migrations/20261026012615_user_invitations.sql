-- =============================================================================
-- Invitaciones de acceso TC-ERP (control operativo, sin marca de proveedor Auth)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role_id uuid,
  role_name text,
  employee_id uuid,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'linked_existing', 'failed', 'revoked', 'resent')),
  redirect_base text,
  last_error text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  accepted_at timestamptz,
  last_sent_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx
  ON public.user_invitations (lower(email));

CREATE INDEX IF NOT EXISTS user_invitations_status_created_idx
  ON public.user_invitations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_invitations_invited_by_idx
  ON public.user_invitations (invited_by);

COMMENT ON TABLE public.user_invitations IS
  'Registro operativo de invitaciones de acceso enviadas desde Seguridad.';

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_admin_all ON public.user_invitations;
CREATE POLICY user_invitations_admin_all ON public.user_invitations
  FOR ALL TO authenticated
  USING (
    public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  )
  WITH CHECK (
    public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO authenticated, service_role;
