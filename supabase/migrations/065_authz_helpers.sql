-- =============================================================================
-- 065 — Helpers de autorización RLS-first (modelo basado en hr_positions)
-- =============================================================================
-- Contexto (verificado contra la BD viva):
--   * El MAESTRO de roles es `public.hr_positions` (NO existe `erp_roles`).
--   * `public.erp_role_permissions.role_id` -> `hr_positions.id` (FK real).
--   * `public.user_roles(user_id, role text, role_id uuid->hr_positions.id)`
--     asocia cada usuario a su puesto. Pueden existir filas legacy con
--     role_id NULL (mecanismo enum `app_has_role`); aquí solo consideramos
--     filas con role_id válido.
--
-- Decisión de negocio (ADR-011): el puesto 'GERENTE GENERAL' es ADMIN total.
--
-- Estos helpers son ADITIVOS: no modifican ninguna política existente y no
-- cambian el comportamiento hasta que una política los invoque (Commit 3).
-- Patrón Supabase: SECURITY DEFINER + search_path fijo para que su lectura
-- interna de tablas con RLS no provoque recursión de políticas.
--
-- Idempotente: create or replace + revoke/grant repetibles.
-- Reversa: ver bloque "DOWN" al final.
-- =============================================================================

-- Puesto (role_id) del usuario actual, ignorando filas legacy sin role_id.
create or replace function public.app_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ur.role_id
  from public.user_roles ur
  where ur.user_id = auth.uid()
    and ur.role_id is not null
  limit 1;
$$;

-- Admin total por puesto: GERENTE GENERAL.
create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.hr_positions hp on hp.id = ur.role_id
    where ur.user_id = auth.uid()
      and hp.name = 'GERENTE GENERAL'
  );
$$;

-- ¿El usuario actual puede ejecutar `p_action` sobre `p_module`?
-- Acciones válidas: view, create, edit, delete, approve, export.
create or replace function public.app_can(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_is_admin() or exists (
    select 1
    from public.erp_role_permissions p
    where p.role_id = public.app_role_id()
      and p.module_name = p_module
      and case lower(p_action)
            when 'view'    then p.can_view
            when 'create'  then p.can_create
            when 'edit'    then p.can_edit
            when 'delete'  then p.can_delete
            when 'approve' then p.can_approve
            when 'export'  then p.can_export
            else false
          end
  );
$$;

-- Atajo de lectura: ¿puede VER el módulo? (equivale a app_can(module,'view')).
create or replace function public.app_has_permission(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_can(p_module, 'view');
$$;

-- Exponer solo a los roles de la app.
revoke all on function public.app_role_id()                from public;
revoke all on function public.app_is_admin()               from public;
revoke all on function public.app_can(text, text)          from public;
revoke all on function public.app_has_permission(text)     from public;

grant execute on function public.app_role_id()             to authenticated, service_role;
grant execute on function public.app_is_admin()            to authenticated, service_role;
grant execute on function public.app_can(text, text)       to authenticated, service_role;
grant execute on function public.app_has_permission(text)  to authenticated, service_role;

-- =============================================================================
-- DOWN (rollback) — ejecutar solo para revertir esta migración:
-- -----------------------------------------------------------------------------
-- drop function if exists public.app_has_permission(text);
-- drop function if exists public.app_can(text, text);
-- drop function if exists public.app_is_admin();
-- drop function if exists public.app_role_id();
-- =============================================================================
