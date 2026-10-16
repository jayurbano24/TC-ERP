-- =============================================================================
-- Solo lectura — investigación AUTHZ_RPC_LOGONLY (ejecutar en SQL Editor)
-- =============================================================================
-- Sustituya los UUID en :user_ids por los del CSV (01000 / deny).
-- =============================================================================

-- Definición desplegada de app_assert_any_role (¿enforce o log-only?)
SELECT pg_get_functiondef(p.oid) AS app_assert_any_role_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'app_assert_any_role';

-- Rol enforce global PostgREST (vacío = default según migración aplicada)
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolname = 'authenticator';

-- Perfil + gaps operacionales (vista 107)
SELECT *
FROM public.v_user_roles_authz_gaps
WHERE user_id IN (
  '0b92199f-fab9-479c-bb94-38849438192b'::uuid,
  '1eafbd54-4bd1-4df0-9682-571c99cb5c0f'::uuid,
  '0df03d71-36cb-4c26-b36d-79aff900ec80'::uuid
);

-- Filas user_roles (enum + puesto RRHH)
SELECT
  ur.user_id,
  p.email,
  p.full_name,
  coalesce(p.is_active, true) AS is_active,
  ur.id AS user_role_row_id,
  ur.role::text AS enum_role,
  ur.role_id,
  hp.name AS position_name
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
LEFT JOIN public.hr_positions hp ON hp.id = ur.role_id
WHERE ur.user_id IN (
  '0b92199f-fab9-479c-bb94-38849438192b'::uuid,
  '1eafbd54-4bd1-4df0-9682-571c99cb5c0f'::uuid,
  '0df03d71-36cb-4c26-b36d-79aff900ec80'::uuid
)
ORDER BY p.email, ur.role::text;

-- Permisos ERP por módulo (fuente UX / app_can)
SELECT
  p.email,
  hp.name AS position_name,
  perm.module_name,
  perm.can_view,
  perm.can_create,
  perm.can_edit,
  perm.can_delete,
  perm.can_approve,
  perm.can_export
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
JOIN public.hr_positions hp ON hp.id = ur.role_id
JOIN public.erp_role_permissions perm ON perm.role_id = ur.role_id
WHERE ur.user_id IN (
  '0b92199f-fab9-479c-bb94-38849438192b'::uuid,
  '1eafbd54-4bd1-4df0-9682-571c99cb5c0f'::uuid,
  '0df03d71-36cb-4c26-b36d-79aff900ec80'::uuid
)
  AND ur.role_id IS NOT NULL
ORDER BY p.email, perm.module_name;

-- Enum operacional vs permiso ERP (NO usar app_can() aquí: auth.uid() es NULL en SQL Editor)
SELECT
  p.email,
  EXISTS (
    SELECT 1 FROM public.user_roles x
    WHERE x.user_id = p.id AND x.role::text = 'bodega'
  ) AS has_bodega_enum,
  EXISTS (
    SELECT 1 FROM public.user_roles x
    WHERE x.user_id = p.id AND x.role::text IN ('admin', 'supervisor')
  ) AS has_admin_or_supervisor_enum,
  EXISTS (
    SELECT 1 FROM public.user_roles x
    WHERE x.user_id = p.id AND x.role::text = 'receptor_cac'
  ) AS has_receptor_cac_enum,
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.erp_role_permissions perm ON perm.role_id = ur.role_id
    WHERE ur.user_id = p.id
      AND ur.role_id IS NOT NULL
      AND perm.module_name IN ('Bodega', 'Despacho')
      AND (
        coalesce(perm.can_create, false)
        OR coalesce(perm.can_edit, false)
        OR coalesce(perm.can_delete, false)
        OR coalesce(perm.can_approve, false)
      )
  ) AS erp_bodega_despacho_write
FROM public.profiles p
WHERE p.email IN (
  'asamayoa@techcorps.com',
  'jrodriguez@techcorps.com',
  'rpineda@techcorps.com'
);

-- Tras aplicar migración 269 (o solo el sync), verificar filas insertadas:
-- SELECT public.app_sync_operational_role_from_erp_modules(NULL);
-- Repetir la consulta anterior: has_bodega_enum debe ser true si erp_bodega_despacho_write es true.

-- RPCs bodega expuestas a authenticated (superficie browser)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%app_assert_any_role%admin%s supervisor% bodega%'
ORDER BY p.proname;
