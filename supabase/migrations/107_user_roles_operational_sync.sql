-- =============================================================================
-- 107 — Datos authz: diagnóstico + mapeo puesto→rol operacional (ADR-011 §11.7)
-- =============================================================================
-- NO borra filas legacy role_id NULL (load-bearing para app_has_role).
-- Añade roles operacionales faltantes según hr_positions.name (idempotente).
-- =============================================================================

CREATE OR REPLACE VIEW public.v_user_roles_authz_gaps AS
SELECT
  p.id AS user_id,
  p.email,
  p.full_name,
  coalesce(p.is_active, true) AS is_active,
  (
    SELECT hp.name
    FROM public.user_roles ur2
    JOIN public.hr_positions hp ON hp.id = ur2.role_id
    WHERE ur2.user_id = p.id AND ur2.role_id IS NOT NULL
    LIMIT 1
  ) AS position_name,
  (
    SELECT array_agg(DISTINCT ur3.role::text)
    FROM public.user_roles ur3
    WHERE ur3.user_id = p.id
  ) AS roles,
  EXISTS (
    SELECT 1 FROM public.user_roles x
    WHERE x.user_id = p.id
      AND x.role::text IN (
        'admin','supervisor','receptor_cac','receptor_px','bodega','tecnico','qc','gerencia'
      )
  ) AS has_operational_role
FROM public.profiles p;

COMMENT ON VIEW public.v_user_roles_authz_gaps IS
  'CHG-007: usuarios sin rol operacional enum — revisar antes de AUTHZ_ENFORCE';

CREATE OR REPLACE FUNCTION public.app_sync_operational_role_from_position(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_op text;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (ur.user_id) ur.user_id, hp.name AS position_name
    FROM public.user_roles ur
    JOIN public.hr_positions hp ON hp.id = ur.role_id
    WHERE (p_user_id IS NULL OR ur.user_id = p_user_id)
      AND ur.role_id IS NOT NULL
    ORDER BY ur.user_id, ur.role_id
  LOOP
    v_op := CASE
      WHEN r.position_name = 'GERENTE GENERAL' THEN 'admin'
      WHEN r.position_name ILIKE 'SUPERVISOR%' THEN 'supervisor'
      WHEN r.position_name ILIKE '%GERENTE%' THEN 'gerencia'
      WHEN r.position_name ILIKE '%INVENTARIO%' THEN 'bodega'
      WHEN r.position_name ILIKE '%LOGISTIC%' THEN 'bodega'
      WHEN r.position_name ILIKE '%QA%' OR r.position_name ILIKE '%QC%' THEN 'qc'
      WHEN r.position_name ILIKE 'TECNICO%' THEN 'tecnico'
      WHEN r.position_name ILIKE 'BACKOFFICE%' THEN 'receptor_cac'
      WHEN r.position_name ILIKE '%CLAIMS%' THEN 'receptor_cac'
      WHEN r.position_name ILIKE '%REFURBISH%' THEN 'tecnico'
      ELSE NULL
    END;

    IF v_op IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles x
      WHERE x.user_id = r.user_id AND x.role::text = v_op
    ) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (r.user_id, v_op::public.app_role);
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.app_sync_operational_role_from_position(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_sync_operational_role_from_position(uuid) TO service_role;

SELECT public.app_sync_operational_role_from_position(NULL) AS roles_inserted;

NOTIFY pgrst, 'reload schema';

-- Diagnóstico:
--   SELECT * FROM public.v_user_roles_authz_gaps WHERE NOT has_operational_role;
-- =============================================================================
