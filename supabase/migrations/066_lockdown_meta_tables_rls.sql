-- =============================================================================
-- 066 — Cierre de huecos de escalada de privilegios en tablas meta/seguridad
-- =============================================================================
-- Requiere: 065_authz_helpers.sql (usa public.app_is_admin()).
--
-- Hallazgo (introspección de políticas vivas):
--   * erp_role_permissions: "Permitir full access permisos" = ALL a {authenticated}
--     USING true  -> CUALQUIER usuario autenticado puede REESCRIBIR la matriz de
--     permisos vía REST directo. Esto anula por completo el RBAC.
--   * erp_user_security: "Permitir full access user_security" = ALL a {authenticated}
--     USING true  -> cualquier autenticado lee/edita la seguridad de TODOS.
--   * hr_positions (maestro de roles): escritura ALL a {authenticated} USING true
--     -> cualquier autenticado puede crear/editar/borrar puestos.
--
-- La UI de administración escribe estas tablas vía SERVICE ROLE (getAdminClient,
-- server-side), que IGNORA RLS; por tanto endurecer la escritura a admin NO la
-- rompe. La lectura anónima ya devuelve 0 filas (verificado), así que tampoco
-- se pierde funcionalidad.
--
-- Cambios:
--   * Lectura: se mantiene para autenticados (en user_security, solo propia o admin).
--   * Escritura (insert/update/delete): solo app_is_admin() (GERENTE GENERAL).
--   * service_role sigue teniendo bypass total de RLS (no requiere política).
--
-- Reversible: ver bloque DOWN al final.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- erp_role_permissions
-- ---------------------------------------------------------------------------
alter table public.erp_role_permissions enable row level security;

drop policy if exists "Permitir full access permisos" on public.erp_role_permissions;
drop policy if exists "Permitir select permisos"      on public.erp_role_permissions;

create policy erp_role_permissions_read
  on public.erp_role_permissions for select to authenticated
  using (true);

create policy erp_role_permissions_admin_insert
  on public.erp_role_permissions for insert to authenticated
  with check (public.app_is_admin());

create policy erp_role_permissions_admin_update
  on public.erp_role_permissions for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

create policy erp_role_permissions_admin_delete
  on public.erp_role_permissions for delete to authenticated
  using (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- erp_user_security  (lectura restringida a uno mismo o admin)
-- ---------------------------------------------------------------------------
alter table public.erp_user_security enable row level security;

drop policy if exists "Permitir full access user_security" on public.erp_user_security;
drop policy if exists "Permitir select user_security"      on public.erp_user_security;

create policy erp_user_security_read_self_or_admin
  on public.erp_user_security for select to authenticated
  using (user_id = auth.uid() or public.app_is_admin());

create policy erp_user_security_admin_insert
  on public.erp_user_security for insert to authenticated
  with check (public.app_is_admin());

create policy erp_user_security_admin_update
  on public.erp_user_security for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

create policy erp_user_security_admin_delete
  on public.erp_user_security for delete to authenticated
  using (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- hr_positions  (maestro de roles; lectura amplia para selects/dropdowns)
-- ---------------------------------------------------------------------------
alter table public.hr_positions enable row level security;

drop policy if exists "Permitir escritura a usuarios"             on public.hr_positions;
drop policy if exists "Permitir escritura a usuarios autenticados" on public.hr_positions;
drop policy if exists "Permitir lectura a usuarios"               on public.hr_positions;
drop policy if exists "Permitir lectura a usuarios autenticados"   on public.hr_positions;

create policy hr_positions_read
  on public.hr_positions for select to authenticated
  using (true);

create policy hr_positions_admin_insert
  on public.hr_positions for insert to authenticated
  with check (public.app_is_admin());

create policy hr_positions_admin_update
  on public.hr_positions for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

create policy hr_positions_admin_delete
  on public.hr_positions for delete to authenticated
  using (public.app_is_admin());

-- =============================================================================
-- DOWN (rollback) — restaura las políticas permisivas originales:
-- -----------------------------------------------------------------------------
-- -- erp_role_permissions
-- drop policy if exists erp_role_permissions_read           on public.erp_role_permissions;
-- drop policy if exists erp_role_permissions_admin_insert   on public.erp_role_permissions;
-- drop policy if exists erp_role_permissions_admin_update   on public.erp_role_permissions;
-- drop policy if exists erp_role_permissions_admin_delete   on public.erp_role_permissions;
-- create policy "Permitir full access permisos" on public.erp_role_permissions for all to authenticated using (true);
-- create policy "Permitir select permisos"      on public.erp_role_permissions for select to authenticated using (true);
--
-- -- erp_user_security
-- drop policy if exists erp_user_security_read_self_or_admin on public.erp_user_security;
-- drop policy if exists erp_user_security_admin_insert       on public.erp_user_security;
-- drop policy if exists erp_user_security_admin_update       on public.erp_user_security;
-- drop policy if exists erp_user_security_admin_delete       on public.erp_user_security;
-- create policy "Permitir full access user_security" on public.erp_user_security for all to authenticated using (true);
-- create policy "Permitir select user_security"      on public.erp_user_security for select to authenticated using (true);
--
-- -- hr_positions
-- drop policy if exists hr_positions_read         on public.hr_positions;
-- drop policy if exists hr_positions_admin_insert on public.hr_positions;
-- drop policy if exists hr_positions_admin_update on public.hr_positions;
-- drop policy if exists hr_positions_admin_delete on public.hr_positions;
-- create policy "Permitir lectura a usuarios"               on public.hr_positions for select to authenticated using (true);
-- create policy "Permitir lectura a usuarios autenticados"   on public.hr_positions for select to authenticated using (true);
-- create policy "Permitir escritura a usuarios"             on public.hr_positions for all to authenticated using (true) with check (true);
-- create policy "Permitir escritura a usuarios autenticados" on public.hr_positions for all to authenticated using (true) with check (true);
-- =============================================================================
