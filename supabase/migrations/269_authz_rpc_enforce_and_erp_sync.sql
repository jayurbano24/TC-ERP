-- =============================================================================
-- 269 — Autorización RPC: enforcement real + sync enum desde permisos ERP
-- =============================================================================
-- Problema (confirmado en repo, migración 104):
--   app_assert_any_role emite RAISE WARNING [AUTHZ_RPC_LOGONLY] y CONTINÚA
--   salvo app.enforce_rpc_roles = 'on'. Las *_tx de bodega son SECURITY DEFINER
--   → bypass RLS → escrituras efectivas sin rol operacional enum.
--
-- Esta migración:
--   1) Sincroniza filas user_roles.role (enum) desde erp_role_permissions
--      (módulos Bodega/Despacho con acciones de escritura) — fuente autoritativa
--      de negocio, no basada en logs.
--   2) Invierte el default de enforcement: bloquea salvo kill-switch explícito
--      app.enforce_rpc_roles = 'off' (rollback de emergencia).
--   3) Amplía app_assert para roles admin,supervisor,bodega: también acepta
--      app_can('Bodega'|'Despacho', acción de escritura) para alinear capas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Sync enum operacional desde permisos ERP (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_sync_operational_role_from_erp_modules(
  p_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ur.user_id, 'bodega'::text AS op_role
    FROM public.user_roles ur
    INNER JOIN public.erp_role_permissions p ON p.role_id = ur.role_id
    WHERE ur.role_id IS NOT NULL
      AND (p_user_id IS NULL OR ur.user_id = p_user_id)
      AND p.module_name IN ('Bodega', 'Despacho')
      AND (
        coalesce(p.can_create, false)
        OR coalesce(p.can_edit, false)
        OR coalesce(p.can_delete, false)
        OR coalesce(p.can_approve, false)
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles x
      WHERE x.user_id = r.user_id
        AND x.role::text = r.op_role
    ) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (r.user_id, r.op_role::public.app_role);
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.app_sync_operational_role_from_erp_modules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_sync_operational_role_from_erp_modules(uuid) TO service_role;

-- Puesto RRHH (107/171) + permisos ERP de bodega/despacho
SELECT public.app_sync_operational_role_from_position(NULL) AS roles_from_position;
SELECT public.app_sync_operational_role_from_erp_modules(NULL) AS roles_from_erp_modules;

-- ---------------------------------------------------------------------------
-- 2) Helper: ¿tiene acceso de escritura a Bodega o Despacho vía erp_role_permissions?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_has_bodega_despacho_erp_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_is_admin()
    OR public.app_can('Bodega', 'create')
    OR public.app_can('Bodega', 'edit')
    OR public.app_can('Bodega', 'delete')
    OR public.app_can('Bodega', 'approve')
    OR public.app_can('Despacho', 'create')
    OR public.app_can('Despacho', 'edit')
    OR public.app_can('Despacho', 'delete')
    OR public.app_can('Despacho', 'approve');
$$;

REVOKE ALL ON FUNCTION public.app_has_bodega_despacho_erp_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_bodega_despacho_erp_write() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) app_assert_any_role — enforcement por defecto (no log-only silencioso)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_assert_any_role(VARIADIC p_roles public.app_role[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  allowed boolean := false;
  r public.app_role;
  v_requires_bodega boolean := false;
BEGIN
  IF jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF public.app_is_admin() THEN
    RETURN;
  END IF;

  FOREACH r IN ARRAY p_roles
  LOOP
    IF public.app_has_role(r) THEN
      allowed := true;
      EXIT;
    END IF;
    IF r IN ('admin'::public.app_role, 'supervisor'::public.app_role, 'bodega'::public.app_role) THEN
      v_requires_bodega := true;
    END IF;
  END LOOP;

  IF NOT allowed AND v_requires_bodega AND public.app_has_bodega_despacho_erp_write() THEN
    allowed := true;
  END IF;

  IF allowed THEN
    RETURN;
  END IF;

  -- Kill-switch de emergencia (rollback temporal): SET app.enforce_rpc_roles = 'off'
  IF coalesce(current_setting('app.enforce_rpc_roles', true), '') = 'off' THEN
    RAISE WARNING '[AUTHZ_RPC_LOGONLY] deny uid=% required=%',
      auth.uid(), p_roles;
    RETURN;
  END IF;

  RAISE EXCEPTION 'FORBIDDEN: insufficient role (required %)', p_roles
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.app_assert_any_role(public.app_role[]) IS
  '269: bloquea por defecto en RPCs con JWT de usuario. Kill-switch: app.enforce_rpc_roles=off. '
  'Roles bodega/despacho: también app_can(Bodega|Despacho, escritura).';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOWN (manual):
--   Redeploy cuerpo de 104_rpc_assert_roles_returns.sql (log-only legacy).
--   ALTER ROLE authenticator RESET app.enforce_rpc_roles;
-- =============================================================================
