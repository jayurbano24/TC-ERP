-- 152: Alinear hr_policies_versions con el frontend (evita 42703 "column hr_p…").
-- Causa típica: select pedía change_summary / created_by_name ausentes.
-- Además: el kiosko (rol anon) necesita SELECT de settings.
-- Idempotente: aplicar en SQL Editor.

CREATE TABLE IF NOT EXISTS public.hr_policies_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by_name text,
  change_summary text
);

ALTER TABLE public.hr_policies_versions
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS change_summary text;

ALTER TABLE public.hr_policies_versions ENABLE ROW LEVEL SECURITY;

-- Kiosko (anon): solo lectura. Escritura sigue en hr_policies_versions_write_admin (mig 110).
DROP POLICY IF EXISTS hr_policies_versions_read_anon ON public.hr_policies_versions;
CREATE POLICY hr_policies_versions_read_anon ON public.hr_policies_versions
  FOR SELECT TO anon
  USING (true);

GRANT SELECT ON public.hr_policies_versions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.hr_policies_versions TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
