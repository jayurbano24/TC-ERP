-- Usuarios, roles y RLS mínima (sin PII en salida de conteos).
\set ON_ERROR_STOP on

SELECT COUNT(*) AS auth_users FROM auth.users;
SELECT COUNT(*) AS profiles FROM public.profiles;
SELECT COUNT(*) AS user_roles FROM public.user_roles;

SELECT module_name, COUNT(*) AS permission_rows
FROM public.erp_role_permissions
GROUP BY module_name
ORDER BY module_name;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('activity_costs', 'series', 'service_orders', 'domain_events')
ORDER BY tablename, policyname;
