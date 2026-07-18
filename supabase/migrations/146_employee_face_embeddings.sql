-- =============================================================================
-- 146 — Biometría InsightFace: embeddings independientes + logs de reconocimiento
-- =============================================================================
-- Reemplaza el uso de employees.face_embedding (JSONB legacy).
-- Matching client-side (ONNX); estas tablas son la fuente de verdad biométrica.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- employee_face_embeddings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_face_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  embedding real[] NOT NULL,
  pose text NOT NULL,
  quality numeric(5,2) NOT NULL,
  brightness numeric,
  sharpness numeric,
  contrast numeric,
  face_size numeric,
  tilt numeric,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT employee_face_embeddings_quality_range CHECK (quality >= 0 AND quality <= 100),
  CONSTRAINT employee_face_embeddings_pose_nonempty CHECK (char_length(trim(pose)) > 0),
  CONSTRAINT employee_face_embeddings_model_nonempty CHECK (char_length(trim(model)) > 0),
  CONSTRAINT employee_face_embeddings_dim_512 CHECK (cardinality(embedding) = 512)
);

CREATE INDEX IF NOT EXISTS idx_employee_face_embeddings_employee_active
  ON public.employee_face_embeddings (employee_id, active);

CREATE INDEX IF NOT EXISTS idx_employee_face_embeddings_employee_model_active
  ON public.employee_face_embeddings (employee_id, model, active);

CREATE INDEX IF NOT EXISTS idx_employee_face_embeddings_model
  ON public.employee_face_embeddings (model);

COMMENT ON TABLE public.employee_face_embeddings IS
  'Embeddings ArcFace (512-d) por captura. Un empleado puede tener 15–20+ filas activas.';
COMMENT ON COLUMN public.employee_face_embeddings.model IS
  'Versión exacta del motor, p.ej. ArcFace-Buffalo-SC, ArcFace-Mobile-v2.';
COMMENT ON COLUMN public.employee_face_embeddings.pose IS
  'Pose guiada: FRONT, LEFT, RIGHT, UP, DOWN, NEUTRAL, SMILE, LIGHT_VAR_*, DISTANCE_*.';

-- ---------------------------------------------------------------------------
-- face_recognition_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.face_recognition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  result text NOT NULL,
  confidence numeric,
  distance numeric,
  duration_ms integer,
  tablet_id text,
  reject_reason text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT face_recognition_logs_result_check CHECK (
    result IN ('MATCH', 'REJECT', 'QUALITY_FAIL', 'NO_FACE', 'MULTI_FACE', 'ERROR')
  )
);

CREATE INDEX IF NOT EXISTS idx_face_recognition_logs_created
  ON public.face_recognition_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_face_recognition_logs_employee_created
  ON public.face_recognition_logs (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_face_recognition_logs_result_created
  ON public.face_recognition_logs (result, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_face_recognition_logs_tablet_created
  ON public.face_recognition_logs (tablet_id, created_at DESC);

COMMENT ON TABLE public.face_recognition_logs IS
  'Telemetría de intentos de reconocimiento para calibración y diagnóstico.';

-- ---------------------------------------------------------------------------
-- Legacy: dejar de usar employees.face_embedding
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'face_embedding'
  ) THEN
    COMMENT ON COLUMN public.employees.face_embedding IS
      'DEPRECATED — usar employee_face_embeddings. Se eliminará en migración posterior.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Grants + RLS (kiosco usa anon key; RRHH usa authenticated)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_face_embeddings TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.face_recognition_logs TO anon, authenticated, service_role;
GRANT SELECT, UPDATE, DELETE ON public.face_recognition_logs TO authenticated, service_role;

ALTER TABLE public.employee_face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_recognition_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_face_embeddings_select ON public.employee_face_embeddings;
DROP POLICY IF EXISTS employee_face_embeddings_insert ON public.employee_face_embeddings;
DROP POLICY IF EXISTS employee_face_embeddings_update ON public.employee_face_embeddings;
DROP POLICY IF EXISTS employee_face_embeddings_delete ON public.employee_face_embeddings;

CREATE POLICY employee_face_embeddings_select ON public.employee_face_embeddings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY employee_face_embeddings_insert ON public.employee_face_embeddings
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY employee_face_embeddings_update ON public.employee_face_embeddings
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY employee_face_embeddings_delete ON public.employee_face_embeddings
  FOR DELETE TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS face_recognition_logs_select ON public.face_recognition_logs;
DROP POLICY IF EXISTS face_recognition_logs_insert ON public.face_recognition_logs;
DROP POLICY IF EXISTS face_recognition_logs_update ON public.face_recognition_logs;
DROP POLICY IF EXISTS face_recognition_logs_delete ON public.face_recognition_logs;

CREATE POLICY face_recognition_logs_select ON public.face_recognition_logs
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY face_recognition_logs_insert ON public.face_recognition_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY face_recognition_logs_update ON public.face_recognition_logs
  FOR UPDATE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
  );

CREATE POLICY face_recognition_logs_delete ON public.face_recognition_logs
  FOR DELETE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
  );
