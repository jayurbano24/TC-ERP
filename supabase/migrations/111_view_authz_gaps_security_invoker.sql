-- =============================================================================
-- 111 — Vista authz gaps: SECURITY INVOKER (cierra ERROR advisor)
-- =============================================================================
-- Supabase linter 0010: v_user_roles_authz_gaps heredó privilegios del owner.
-- Recrear con security_invoker=true para respetar RLS del caller.
-- =============================================================================

DROP VIEW IF EXISTS public.v_user_roles_authz_gaps;

CREATE VIEW public.v_user_roles_authz_gaps
WITH (security_invoker = true)
AS
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
  'CHG-007/111: gaps authz — security_invoker (RLS del caller)';

REVOKE ALL ON public.v_user_roles_authz_gaps FROM PUBLIC, anon;
GRANT SELECT ON public.v_user_roles_authz_gaps TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
