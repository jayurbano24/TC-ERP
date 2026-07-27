-- =============================================================================
-- 171 — Backfill rol operacional `tecnico` para puestos TECNICO*
-- =============================================================================
-- Los puestos RRHH (TECNICO JUNIOR / SENIOR / …) se guardan en user_roles.role
-- como nombre de puesto. RLS y ROLES_TALLER esperan el enum `tecnico`.
-- Re-sincroniza todos los usuarios y amplía el match a %TECNICO% / TÉCNICO.
-- =============================================================================

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
  v_pos text;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (ur.user_id) ur.user_id, hp.name AS position_name
    FROM public.user_roles ur
    JOIN public.hr_positions hp ON hp.id = ur.role_id
    WHERE (p_user_id IS NULL OR ur.user_id = p_user_id)
      AND ur.role_id IS NOT NULL
    ORDER BY ur.user_id, ur.role_id
  LOOP
    -- Normalizar acentos para match (TÉCNICO → TECNICO)
    v_pos := upper(translate(coalesce(r.position_name, ''), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'));

    v_op := CASE
      WHEN r.position_name = 'GERENTE GENERAL' THEN 'admin'
      WHEN v_pos LIKE 'SUPERVISOR%' THEN 'supervisor'
      WHEN v_pos LIKE '%GERENTE%' THEN 'gerencia'
      WHEN v_pos LIKE '%INVENTARIO%' THEN 'bodega'
      WHEN v_pos LIKE '%LOGISTIC%' THEN 'bodega'
      WHEN v_pos LIKE '%QA%' OR v_pos LIKE '%QC%' OR v_pos LIKE '%CALIDAD%' THEN 'qc'
      WHEN v_pos LIKE '%TECNICO%' OR v_pos LIKE '%REFURBISH%' THEN 'tecnico'
      WHEN v_pos LIKE 'BACKOFFICE%' THEN 'receptor_cac'
      WHEN v_pos LIKE '%CLAIMS%' THEN 'receptor_cac'
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
